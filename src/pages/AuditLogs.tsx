import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logAudit } from '../lib/audit';
import { AnimatePresence, motion } from 'framer-motion';

export function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters identical to Fuel.tsx
  const [reportMonth, setReportMonth] = useState('Todos');
  const [reportYear, setReportYear] = useState('Todos');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  
  // Specific filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUser, setFilterUser] = useState('Todos');
  const [filterScreen, setFilterScreen] = useState('Todos');
  
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const monthsNominal = [
    { value: '0', label: 'Jan' }, { value: '1', label: 'Fev' }, { value: '2', label: 'Mar' },
    { value: '3', label: 'Abr' }, { value: '4', label: 'Mai' }, { value: '5', label: 'Jun' },
    { value: '6', label: 'Jul' }, { value: '7', label: 'Ago' }, { value: '8', label: 'Set' },
    { value: '9', label: 'Out' }, { value: '10', label: 'Nov' }, { value: '11', label: 'Dez' }
  ];

  useEffect(() => {
    const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleRestore = async (log: any) => {
    if (!window.confirm('Deseja realmente restaurar esta ação? Isso sobrescreverá/removerá dados atuais conforme o caso.')) return;
    setRestoringId(log.id);
    try {
      const docRef = doc(db, log.collectionName, log.docId);
      if (log.type === 'DELETE') {
        if (log.payload) await setDoc(docRef, log.payload);
      } else if (log.type === 'CREATE') {
        // Undo create = delete
        await deleteDoc(docRef);
      } else if (log.type === 'UPDATE') {
        if (log.previousPayload) await setDoc(docRef, log.previousPayload);
        else console.warn('No previousPayload to restore');
      }
      
      await logAudit('RESTORE', 'Auditoria', log.collectionName, log.docId, log.previousPayload || log.payload);
      alert('Ação desfeita e dados restaurados com sucesso.');
    } catch (error) {
      console.error(error);
      alert('Erro ao restaurar a ação.');
    }
    setRestoringId(null);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Month/Year filter matching Fuel
      if (!reportStartDate && !reportEndDate) {
        if (reportMonth !== 'Todos' || reportYear !== 'Todos') {
          const mDate = log.timestamp?.toDate();
          if (mDate) {
            if (reportMonth !== 'Todos' && mDate.getMonth().toString() !== reportMonth) return false;
            if (reportYear !== 'Todos' && mDate.getFullYear().toString() !== reportYear) return false;
          }
        }
      } else {
        const mDate = log.timestamp?.toDate();
        if (mDate) {
          if (reportStartDate && mDate < new Date(reportStartDate + 'T00:00:00')) return false;
          if (reportEndDate && mDate > new Date(reportEndDate + 'T23:59:59')) return false;
        }
      }
      
      // User
      if (filterUser !== 'Todos' && log.userEmail !== filterUser && log.userName !== filterUser) return false;
      
      // Screen
      if (filterScreen !== 'Todos' && log.screen !== filterScreen) return false;
      
      // Full search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const payloadStr = JSON.stringify(log.payload || {}).toLowerCase();
        if (!log.userEmail?.toLowerCase().includes(q) &&
            !log.userName?.toLowerCase().includes(q) &&
            !log.collectionName?.toLowerCase().includes(q) &&
            !log.screen?.toLowerCase().includes(q) &&
            !payloadStr.includes(q) && 
            !log.docId?.toLowerCase().includes(q)) {
          return false;
        }
      }
      
      return true;
    });
  }, [logs, reportMonth, reportYear, reportStartDate, reportEndDate, filterUser, filterScreen, searchQuery]);

  const uniqueUsers = Array.from(new Set(logs.map(l => l.userName || l.userEmail))).filter(Boolean);
  const uniqueScreens = Array.from(new Set(logs.map(l => l.screen))).filter(Boolean);

  if (loading) {
    return <div className="p-8 text-center text-on-surface-variant">Carregando histórico...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div>
        <h2 className="text-[32px] font-bold text-on-surface tracking-tight mb-2">Auditoria de Ações</h2>
        <p className="text-on-surface-variant font-medium">Histórico avançado de ações e modificações no sistema para prevenção e controle.</p>
      </div>

      {/* Filters identically aligned to Fuel.tsx aesthetic via class names */}
      <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-[24px] shadow-sm flex flex-col xl:flex-row gap-6 relative overflow-hidden">
        <div className="flex-1 flex flex-wrap gap-4 items-center relative z-10">
            {/* Search */}
            <div className="relative flex-1 min-w-[280px]">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
              <input
                type="text"
                placeholder="Pesquisa avançada (Nomes, e-mails, IDs, conteúdos gerados)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-container border border-outline-variant rounded-2xl pl-12 pr-4 h-[52px] focus:ring-2 focus:ring-primary outline-none transition-shadow shadow-sm font-medium"
              />
            </div>
            
            {/* Period / Month / Year */}
            <div className="flex items-center gap-3 bg-surface-container border border-outline-variant rounded-2xl px-5 h-[52px] shadow-sm hover:border-primary/40 transition-colors">
                <span className="material-symbols-outlined text-primary text-[18px]">calendar_month</span>
                <select 
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  disabled={!!reportStartDate}
                  className="bg-transparent text-sm font-bold outline-none cursor-pointer disabled:opacity-50"
                >
                    <option value="Todos">Mês: Todos</option>
                    {monthsNominal.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select 
                  value={reportYear}
                  onChange={(e) => setReportYear(e.target.value)}
                  disabled={!!reportStartDate}
                  className="bg-transparent text-sm font-bold outline-none cursor-pointer disabled:opacity-50"
                >
                    <option value="Todos">Ano: Todos</option>
                    {Array.from({length: 5}, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>

            <div className="flex items-center gap-3 bg-surface-container border border-outline-variant rounded-2xl px-5 h-[52px] shadow-sm group hover:border-primary/40 transition-all duration-300">
                <div className="flex flex-col min-w-[80px]">
                  <span className="text-[8px] font-black uppercase text-primary tracking-wider leading-none mb-1 opacity-60">Início</span>
                  <input 
                    type="date" 
                    value={reportStartDate} 
                    onChange={e => setReportStartDate(e.target.value)} 
                    className="bg-transparent text-[11px] font-bold outline-none h-4 appearance-none text-on-surface hover:text-primary transition-colors" 
                  />
                </div>
                <div className="w-px h-8 bg-outline-variant group-hover:bg-primary/20 transition-colors" />
                <div className="flex flex-col min-w-[80px]">
                  <span className="text-[8px] font-black uppercase text-primary tracking-wider leading-none mb-1 opacity-60">Fim</span>
                  <input 
                    type="date" 
                    value={reportEndDate} 
                    onChange={e => setReportEndDate(e.target.value)} 
                    className="bg-transparent text-[11px] font-bold outline-none h-4 appearance-none text-on-surface hover:text-primary transition-colors" 
                  />
                </div>
                <AnimatePresence>
                  {(reportStartDate || reportEndDate) && (
                    <motion.button 
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      onClick={() => { setReportStartDate(''); setReportEndDate(''); }} 
                      className="material-symbols-outlined text-[18px] text-error p-1 rounded-full hover:bg-error/10 transition-all ml-2"
                    >
                      backspace
                    </motion.button>
                  )}
                </AnimatePresence>
            </div>

            {/* User and Screen filter */}
            <select
               value={filterUser}
               onChange={e => setFilterUser(e.target.value)}
               className="bg-surface-container border border-outline-variant rounded-2xl px-4 h-[52px] text-sm font-bold shadow-sm focus:ring-2 focus:ring-primary outline-none"
            >
               <option value="Todos">Todos os Usuários</option>
               {uniqueUsers.map(u => <option key={u} value={u as string}>{u}</option>)}
            </select>
            <select
               value={filterScreen}
               onChange={e => setFilterScreen(e.target.value)}
               className="bg-surface-container border border-outline-variant rounded-2xl px-4 h-[52px] text-sm font-bold shadow-sm focus:ring-2 focus:ring-primary outline-none"
            >
               <option value="Todos">Todas as Telas</option>
               {uniqueScreens.map(s => <option key={s} value={s as string}>{s}</option>)}
            </select>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
             <thead>
                <tr className="bg-surface-container-low/50 border-b border-outline-variant">
                  <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Ação / Tipo</th>
                  <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Data/Hora</th>
                  <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Usuário</th>
                  <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Tela / ID</th>
                  <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider text-right">Controles</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-outline-variant">
                {filteredLogs.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-on-surface-variant font-medium">Nenhum registro encontrado.</td></tr>
                ) : filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-container-low/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-[16px] ${log.type === 'DELETE' ? 'text-error' : log.type === 'CREATE' ? 'text-primary' : 'text-orange-500'}`}>
                           {log.type === 'DELETE' ? 'delete' : log.type === 'CREATE' ? 'add_circle' : log.type === 'RESTORE' ? 'history' : 'edit'}
                        </span>
                        <span className="font-bold text-sm text-on-surface">{log.type}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-on-surface-variant">
                       {log.timestamp?.toDate().toLocaleString('pt-BR')}
                    </td>
                    <td className="p-4">
                       <span className="text-sm font-bold text-on-surface block">{log.userName || log.userEmail}</span>
                       <span className="text-[10px] text-on-surface-variant">{log.userEmail}</span>
                    </td>
                    <td className="p-4 flex flex-col">
                       <span className="font-bold text-sm text-primary">{log.screen || log.collectionName}</span>
                       <span className="text-[10px] text-on-surface-variant tracking-wider font-mono">{log.docId}</span>
                    </td>
                    <td className="p-4 text-right">
                       <button
                         onClick={() => handleRestore(log)}
                         disabled={restoringId === log.id}
                         className="px-3 py-1.5 bg-secondary-container text-on-secondary-container rounded-lg font-bold text-[12px] shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-1 ml-auto"
                       >
                         <span className="material-symbols-outlined text-[16px]">undo</span>
                         RESTORE
                       </button>
                    </td>
                  </tr>
                ))}
             </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
