import { useEffect } from 'react';
import { collection, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function InvoiceSyncService() {
  useEffect(() => {
    const handleSync = async (event: any) => {
      const isFullSync = event.detail?.full || false;
      
      // Notificar início
      window.dispatchEvent(new CustomEvent('SYNC_STATUS_CHANGE', { 
        detail: { type: 'INVOICE', status: 'syncing' } 
      }));

      try {
        const integrationsRef = doc(db, 'settings', 'integrations');
        const integrationsSnap = await getDoc(integrationsRef);
        
        if (!integrationsSnap.exists()) {
          console.warn("Integrações não configuradas.");
          return;
        }

        const data = integrationsSnap.data();
        const a1Config = data.a1Config;

        if (!a1Config?.isConfigured || !a1Config?.cnpj) {
          console.warn("Certificado A1 não configurado corretamente.");
          return;
        }

        // Simulação de busca na SEFAZ (4 anos se full sync, senão apenas as mais recentes)
        const batch = writeBatch(db);
        const folders = isFullSync ? 4 : 1;
        const cnpj = a1Config.cnpj;
        const fleetCNPJs = a1Config.fleetCNPJs || [];

        console.log(`[INVOICE SYNC] Iniciando busca para ${cnpj}. Histórico: ${folders} anos. Filtrando frota:`, fleetCNPJs);

        // Gerar algumas notas simuladas para o histórico
        const startYear = new Date().getFullYear() - (isFullSync ? 3 : 0);
        const currentYear = new Date().getFullYear();

        let count = 0;
        for (let year = startYear; year <= currentYear; year++) {
          const numDocs = isFullSync ? 5 : 2; 
          
          for (let i = 0; i < numDocs; i++) {
            const day = Math.floor(Math.random() * 28) + 1;
            const month = Math.floor(Math.random() * 12) + 1;
            const number = Math.floor(Math.random() * 900000) + 100000;
            const value = Math.random() * 5000 + 100;
            const id = `NFE-${year}-${month}-${day}-${number}`;
            
            // Usar um dos CNPJs da frota, se disponível
            const selectedCNPJ = fleetCNPJs.length > 0 ? fleetCNPJs[i % fleetCNPJs.length] : '00.000.000/0001-00';
            
            const invoiceRef = doc(collection(db, 'invoices'), id);
            batch.set(invoiceRef, {
              number: `000.${number}`,
              issueDate: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
              issuerName: 'AUTO PEÇAS E SERVIÇOS',
              issuerCNPJ: selectedCNPJ,
              value: parseFloat(value.toFixed(2)),
              status: 'autorizada',
              key: Math.random().toString(36).substring(2, 15).toUpperCase() + Math.random().toString(36).substring(2, 15).toUpperCase(),
              lastSync: new Date().toISOString()
            });
            count++;
          }
        }

        await batch.commit();

        // Atualizar timestamp da última sincronização
        await setDoc(integrationsRef, {
          a1Config: {
            ...a1Config,
            lastSync: new Date().toISOString()
          }
        }, { merge: true });

        console.log(`[INVOICE SYNC] Sincronização concluída. ${count} notas processadas.`);

      } catch (error) {
        console.error("Erro na sincronização de notas:", error);
      } finally {
        // Notificar fim
        window.dispatchEvent(new CustomEvent('SYNC_STATUS_CHANGE', { 
          detail: { type: 'INVOICE', status: 'idle' } 
        }));
      }
    };

    window.addEventListener('START_INVOICE_SYNC', handleSync);

    // Agendar sincronização automática a cada 6 horas (simulado aqui como 1 hora para demo se o app ficar aberto)
    const interval = setInterval(() => {
      window.dispatchEvent(new CustomEvent('START_INVOICE_SYNC', { detail: { full: false } }));
    }, 3600000); 

    return () => {
      window.removeEventListener('START_INVOICE_SYNC', handleSync);
      clearInterval(interval);
    };
  }, []);

  return null;
}
