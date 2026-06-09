import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';

export interface IntegrationProvider {
  id: string;
  name: string;
  url: string;
  token: string;
}

export function IntegrationsTab() {
  const [providers, setProviders] = useState<IntegrationProvider[]>([]);
  const [syncLogs, setSyncLogs] = useState<Record<string, { status: 'success' | 'failed', timestamp: string, message: string }>>({});
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'integrations');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.providers) {
            setProviders(data.providers);
          } else if (data.telemetryUrl || data.telemetryToken) {
            // Migração de cadastro único antigo para array
            setProviders([{
              id: Date.now().toString(),
              name: 'Provedor Padrão',
              url: data.telemetryUrl || '',
              token: data.telemetryToken || ''
            }]);
          }

          if (data.lastLogs) {
            setSyncLogs(data.lastLogs);
          }
        }
      } catch (error) {
        console.error("Error fetching integrations:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleAddProvider = () => {
    setProviders([
      ...providers,
      { id: Date.now().toString(), name: 'Nova Integração', url: '', token: '' }
    ]);
  };

  const handleRemoveProvider = (id: string) => {
    setProviders(providers.filter(p => p.id !== id));
  };

  const handleChange = (id: string, field: keyof IntegrationProvider, value: string) => {
    setProviders(providers.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveProgress(0);
    
    // Simular progresso visual já que Firestore é rápido
    const interval = setInterval(() => {
      setSaveProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, 100);

    try {
      const docRef = doc(db, 'settings', 'integrations');
      await setDoc(docRef, {
        providers,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      setSaveProgress(100);
      setTimeout(() => {
        alert("Configurações salvas com sucesso!");
        setSaveProgress(0);
      }, 300);
    } catch (error) {
      clearInterval(interval);
      setSaveProgress(0);
      handleFirestoreError(error, OperationType.UPDATE, 'settings/integrations');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-on-surface-variant animate-pulse font-bold">Carregando configurações...</div>;
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 p-6 space-y-6 relative">
      <AnimatePresence>
        {isSaving && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="absolute top-0 left-0 right-0 h-1 bg-surface-container z-50 overflow-hidden"
          >
            <motion.div 
              className="h-full bg-primary"
              initial={{ width: "0%" }}
              animate={{ width: `${saveProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold text-on-surface mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">api</span>
            Múltiplas Integrações (GPS / Telemetria)
          </h3>
          <p className="text-on-surface-variant font-medium text-sm">
            Adicione e configure múltiplas APIs de rastreamento de parceiros (TicketLog, Omnilink, etc.) para atualização do Hodômetro.
          </p>
        </div>
        <button
          onClick={handleAddProvider}
          className="px-4 py-2 border border-primary text-primary rounded-xl font-bold hover:bg-primary/5 transition-all text-sm flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Adicionar API
        </button>
      </div>

      <div className="space-y-4">
        {providers.length === 0 ? (
          <div className="text-center p-8 bg-surface-container rounded-xl border border-outline-variant/50 text-on-surface-variant font-medium text-sm">
            Nenhuma API configurada. Clique em "Adicionar API" para iniciar.
          </div>
        ) : (
          <AnimatePresence>
            {providers.map((provider) => (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/30 flex flex-col md:flex-row gap-4 relative"
              >
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Nome do Provedor</label>
                      <input
                        type="text"
                        className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary transition-all text-sm text-on-surface"
                        value={provider.name}
                        onChange={(e) => handleChange(provider.id, 'name', e.target.value)}
                        placeholder="Ex: API TicketLog"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">URL Base da API</label>
                      <input
                        type="text"
                        className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary transition-all text-sm text-on-surface font-mono"
                        value={provider.url}
                        onChange={(e) => handleChange(provider.id, 'url', e.target.value)}
                        placeholder="https://api..."
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Token de Acesso / Chave</label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-3 w-3 rounded border-outline-variant accent-primary"
                          checked={!!showTokens[provider.id]}
                          onChange={() => setShowTokens(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                        />
                        <span className="text-[10px] text-on-surface-variant font-bold uppercase">Mostrar</span>
                      </label>
                    </div>
                    <input
                      type={showTokens[provider.id] ? "text" : "password"}
                      className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary transition-all text-sm text-on-surface font-mono"
                      value={provider.token}
                      onChange={(e) => handleChange(provider.id, 'token', e.target.value)}
                      placeholder="Para Solusat, use: apiKey,apiToken"
                    />
                    {provider.url.toLowerCase().includes('solusat') && (
                      <p className="text-[10px] text-primary font-medium mt-1">
                        Formato exigido: <strong>SuaApiKey,SeuApiToken</strong> (separados por vírgula)
                      </p>
                    )}
                  </div>
                  
                  {/* Log de Sincronização */}
                  {syncLogs[provider.id] && (
                    <div className={`mt-2 p-3 rounded-lg border flex items-start gap-3 ${syncLogs[provider.id].status === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-error/5 border-error/10'}`}>
                      <span className={`material-symbols-outlined text-[18px] mt-0.5 ${syncLogs[provider.id].status === 'success' ? 'text-emerald-600' : 'text-error'}`}>
                        {syncLogs[provider.id].status === 'success' ? 'verified' : 'report'}
                      </span>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${syncLogs[provider.id].status === 'success' ? 'text-emerald-700' : 'text-error'}`}>
                            Última Sincronização: {syncLogs[provider.id].status === 'success' ? 'SUCESSO' : 'FALHA'}
                          </span>
                          <span className="text-[10px] text-on-surface-variant font-mono">
                            {new Date(syncLogs[provider.id].timestamp).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className={`text-[11px] font-medium ${syncLogs[provider.id].status === 'success' ? 'text-emerald-800' : 'text-error/80'}`}>
                          {syncLogs[provider.id].message}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveProvider(provider.id)}
                  className="bg-error/10 text-error p-2 rounded-lg hover:bg-error hover:text-white transition-colors h-fit self-end md:self-start md:mt-6"
                  title="Remover Integração"
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        <div className="pt-6 flex justify-end gap-3 mt-4 border-t border-outline-variant/30">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 uppercase text-sm tracking-wide"
          >
            {isSaving ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-[20px]">save</span>
            )}
            Salvar Telemetrias
          </button>
        </div>
      </div>
    </div>
  );
}
