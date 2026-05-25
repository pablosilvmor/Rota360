import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'framer-motion';

export function Profile() {
  const { user, userData } = useAuth();
  
  const [formData, setFormData] = useState({
    fullName: '',
    matricula: '',
    cpf: '',
    role: '',
    company: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (userData?.signatureInfo) {
      setFormData({
        fullName: userData.signatureInfo.fullName || '',
        matricula: userData.signatureInfo.matricula || '',
        cpf: userData.signatureInfo.cpf || '',
        role: userData.signatureInfo.role || '',
        company: userData.signatureInfo.company || ''
      });
    } else if (userData) {
      setFormData(prev => ({
        ...prev,
        fullName: userData.name || ''
      }));
    }
  }, [userData]);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
    // Apply mask: XXX.XXX.XXX-XX
    if (value.length > 9) {
      value = value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*/, '$1.$2.$3-$4');
    } else if (value.length > 6) {
      value = value.replace(/^(\d{3})(\d{3})(\d{0,3}).*/, '$1.$2.$3');
    } else if (value.length > 3) {
      value = value.replace(/^(\d{3})(\d{0,3}).*/, '$1.$2');
    }
    
    setFormData({ ...formData, cpf: value });
  };

  const validateCpf = (cpfStr: string) => {
    const raw = cpfStr.replace(/\D/g, '');
    if (raw.length !== 11 || /^(\d)\1+$/.test(raw)) return false;
    
    let sum = 0;
    let rest;
    
    for (let i = 1; i <= 9; i++) sum = sum + parseInt(raw.substring(i-1, i)) * (11 - i);
    rest = (sum * 10) % 11;
    if ((rest === 10) || (rest === 11)) rest = 0;
    if (rest !== parseInt(raw.substring(9, 10))) return false;
    
    sum = 0;
    for (let i = 1; i <= 10; i++) sum = sum + parseInt(raw.substring(i-1, i)) * (12 - i);
    rest = (sum * 10) % 11;
    if ((rest === 10) || (rest === 11)) rest = 0;
    if (rest !== parseInt(raw.substring(10, 11))) return false;
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMessage('');
    
    if (formData.cpf && !validateCpf(formData.cpf)) {
      setSaveMessage('CPF inválido. Por favor, verifique.');
      return;
    }
    
    if (!user) return;

    setIsSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        signatureInfo: formData
      });
      setSaveMessage('Informações salvas com sucesso!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error(error);
      setSaveMessage('Erro ao salvar as informações.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-3xl mx-auto space-y-6"
    >
      <div>
        <h2 className="text-[32px] font-bold text-on-surface tracking-tight mb-2">Meu Perfil</h2>
        <p className="text-on-surface-variant font-medium">Configure suas preferências e dados de assinatura digital.</p>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden p-6">
        <h3 className="text-xl font-bold text-on-surface mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">draw</span>
          Dados para Assinatura Digital
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-on-surface mb-1">Nome Completo</label>
              <input 
                type="text" 
                required
                value={formData.fullName}
                onChange={e => setFormData({...formData, fullName: e.target.value})}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-on-surface mb-1">Matrícula</label>
              <input 
                type="text" 
                value={formData.matricula}
                onChange={e => setFormData({...formData, matricula: e.target.value})}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-on-surface mb-1">CPF</label>
              <input 
                type="text" 
                required
                value={formData.cpf}
                onChange={handleCpfChange}
                placeholder="000.000.000-00"
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-on-surface mb-1">Cargo</label>
              <input 
                type="text" 
                required
                value={formData.role}
                onChange={e => setFormData({...formData, role: e.target.value})}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-on-surface mb-1">Nome da Empresa</label>
              <input 
                type="text" 
                required
                value={formData.company}
                onChange={e => setFormData({...formData, company: e.target.value})}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center gap-4">
            <button 
              type="submit" 
              disabled={isSaving}
              className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold shadow-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {isSaving ? (
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined">save</span>
              )}
              {isSaving ? 'Salvando...' : 'Salvar Informações'}
            </button>
            {saveMessage && (
              <span className={`text-sm font-medium ${saveMessage.includes('Erro') || saveMessage.includes('inválido') ? 'text-error' : 'text-success'}`}>
                {saveMessage}
              </span>
            )}
          </div>
        </form>
      </div>
    </motion.div>
  );
}
