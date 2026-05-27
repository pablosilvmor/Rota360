import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  updateDoc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { IntegrationProvider } from "./IntegrationsTab";

export function KmSyncService() {
  const isSyncing = useRef(false);
  const [syncStatus, setSyncStatus] = useState<{ active: boolean; progress: number; label: string }>({ 
    active: false, 
    progress: 0,
    label: ""
  });

  console.log("[SYNC DEBUG] KmSyncService component mounted");

  useEffect(() => {
    // Escutar por evento de sincronização manual
    const handleManualSync = async (e: any) => {
      console.log("[SYNC DEBUG] Evento MANUAL_KM_SYNC detectado", e.detail);
      const { vehicleId, plate } = e.detail || {};
      await checkAndSync(true, vehicleId, plate);
    };

    window.addEventListener('MANUAL_KM_SYNC', handleManualSync);

    const checkAndSync = async (isManual = false, targetVehicleId?: string, targetPlate?: string) => {
      console.log(`[SYNC DEBUG] checkAndSync called. isManual=${isManual}, targetVehicleId=${targetVehicleId}`);
      
      if (isSyncing.current && !isManual) {
        console.log("[SYNC DEBUG] checkAndSync: Already syncing, returning.");
        return;
      }

      const now = new Date();
      const currentHour = now.getHours();
      
      // Se não for manual, verifica horários (06:00 às 07:00 ou 12:00 às 13:00)
      if (!isManual) {
         const isMorningSlot = currentHour === 6;
         const isNoonSlot = currentHour === 12;
         if (!isMorningSlot && !isNoonSlot) return;
      }

      const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;

      try {
        isSyncing.current = true;
        setSyncStatus({ active: true, progress: 10, label: isManual ? (targetPlate ? `Sincronizando ${targetPlate}...` : "Sincronizando todos os veículos...") : "Sincronizando odômetros (GPS)..." });

        const syncRef = doc(db, "settings", "integrations_sync");
        const syncSnap = await getDoc(syncRef);

        if (!isManual) {
          let lastSyncSlot = "";
          let lastSyncDate = "";
          if (syncSnap.exists()) {
            lastSyncSlot = syncSnap.data().lastSyncSlot || "";
            lastSyncDate = syncSnap.data().lastSyncDate || "";
          }

          // Se já foi sincronizado neste slot hoje, paralisa.
          const currentSlotId = `${todayStr}_${currentHour}`;
          if (lastSyncSlot === currentSlotId) {
            setSyncStatus({ active: false, progress: 0, label: "" });
            isSyncing.current = false;
            return;
          }
        }

        const integrationsRef = doc(db, "settings", "integrations");
        const integrationsSnap = await getDoc(integrationsRef);

        if (!integrationsSnap.exists()) {
          setSyncStatus({ active: false, progress: 0, label: "" });
          isSyncing.current = false;
          return;
        }
        
        const integrationsData = integrationsSnap.data();
        const providers: IntegrationProvider[] = integrationsData.providers || [];

        console.log(`[SYNC DEBUG] Providers encontrados: ${providers.length}`);

        if (providers.length === 0) {
          setSyncStatus({ active: false, progress: 0, label: "" });
          isSyncing.current = false;
          return;
        }

        setSyncStatus(prev => ({ ...prev, progress: 30 }));

        // Pega veículos
        let vehiclesToSync: any[] = [];
        if (targetVehicleId) {
           const vDoc = await getDoc(doc(db, "vehicles", targetVehicleId));
           if (vDoc.exists()) vehiclesToSync = [{ id: vDoc.id, ...vDoc.data() }];
           console.log(`[SYNC DEBUG] Alvo único ${targetPlate || ''}. Veículos: ${vehiclesToSync.length}`);
        } else {
           const vehiclesRef = collection(db, "vehicles");
           const vehiclesSnap = await getDocs(vehiclesRef);
           vehiclesToSync = vehiclesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
           console.log(`[SYNC DEBUG] Sincronização Geral. Veículos no Banco: ${vehiclesToSync.length}`);
        }

        if (vehiclesToSync.length === 0) {
          setSyncStatus({ active: false, progress: 0, label: "" });
          isSyncing.current = false;
          return;
        }

        setSyncStatus(prev => ({ ...prev, progress: 50 }));

        let hasError = false;
        const batch = writeBatch(db);
        let updatesCount = 0;
        let checksCount = 0;
        let notFoundInApi: string[] = [];
        let notUpdatedKm: string[] = [];
        let updatedPlates: string[] = [];
        let processedIds = new Set<string>();

        // Força timestamp de tentativa de sincronização geral
        const generalLastCheck = new Date().toISOString();

        for (const provider of providers) {
          console.log(`[SYNC DEBUG] Consultando API: ${provider.name}`);
          try {
            if (provider.url.toLowerCase().includes('solusat')) {
              let apiKey = "";
              let apiToken = "";
              
              if (provider.token.includes(',')) {
                [apiKey, apiToken] = provider.token.split(',').map(s => s.trim());
              } else if (provider.token.includes(';')) {
                [apiKey, apiToken] = provider.token.split(';').map(s => s.trim());
              } else if (provider.token.includes(':')) {
                [apiKey, apiToken] = provider.token.split(':').map(s => s.trim());
              } else {
                 apiKey = provider.token.trim();
              }

              if (apiKey && apiToken) {
                // Adicionamos um timestamp para evitar cache agressivo de navegadores
                const response = await fetch(`/api/proxy/solusat/vehicles?t=${Date.now()}`, {
                  method: 'GET',
                  headers: { 'apiKey': apiKey, 'apiToken': apiToken }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.status && data.data) {
                      const groupKeys = Object.keys(data.data);
                      
                      groupKeys.forEach(groupKey => {
                        const apiContent = data.data[groupKey];
                        const apiVehicles = Array.isArray(apiContent) ? apiContent : (apiContent ? Object.values(apiContent) : []);
                        
                        if (apiVehicles.length > 0) {
                          apiVehicles.forEach((av: any) => {
                             const plate = (av.ras_vei_placa || av.ras_vei_veiculo || av.veiculo_placa || av.vei_placa || "").toString();
                             const cleanApiPlate = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                             if (!cleanApiPlate) return;

                             const matchingVehicles = vehiclesToSync.filter(v => {
                               const cleanVPlate = (v.plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                               return cleanVPlate === cleanApiPlate;
                             });
                             
                             if (matchingVehicles.length > 0) {
                               // Calculamos o KM uma vez para os veículos correspondentes
                               let rawKm = 0;
                               if (av.ras_eve_odometro !== undefined && av.ras_eve_odometro !== null && Number(av.ras_eve_odometro) > 0) {
                                 rawKm = Number(av.ras_eve_odometro);
                               } else {
                                 // Se ras_eve_odometro for 0 ou nulo, tenta outros mas valida se não é um ID
                                 const potentialKm = Number(av.ras_eve_hodometro || av.hodometro || av.vei_odometro || 0);
                                 // Se for maior que 100 milhões, provavelmente é lixo ou ID (Solusat usa IDs de 8 dígitos)
                                 // Porém, KM em metros pode chegar a 100M facilmente (100.000 KM).
                                 // Vamos ignorar apenas se for exatamente igual a campos conhecidos de ID se possível, 
                                 // mas na dúvida, se ras_eve_odometro veio explicitamente com 0, confiamos menos no hodometro.
                                 rawKm = potentialKm;
                               }
                               
                               const currentKmApi = Math.floor(rawKm / 1000) || 0;

                               matchingVehicles.forEach(matchedVehicle => {
                                 processedIds.add(matchedVehicle.id);
                                 checksCount++;
                                 const currentInDb = Number(matchedVehicle.currentKM || 0);
                                 
                                 // Log específico para veículo alvo ou debug
                                 if (targetPlate && cleanApiPlate === targetPlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) {
                                    console.log(`[SYNC DEBUG] Veículo Alvo ${matchedVehicle.plate}: DB=${currentInDb}, API=${currentKmApi} (Raw: ${rawKm})`);
                                 }

                                 const isLikelyErrorValue = currentInDb > 1000000 || (currentInDb > (currentKmApi * 5) && currentInDb > 200000);
                                 
                                 const vRef = doc(db, 'vehicles', matchedVehicle.id);
                                 
                                 if ((currentKmApi > currentInDb || currentInDb === 0 || isLikelyErrorValue) && currentKmApi > 0) {
                                   console.log(`[SYNC SOLUSAT] Atualizando ${matchedVehicle.plate}: ${currentInDb} -> ${currentKmApi} KM`);
                                   batch.update(vRef, {
                                     currentKM: currentKmApi,
                                     lastKmUpdate: new Date().toISOString(),
                                     lastSyncCheck: generalLastCheck
                                   });
                                   updatesCount++;
                                   updatedPlates.push(matchedVehicle.plate);
                                 } else {
                                   // Se não mudou o KM, atualizamos apenas a data de checagem
                                   batch.update(vRef, {
                                     lastSyncCheck: generalLastCheck
                                   });
                                   notUpdatedKm.push(matchedVehicle.plate);
                                 }
                               });
                             }
                          });
                        }
                      });
                    }
                } else {
                   const errText = await response.text();
                   console.error(`[SYNC ERROR] Solusat API status ${response.status}:`, errText);
                   if (isManual && providers.length === 1) alert(`Erro na API Solusat (${response.status})`);
                }
              }
            } else {
              // Outros provedores (exemplo)
              await new Promise(r => setTimeout(r, 400));
            }
          } catch (apiError) {
            console.error(`Erro ao sincronizar com ${provider.name}:`, apiError);
            hasError = true;
          }
        }

        // Verifica quem não foi encontrado na API
        if (!targetVehicleId) {
          vehiclesToSync.forEach(v => {
            if (!processedIds.has(v.id)) {
              notFoundInApi.push(v.plate);
            }
          });
        }

        setSyncStatus(prev => ({ ...prev, progress: 90 }));

        // Sempre commita se houver checagens para salvar o lastSyncCheck
        if (checksCount > 0 || updatesCount > 0 || hasError) {
          await batch.commit();
        }

        if (!isManual) {
          await setDoc(
            syncRef,
            {
              lastSyncDate: todayStr,
              lastSyncSlot: `${todayStr}_${currentHour}`,
              lastSyncTime: generalLastCheck,
              status: hasError ? "partial_error" : "success",
            },
            { merge: true },
          );
        }

        const summaryLabel = updatesCount > 0 
          ? `Sincronização concluída! ${updatesCount} veículos atualizados.` 
          : `Sincronização concluída! ${processedIds.size} veículos verificados.`;
        
        setSyncStatus({ active: true, progress: 100, label: summaryLabel });

        if (isManual) {
           console.log(`[SYNC SUMMARY] Atualizados: ${updatesCount}, Verificados: ${checksCount}, Não encontrados: ${notFoundInApi.length}`);
           if (updatedPlates.length > 0) console.log("List de Atualizados:", updatedPlates.join(", "));
        }

        setTimeout(() => setSyncStatus({ active: false, progress: 0, label: "" }), 3500);

      } catch (err) {
        console.error("Erro fatal na rotina de sincronização:", err);
        setSyncStatus({ active: false, progress: 0, label: "" });
      } finally {
        isSyncing.current = false;
      }
    };

    checkAndSync();

    const interval = setInterval(() => checkAndSync(), 15 * 60 * 1000); // Check a cada 15 min
    return () => {
      clearInterval(interval);
      window.removeEventListener('MANUAL_KM_SYNC', handleManualSync);
    };
  }, []);

  return (
    <AnimatePresence>
      {syncStatus.active && (
        <motion.div 
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-sm px-4"
        >
          <div className="bg-surface-container-highest border border-outline-variant shadow-2xl rounded-2xl p-4 overflow-hidden relative">
            <div className="flex items-center gap-3 mb-2">
              <span className={`material-symbols-outlined text-primary ${syncStatus.progress < 100 ? 'animate-spin' : ''}`}>
                {syncStatus.progress < 100 ? 'sync' : 'check_circle'}
              </span>
              <span className="text-sm font-bold text-on-surface">{syncStatus.label}</span>
            </div>
            <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
               <motion.div 
                 className="h-full bg-primary"
                 initial={{ width: "0%" }}
                 animate={{ width: `${syncStatus.progress}%` }}
               />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
