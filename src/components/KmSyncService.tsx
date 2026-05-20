import { useEffect, useRef } from "react";
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

  useEffect(() => {
    const checkAndSync = async () => {
      if (isSyncing.current) return;

      const now = new Date();
      // Executa apenas a partir das 06:00
      if (now.getHours() < 6) return;

      const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;

      try {
        isSyncing.current = true;
        const syncRef = doc(db, "settings", "integrations_sync");
        const syncSnap = await getDoc(syncRef);

        let lastSync = "";
        if (syncSnap.exists()) {
          lastSync = syncSnap.data().lastSyncDate || "";
        }

        // Se já foi sincronizado hoje, paralisa.
        if (lastSync === todayStr) {
          return;
        }

        // Caso contrário, busca integrações e veículos para atualizar
        const integrationsRef = doc(db, "settings", "integrations");
        const integrationsSnap = await getDoc(integrationsRef);

        if (!integrationsSnap.exists()) return;
        const integrationsData = integrationsSnap.data();
        const providers: IntegrationProvider[] =
          integrationsData.providers || [];

        if (providers.length === 0) return;

        // Pega todos os veículos
        const vehiclesRef = collection(db, "vehicles");
        const vehiclesSnap = await getDocs(vehiclesRef);
        const vehicles = vehiclesSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        let hasError = false;
        const batch = writeBatch(db);
        let updatesCount = 0;

        // Em uma implementação real, os `providers` seriam consultados via fetch.
        // Aqui simulamos a ponte para as APIs já que não temos as rotas finais de cada fornecedor.

        for (const provider of providers) {
          try {
            // == BLOCO DE REQUISIÇÃO À API EXTERNA (MOCK / PLACEHOLDER PARA IMPLEMENTAÇÃO) ==
            /*
            const response = await fetch(provider.url, {
              headers: { 'Authorization': provider.token.startsWith('Basic') ? provider.token : `Bearer ${provider.token}` }
            });
            const data = await response.json();
            
            // Fazer loop nos dados da API e cruzar com 'vehicles' via Placa (plate)
            // Se km_da_api > currentKM_do_banco, adiciona ao batch:
            
            const matchedVehicle = vehicles.find(v => v.plate === placa_da_api);
            if (matchedVehicle && km_da_api > (matchedVehicle.currentKM || 0)) {
               const vRef = doc(db, 'vehicles', matchedVehicle.id);
               batch.update(vRef, {
                 currentKM: km_da_api,
                 lastKmUpdate: new Date().toISOString()
               });
               updatesCount++;
            }
            */
          } catch (apiError) {
            console.error(
              `Erro ao sincronizar com ${provider.name}:`,
              apiError,
            );
            hasError = true;
            // Criar um log de alerta no sistema
            const newAlertRef = doc(collection(db, "alerts"));
            batch.set(newAlertRef, {
              type: "Erro de Sincronização GPS",
              message: `Falha na atualização automática de KM no provedor ${provider.name}. Verifique a sua conexão ou Token.`,
              severity: "critical",
              createdAt: serverTimestamp(),
              status: "active",
            });
          }
        }

        // Commit global das atualizações (limite do batch é 500 ops)
        if (updatesCount > 0 || hasError) {
          await batch.commit();
        }

        // Grava a execução do dia para não repeti-la
        await setDoc(
          syncRef,
          {
            lastSyncDate: todayStr,
            lastSyncTime: new Date().toISOString(),
            status: hasError ? "partial_error" : "success",
          },
          { merge: true },
        );
      } catch (err) {
        console.error("Erro fatal na rotina de sincronização:", err);
      } finally {
        isSyncing.current = false;
      }
    };

    checkAndSync();

    // Configura check a cada 30 minutos em caso do sistema ficar aberto
    const interval = setInterval(checkAndSync, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return null; // Este componente não renderiza interface visual
}
