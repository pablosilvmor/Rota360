import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function TelemetryTab() {
  const [config, setConfig] = useState<any>({
    syncIntervalMinutes: 30,
    peakHoursStart: '06:00',
    peakHoursEnd: '18:00',
    peakIntervalMinutes: 15,
  });
  const [saving, setSaving] = useState(false);
  const [failedVehicles, setFailedVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load config
    const loadConfig = async () => {
      const configDoc = await getDoc(doc(db, 'config', 'telemetry'));
      if (configDoc.exists()) {
        setConfig(configDoc.data());
      }
    };
    loadConfig();

    // Listen to failed vehicles
    const q = query(
      collection(db, 'vehicles'),
      where('lastSyncStatus', 'in', ['failed', 'warning'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const failed = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setFailedVehicles(failed);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'telemetry'), {
        ...config,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert('Configurações de telemetria salvas com sucesso!');
    } catch (error) {
      console.error('Error saving telemetry config:', error);
      alert('Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Configuração */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined">settings_suggest</span>
          </div>
          <div>
            <h3 className="text-xl font-bold text-on-surface">Agendamento de Sincronização</h3>
            <p className="text-sm text-on-surface-variant font-medium">Configure os parâmetros de atualização automática com a Solusat.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="space-y-2">
            <label className="text-xs font-bold text-on-surface-variant uppercase ml-1">Intervalo Padrão (Minutos)</label>
            <input 
              type="number"
              value={config.syncIntervalMinutes}
              onChange={e => setConfig({...config, syncIntervalMinutes: Number(e.target.value)})}
              className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none font-bold"
              placeholder="Ex: 30"
            />
            <p className="text-[11px] text-on-surface-variant px-1 italic">Frequência em horários de baixo movimento.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-surface-variant uppercase ml-1">Intervalo de Pico (Minutos)</label>
            <input 
              type="number"
              value={config.peakIntervalMinutes}
              onChange={e => setConfig({...config, peakIntervalMinutes: Number(e.target.value)})}
              className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none font-bold"
              placeholder="Ex: 15"
            />
            <p className="text-[11px] text-on-surface-variant px-1 italic">Frequência acelerada durante o expediente.</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-surface-variant uppercase ml-1">Início do Horário de Pico</label>
            <input 
              type="time"
              value={config.peakHoursStart}
              onChange={e => setConfig({...config, peakHoursStart: e.target.value})}
              className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none font-bold"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-surface-variant uppercase ml-1">Fim do Horário de Pico</label>
            <input 
              type="time"
              value={config.peakHoursEnd}
              onChange={e => setConfig({...config, peakHoursEnd: e.target.value})}
              className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none font-bold"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button 
            onClick={handleSaveConfig}
            disabled={saving}
            className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold shadow-lg hover:opacity-90 transition-all flex items-center gap-2"
          >
            {saving ? (
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined">save</span>
            )}
            Salvar Configurações
          </button>
        </div>
      </div>

      {/* Relatório de Falhas */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low/30">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-error/10 text-error flex items-center justify-center">
              <span className="material-symbols-outlined">report_problem</span>
            </div>
            <div>
              <h3 className="font-bold text-on-surface">Log de Erros de Sincronização</h3>
              <p className="text-xs text-on-surface-variant font-medium">Veículos com problemas na última atualização via API Solusat.</p>
            </div>
          </div>
          <span className="px-3 py-1 bg-error/10 text-error rounded-full text-[11px] font-extrabold uppercase tracking-widest border border-error/20">
            {failedVehicles.length} Alertas
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low/50">
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Veículo</th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Última Checagem</th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Detalhe do Erro</th>
                <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-on-surface-variant">
                    <span className="material-symbols-outlined animate-spin mb-2 block">progress_activity</span>
                    Carregando listagem...
                  </td>
                </tr>
              ) : failedVehicles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 grayscale opacity-60">
                      <span className="material-symbols-outlined text-[48px]">check_circle</span>
                      <p className="text-sm font-bold text-on-surface">Toda a frota sincronizada com sucesso!</p>
                      <p className="text-xs text-on-surface-variant">Nenhum erro de integração detectado.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                failedVehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-error/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-on-surface leading-tight">{v.plate}</span>
                        <span className="text-[10px] text-on-surface-variant font-medium">Solusat API v2</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        v.lastSyncStatus === 'failed' 
                          ? 'bg-error/10 text-error' 
                          : 'bg-warning/10 text-warning'
                      }`}>
                        {v.lastSyncStatus === 'failed' ? 'Erro Crítico' : 'Alerta'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[11px] text-on-surface-variant font-mono">
                      {v.lastSyncCheck ? new Date(v.lastSyncCheck).toLocaleString('pt-BR') : 'Nunca'}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[11px] font-medium text-error flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">error_outline</span>
                        {v.lastSyncError || 'Falha de comunicação'}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                         onClick={() => {
                           window.dispatchEvent(new CustomEvent('MANUAL_KM_SYNC', { 
                             detail: { vehicleId: v.id, plate: v.plate } 
                           }));
                         }}
                         className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-full transition-all"
                         title="Tentar Sincronizar"
                      >
                        <span className="material-symbols-outlined text-[20px]">refresh</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
