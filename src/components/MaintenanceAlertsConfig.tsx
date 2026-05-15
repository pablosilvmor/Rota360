import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmModal } from './ConfirmModal';

export function MaintenanceAlertsConfig() {
  const [isOpen, setIsOpen] = useState(false);
  const [isNewRuleOpen, setIsNewRuleOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [alerts, setAlerts] = useState([
    { id: 1, name: 'Revisão Motor (10.000km)', km: 10000, days: 180, hours: 300, notifyEmail: true, notifySms: false, message: 'Agendar revisão do motor urgente.' },
    { id: 2, name: 'Troca de Pneus', km: 40000, days: null, hours: null, notifyEmail: true, notifySms: true, message: 'Verificar desgaste e realizar rodízio/troca.' }
  ]);
  
  const [formData, setFormData] = useState({ name: '', km: '', days: '', hours: '', message: '' });
  const [ruleToDelete, setRuleToDelete] = useState<number | null>(null);

  const toggleCheckbox = (id: number, field: 'notifyEmail' | 'notifySms') => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, [field]: !a[field] } : a));
  };

  const confirmDelete = () => {
    if (ruleToDelete === null) return;
    setAlerts(alerts.filter(a => a.id !== ruleToDelete));
    setRuleToDelete(null);
  };

  const handleDelete = (id: number) => {
    setRuleToDelete(id);
  };

  const handleEdit = (alert: any) => {
    setEditingRule(alert.id);
    setFormData({
      name: alert.name,
      km: alert.km ? String(alert.km) : '',
      days: alert.days ? String(alert.days) : '',
      hours: alert.hours ? String(alert.hours) : '',
      message: alert.message
    });
    setIsNewRuleOpen(true);
  };

  const handleSaveRule = () => {
    const newRule = {
      id: editingRule ? editingRule : Date.now(),
      name: formData.name || 'Nova Regra',
      km: formData.km ? parseInt(formData.km) : null,
      days: formData.days ? parseInt(formData.days) : null,
      hours: formData.hours ? parseInt(formData.hours) : null,
      notifyEmail: true,
      notifySms: false,
      message: formData.message || 'Mensagem da regra.'
    };

    if (editingRule) {
      setAlerts(alerts.map(a => a.id === editingRule ? { ...a, ...newRule } : a));
    } else {
      setAlerts([...alerts, newRule]);
    }

    setIsNewRuleOpen(false);
    setEditingRule(null);
    setFormData({ name: '', km: '', days: '', hours: '', message: '' });
  };

  const handleCloseModal = () => {
    setIsNewRuleOpen(false);
    setEditingRule(null);
    setFormData({ name: '', km: '', days: '', hours: '', message: '' });
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden mb-6 relative">
      <ConfirmModal 
        isOpen={ruleToDelete !== null}
        title="Excluir regra de alerta"
        message="Tem certeza que deseja excluir esta regra de alerta? Esta ação não pode ser desfeita."
        onConfirm={confirmDelete}
        onCancel={() => setRuleToDelete(null)}
        confirmLabel="Excluir"
      />
      <AnimatePresence>
        {isNewRuleOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                <h3 className="text-xl font-semibold text-on-surface">{editingRule ? 'Editar Regra' : 'Nova Regra de Alerta'}</h3>
                <button onClick={handleCloseModal} className="text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">Nome da Regra</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" placeholder="Ex: Troca de Óleo" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Limite (KM)</label>
                    <input type="number" value={formData.km} onChange={e => setFormData({...formData, km: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" placeholder="10000" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Limite (Dias)</label>
                    <input type="number" value={formData.days} onChange={e => setFormData({...formData, days: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" placeholder="180" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Limite (Horas)</label>
                    <input type="number" value={formData.hours} onChange={e => setFormData({...formData, hours: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" placeholder="300" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">Mensagem de Notificação</label>
                  <textarea rows={3} value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" placeholder="Mensagem a ser enviada..."></textarea>
                </div>
                <div className="pt-4 flex gap-4">
                   <button onClick={handleCloseModal} className="flex-1 px-4 py-2 border border-outline-variant rounded-lg font-semibold hover:bg-surface-container transition-colors">Cancelar</button>
                   <button onClick={handleSaveRule} className="flex-1 px-4 py-2 bg-primary text-on-primary rounded-lg font-semibold hover:bg-primary/90 transition-colors">Salvar Regra</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        className="p-6 flex justify-between items-center cursor-pointer hover:bg-surface-container-low transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary-container text-on-primary-container rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px]">notifications_active</span>
          </div>
          <div>
            <h3 className="text-[18px] font-semibold text-primary">Regras de Alerta de Manutenção</h3>
            <p className="text-sm text-on-surface-variant">Configure gatilhos múltiplos (KM, Data, Horas) e notificações.</p>
          </div>
        </div>
        <button className="text-on-surface-variant">
          <span className="material-symbols-outlined transition-transform duration-300" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-outline-variant"
          >
            <div className="p-6">
              <div className="flex justify-end mb-4">
                <button 
                  onClick={() => setIsNewRuleOpen(true)}
                  className="bg-primary text-on-primary px-4 py-2 rounded-lg font-semibold shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Nova Regra
                </button>
              </div>

              <div className="space-y-4">
                {alerts.map(alert => (
                  <div key={alert.id} className="border border-outline-variant rounded-xl p-4 flex flex-col md:flex-row gap-6 bg-white hover:border-primary/50 transition-colors">
                    <div className="flex-1">
                      <h4 className="font-bold text-base mb-1">{alert.name}</h4>
                      <p className="text-sm text-on-surface-variant mb-3">Mensagem: "{alert.message}"</p>
                      <div className="flex gap-4 flex-wrap">
                         <div className="flex items-center gap-1.5 bg-surface-container-high px-2.5 py-1 rounded-md text-xs font-semibold">
                           <span className="material-symbols-outlined text-[14px]">speed</span>
                           {alert.km ? `${alert.km.toLocaleString()} km` : 'N/A'}
                         </div>
                         <div className="flex items-center gap-1.5 bg-surface-container-high px-2.5 py-1 rounded-md text-xs font-semibold">
                           <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                           {alert.days ? `${alert.days} dias` : 'N/A'}
                         </div>
                         <div className="flex items-center gap-1.5 bg-surface-container-high px-2.5 py-1 rounded-md text-xs font-semibold">
                           <span className="material-symbols-outlined text-[14px]">timer</span>
                           {alert.hours ? `${alert.hours} horas` : 'N/A'}
                         </div>
                      </div>
                    </div>

                    <div className="min-w-[120px] flex flex-col justify-center border-l md:border-l border-t md:border-t-0 border-outline-variant pt-4 md:pt-0 md:pl-6 space-y-2">
                       <label className="flex items-center gap-2 text-sm cursor-pointer">
                         <input type="checkbox" checked={alert.notifyEmail} onChange={() => toggleCheckbox(alert.id, 'notifyEmail')} className="rounded text-primary focus:ring-primary h-4 w-4" />
                         E-mail
                       </label>
                       <label className="flex items-center gap-2 text-sm cursor-pointer">
                         <input type="checkbox" checked={alert.notifySms} onChange={() => toggleCheckbox(alert.id, 'notifySms')} className="rounded text-primary focus:ring-primary h-4 w-4" />
                         SMS
                       </label>
                    </div>

                    <div className="flex md:flex-col items-center justify-center gap-2 border-l md:border-l-0 border-outline-variant md:pl-0 pl-6">
                      <button onClick={() => handleEdit(alert)} className="p-2 text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container rounded-full">
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                      <button onClick={() => handleDelete(alert.id)} className="p-2 text-on-surface-variant hover:text-error transition-colors hover:bg-error-container/50 rounded-full">
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
