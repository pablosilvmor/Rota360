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
          if (syncSnap.exists()) {
            lastSyncSlot = syncSnap.data().lastSyncSlot || "";
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
           console.log(`[SYNC DEBUG] Alvo único. Veículos: ${vehiclesToSync.length}`);
        } else {
           const vehiclesRef = collection(db, "vehicles");
           const vehiclesSnap = await getDocs(vehiclesRef);
           vehiclesToSync = vehiclesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
           console.log(`[SYNC DEBUG] Sincronização Geral. Veículos no Banco: ${vehiclesToSync.length}`);
        }

        setSyncStatus(prev => ({ ...prev, progress: 50 }));

        let hasError = false;
        const batch = writeBatch(db);
        let updatesCount = 0;
        let notFoundInApi: string[] = [];
        let notUpdatedKm: string[] = [];
        let updatedPlates: string[] = [];
        let processedIds = new Set<string>();

        for (const provider of providers) {
          console.log(`[SYNC DEBUG] Provedor: ${provider.name}`);
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
                const response = await fetch("/api/proxy/solusat/vehicles", {
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
                          console.log(`[SYNC DEBUG] Grupo ${groupKey}: ${apiVehicles.length} veículos na API`);
                          apiVehicles.forEach((av: any) => {
                             const plate = (av.ras_vei_placa || av.ras_vei_veiculo || av.veiculo_placa || av.vei_placa || "").toString();
                             console.log(`[SYNC DEBUG] Placa recebida da API Solusat: ${plate}`);
                             const rawKm = av.ras_eve_hodometro || av.hodometro || av.ras_eve_odometro || 0;
                             const currentKmApi = Math.floor(Number(rawKm)) || 0;
                             
                             const cleanApiPlate = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                             if (!cleanApiPlate) return;

                             const matchingVehicles = vehiclesToSync.filter(v => {
                               const cleanVPlate = (v.plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                               return cleanVPlate === cleanApiPlate;
                             });
                             
                             if (matchingVehicles.length > 0) {
                               matchingVehicles.forEach(matchedVehicle => {
                                 processedIds.add(matchedVehicle.id);
                                 const currentInDb = matchedVehicle.currentKM || 0;
                                 
                                 if (currentKmApi > currentInDb || (currentInDb === 0 && currentKmApi > 0)) {
                                   console.log(`[SYNC DEBUG] >>> ATUALIZANDO ${matchedVehicle.plate} (ID: ${matchedVehicle.id}) para ${currentKmApi}`);
                                   const vRef = doc(db, 'vehicles', matchedVehicle.id);
                                   batch.update(vRef, {
                                     currentKM: currentKmApi,
                                     lastKmUpdate: new Date().toISOString()
                                   });
                                   updatesCount++;
                                   updatedPlates.push(matchedVehicle.plate);
                                 } else {
                                   notUpdatedKm.push(matchedVehicle.plate);
                                 }
                               });
                             } else {
                               console.log(`[SYNC DEBUG] Veículo API [${plate}] não tem placa correspondente no Banco. Dados API:`, av);
                             }
                          });
                        }
                      });
                    }
                } else if (isManual && providers.length === 1) {
                   const errData = await response.json().catch(() => ({}));
                   if (errData.error_message) alert(errData.error_message);
                }
              }
            } else {
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

        if (updatesCount > 0 || hasError) {
          await batch.commit();
        }

        if (!isManual) {
          await setDoc(
            syncRef,
            {
              lastSyncDate: todayStr,
              lastSyncSlot: `${todayStr}_${currentHour}`,
              lastSyncTime: new Date().toISOString(),
              status: hasError ? "partial_error" : "success",
            },
            { merge: true },
          );
        }

        const totalProcessed = processedIds.size;
        const summaryLabel = updatesCount > 0 
          ? `Sincronização concluída! ${updatesCount} veículos atualizados.` 
          : `Sincronização concluída! ${totalProcessed} veículos processados, sem novos dados de KM.`;
        
        setSyncStatus({ active: true, progress: 100, label: summaryLabel });

        if (isManual) {
           if (updatedPlates.length > 0) console.log("Atualizados:", updatedPlates.join(", "));
           if (notUpdatedKm.length > 0) console.log("Sem alteração no KM (Já atualizado):", notUpdatedKm.join(", "));
           if (notFoundInApi.length > 0) console.log("Veículos não encontrados na API:", notFoundInApi.join(", "));
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
