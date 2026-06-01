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
        setSyncStatus({ active: true, progress: 10, label: isManual ? (targetPlate ? `Sincronizando ${targetPlate}...` : "Sincronizando todos os veículos...") : "Iniciando comunicação GPS..." });

        // Pequeno atraso para o usuário perceber o início
        await new Promise(r => setTimeout(r, 600));

        console.log("[SYNC DEBUG] Pegando integrations_sync");
        const syncRef = doc(db, "settings", "integrations_sync");
        const syncSnap = await getDoc(syncRef);
        
        setSyncStatus(prev => ({ ...prev, progress: 20, label: "Carregando configurações..." }));

        console.log("[SYNC DEBUG] Pegando telemetry config");
        const configDoc = await getDoc(doc(db, 'config', 'telemetry'));
        const telemetryConfig = configDoc.exists() ? configDoc.data() : {
          syncIntervalMinutes: 30,
          peakHoursStart: '08:00',
          peakHoursEnd: '18:00',
          peakIntervalMinutes: 15
        };

        if (!isManual) {
          let lastSyncSlot = "";
          if (syncSnap.exists()) {
            lastSyncSlot = syncSnap.data().lastSyncSlot || "";
          }

          // Lógica de intervalo baseada na config
          const peakStart = (telemetryConfig.peakHoursStart || '08:00').split(':').map(Number);
          const peakEnd = (telemetryConfig.peakHoursEnd || '18:00').split(':').map(Number);
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          const startMinutes = peakStart[0] * 60 + (peakStart[1] || 0);
          const endMinutes = peakEnd[0] * 60 + (peakEnd[1] || 0);
          
          const isPeak = nowMinutes >= startMinutes && nowMinutes <= endMinutes;
          const interval = isPeak ? (telemetryConfig.peakIntervalMinutes || 15) : (telemetryConfig.syncIntervalMinutes || 30);
          
          const slotMinute = Math.floor(now.getMinutes() / interval) * interval;
          const currentSlotId = `${todayStr}_${now.getHours()}_${slotMinute}`;
          
          if (lastSyncSlot === currentSlotId) {
            setSyncStatus({ active: false, progress: 0, label: "" });
            isSyncing.current = false;
            return;
          }
        }

        setSyncStatus(prev => ({ ...prev, progress: 35, label: "Consultando provedores..." }));

        console.log("[SYNC DEBUG] Pegando settings/integrations");
        const integrationsRef = doc(db, "settings", "integrations");
        const integrationsSnap = await getDoc(integrationsRef);

        if (!integrationsSnap.exists()) {
          setSyncStatus({ active: false, progress: 0, label: "" });
          isSyncing.current = false;
          return;
        }
        
        const integrationsData = integrationsSnap.data();
        const providers: IntegrationProvider[] = integrationsData.providers || [];

        if (providers.length === 0) {
          setSyncStatus({ active: false, progress: 0, label: "" });
          isSyncing.current = false;
          return;
        }

        // Pega veículos
        let vehiclesToSync: any[] = [];
        if (targetVehicleId) {
           console.log(`[SYNC DEBUG] Pegando doc veículo: ${targetVehicleId}`);
           const vDoc = await getDoc(doc(db, "vehicles", targetVehicleId));
           if (vDoc.exists()) vehiclesToSync = [{ id: vDoc.id, ...vDoc.data() }];
        } else {
           console.log(`[SYNC DEBUG] Pegando docs de todos os veículos`);
           const vehiclesRef = collection(db, "vehicles");
           const vehiclesSnap = await getDocs(vehiclesRef);
           vehiclesToSync = vehiclesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }

        if (vehiclesToSync.length === 0) {
          setSyncStatus({ active: false, progress: 0, label: "" });
          isSyncing.current = false;
          return;
        }

        setSyncStatus(prev => ({ ...prev, progress: 50, label: "Acessando API Solusat..." }));

        let hasError = false;
        const batch = writeBatch(db);
        let updatesCount = 0;
        let checksCount = 0;
        let notFoundInApi: string[] = [];
        let notUpdatedKm: string[] = [];
        let updatedPlates: string[] = [];
        let processedIds = new Set<string>();

        const generalLastCheck = new Date().toISOString();

        for (const provider of providers) {
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
                const response = await fetch(`/api/proxy/solusat/vehicles?t=${Date.now()}`, {
                  method: 'GET',
                  headers: { 
                    'apiKey': apiKey, 
                    'apiToken': apiToken,
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                  }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.status && data.data) {
                      const groupKeys = Object.keys(data.data);
                      
                      setSyncStatus(prev => ({ ...prev, progress: 70, label: "Processando dados recebidos..." }));
                      await new Promise(r => setTimeout(r, 400));

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
                               let rawKm = 0;
                               let trackerTime = null;

                               if (av.ras_eve_odometro !== undefined && av.ras_eve_odometro !== null && Number(av.ras_eve_odometro) > 0) {
                                 rawKm = Number(av.ras_eve_odometro);
                               } else {
                                 rawKm = Number(av.ras_eve_hodometro || av.hodometro || av.vei_odometro || 0);
                               }
                               
                               trackerTime = av.ras_eve_data_gps || av.ras_eve_data || av.data_gps || av.data_hora || av.data || null;

                               const currentInDbBase = matchingVehicles.length > 0 ? Number(matchingVehicles[0].currentKM || 0) : 0;
                               let currentKmApi = Math.floor(rawKm);
                               
                               if (rawKm > 3000000) {
                                 currentKmApi = Math.floor(rawKm / 1000);
                               } 
                               else if (rawKm > 0 && currentInDbBase > 0 && rawKm > (currentInDbBase * 500)) {
                                 currentKmApi = Math.floor(rawKm / 1000);
                               }

                               matchingVehicles.forEach(matchedVehicle => {
                                 processedIds.add(matchedVehicle.id);
                                 checksCount++;
                                 const currentInDb = Number(matchedVehicle.currentKM || 0);

                                 const vRef = doc(db, 'vehicles', matchedVehicle.id);
                                 
                                 const updateData: any = {
                                   lastSyncCheck: generalLastCheck,
                                   lastTrackerUpdate: trackerTime,
                                   lastSyncStatus: 'success',
                                   lastSyncError: null
                                 };

                                 if ((currentKmApi > currentInDb || currentInDb === 0 || (currentInDb > 1000000 || (currentInDb > (currentKmApi * 5) && currentInDb > 200000))) && currentKmApi > 0) {
                                   updateData.currentKM = currentKmApi;
                                   updateData.lastKmUpdate = generalLastCheck;
                                   updatesCount++;
                                   updatedPlates.push(matchedVehicle.plate);
                                 } else {
                                   if (currentKmApi === 0 && rawKm === 0) {
                                      updateData.lastSyncStatus = 'warning';
                                      updateData.lastSyncError = 'KM retornado como zero pela API';
                                   }
                                   notUpdatedKm.push(matchedVehicle.plate);
                                 }

                                 batch.update(vRef, updateData);
                               });
                             }
                          });

                          vehiclesToSync.forEach(v => {
                            if (!processedIds.has(v.id)) {
                               const vRef = doc(db, 'vehicles', v.id);
                               batch.update(vRef, {
                                 lastSyncCheck: generalLastCheck,
                                 lastSyncStatus: 'failed',
                                 lastSyncError: 'Não retornado na listagem da API Solusat'
                               });
                               notFoundInApi.push(v.plate);
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
            } else if (provider.url.toLowerCase().includes('gaussfleet')) {
              try {
                const token = provider.token.trim();
                if (!token) throw new Error("Token GaussFleet não configurado");

                const now = new Date();
                const dateParam = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

                const response = await fetch(`/api/proxy/gaussfleet/hourmeter`, {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'X-AUTH-TOKEN': token 
                  },
                  body: JSON.stringify({
                    date_time: dateParam
                  })
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    if (data && data.msg && Array.isArray(data.msg)) {
                      setSyncStatus(prev => ({ ...prev, progress: 70, label: "Processando dados GaussFleet..." }));
                      await new Promise(r => setTimeout(r, 400));

                      data.msg.forEach((av: any) => {
                         const plate = (av.vehicle_name || "").toString();
                         const cleanApiPlate = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                         if (!cleanApiPlate) return;

                         const matchingVehicles = vehiclesToSync.filter(v => {
                           const cleanVPlate = (v.plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                           return cleanVPlate === cleanApiPlate;
                         });
                         
                         if (matchingVehicles.length > 0) {
                           const rawKmStr = (av.odometer_hourmeter_now || "0").toString().replace(',', '.');
                           const currentKmApi = Math.floor(parseFloat(rawKmStr));
                           const trackerTime = av.date_odmhr_now || null;

                           matchingVehicles.forEach(matchedVehicle => {
                             processedIds.add(matchedVehicle.id);
                             checksCount++;
                             const currentInDb = Number(matchedVehicle.currentKM || 0);

                             const vRef = doc(db, 'vehicles', matchedVehicle.id);
                             
                             const updateData: any = {
                               lastSyncCheck: generalLastCheck,
                               lastTrackerUpdate: trackerTime,
                               lastSyncStatus: 'success',
                               lastSyncError: null
                             };

                             if (currentKmApi > 0 && (currentKmApi > currentInDb || currentInDb === 0)) {
                               updateData.currentKM = currentKmApi;
                               updateData.lastKmUpdate = generalLastCheck;
                               updatesCount++;
                               updatedPlates.push(matchedVehicle.plate);
                             } else {
                               notUpdatedKm.push(matchedVehicle.plate);
                             }

                             batch.update(vRef, updateData);
                           });
                         }
                      });

                      vehiclesToSync.forEach(v => {
                        if (!processedIds.has(v.id)) {
                           const vRef = doc(db, 'vehicles', v.id);
                           batch.update(vRef, {
                             lastSyncCheck: generalLastCheck,
                             lastSyncStatus: 'failed',
                             lastSyncError: 'Não retornado na listagem da API GaussFleet'
                           });
                           notFoundInApi.push(v.plate);
                        }
                      });
                    }
                } else {
                   const errText = await response.text();
                   console.error(`[SYNC ERROR] GaussFleet API status ${response.status}:`, errText);
                }
              } catch (apiError) {
                console.error(`Erro ao sincronizar com GaussFleet:`, apiError);
                hasError = true;
              }
            } else {
              await new Promise(r => setTimeout(r, 600));
            }
          } catch (apiError) {
            console.error(`Erro ao sincronizar com ${provider.name}:`, apiError);
            hasError = true;
          }
        }

        setSyncStatus(prev => ({ ...prev, progress: 90, label: "Finalizando registros..." }));

        if (checksCount > 0 || updatesCount > 0 || hasError) {
          console.log(`[SYNC DEBUG] Fazendo batch.commit() com ${checksCount} checks, ${updatesCount} updates, hasError: ${hasError}`);
          await batch.commit();
          // Pequeno delay para escrita no banco ser percebida
          await new Promise(r => setTimeout(r, 500));
        }

        if (!isManual) {
          console.log(`[SYNC DEBUG] Salvando settings/integrations_sync (slot)`);
          const peakStart = (telemetryConfig.peakHoursStart || '08:00').split(':').map(Number);
          const peakEnd = (telemetryConfig.peakHoursEnd || '18:00').split(':').map(Number);
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          const startMinutes = peakStart[0] * 60 + (peakStart[1] || 0);
          const endMinutes = peakEnd[0] * 60 + (peakEnd[1] || 0);
          
          const isPeak = nowMinutes >= startMinutes && nowMinutes <= endMinutes;
          const interval = isPeak ? (telemetryConfig.peakIntervalMinutes || 15) : (telemetryConfig.syncIntervalMinutes || 30);
          const slotMinute = Math.floor(now.getMinutes() / interval) * interval;
          const currentSlotId = `${todayStr}_${now.getHours()}_${slotMinute}`;

          await setDoc(syncRef, {
            lastSyncDate: todayStr,
            lastSyncSlot: currentSlotId,
            lastSyncTime: generalLastCheck,
            status: hasError ? "partial_error" : "success",
          }, { merge: true });
        }

        const summaryLabel = updatesCount > 0 
          ? `Sincronização concluída! ${updatesCount} veículos atualizados.` 
          : `Frota verificada! ${processedIds.size} veículos processados sem alterações.`;
        
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
