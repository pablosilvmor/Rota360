import React, { useState, useEffect } from "react";
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc, getDoc, where, limit, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ConfirmModal } from "../components/ConfirmModal";
import { useNavigate } from "react-router";
import { usePrivacy } from "../contexts/PrivacyContext";
import { toBlob } from 'html-to-image';
import { motion, AnimatePresence } from "framer-motion";

export function AutoAlertaAdmin() {
  const { isPrivacyMode } = usePrivacy();
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlerta, setSelectedAlerta] = useState<any | null>(null);
  const [vehicleImage, setVehicleImage] = useState<string | null>(null);
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [alertaToDelete, setAlertaToDelete] = useState<string | null>(null);
  const [customAlert, setCustomAlert] = useState<{ message: string; title?: string; type?: 'error' | 'success' | 'info'; onConfirm?: () => void; isConfirm?: boolean } | null>(null);

  useEffect(() => {
    const q = query(collection(db, "auto_alertas"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const acts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAlertas(acts);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao buscar AutoAlertas", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSelectAlerta = async (alerta: any) => {
    setSelectedAlerta(alerta);
    setVehicleImage(null);
    setDriverInfo(null);
    if (alerta.vehicleId) {
       try {
         const vDoc = await getDoc(doc(db, "vehicles", alerta.vehicleId));
         if (vDoc.exists()) {
           setVehicleImage(vDoc.data().imageUrl || null);
         }
       } catch (err) {
         console.error("Erro ao buscar imagem do veículo", err);
       }
    }
    if (alerta.driverName) {
       try {
         const qDriver = query(collection(db, "drivers"), where("name", "==", alerta.driverName), limit(1));
         const dSnap = await getDocs(qDriver);
         if (!dSnap.empty) {
           setDriverInfo(dSnap.docs[0].data());
         }
       } catch (err) {
         console.error("Erro ao buscar motorista", err);
       }
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, "auto_alertas", id), { status });
      if (selectedAlerta && selectedAlerta.id === id) {
        setSelectedAlerta({ ...selectedAlerta, status });
      }
      setCustomAlert({
        title: 'Sucesso',
        message: 'Status atualizado com sucesso.',
        type: 'success'
      });
    } catch (e) {
      console.error(e);
      setCustomAlert({
        title: 'Erro',
        message: 'Não foi possível atualizar o status.',
        type: 'error'
      });
    }
  };

  const handleDelete = async () => {
    if (alertaToDelete) {
      try {
        await deleteDoc(doc(db, "auto_alertas", alertaToDelete));
        setSelectedAlerta(null);
        setAlertaToDelete(null);
      } catch (e) {
        console.error(e);
        alert("Erro ao excluir AutoAlerta");
      }
    }
  };

  if (selectedAlerta) {
    return (
      <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
        <AnimatePresence>
          {customAlert && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setCustomAlert(null)}>
                <div className="bg-white border border-outline-variant rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                  <div className="p-6 text-center">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                      customAlert.type === 'error' ? 'bg-red-100 text-red-600' :
                      customAlert.type === 'success' ? 'bg-green-100 text-green-600' :
                      'bg-blue-100 text-blue-600'
                    }`}>
                      <span className="material-symbols-outlined text-[32px]">
                        {customAlert.type === 'error' ? 'warning' : customAlert.type === 'success' ? 'check_circle' : 'info'}
                      </span>
                    </div>
                    <h3 className="text-xl font-semibold text-on-surface mb-2">{customAlert.title || 'Atenção'}</h3>
                    <p className="text-sm text-on-surface-variant leading-relaxed">{customAlert.message}</p>
                  </div>
                  <div className="p-4 bg-slate-50 border-t border-outline-variant flex gap-3">
                    <button 
                      onClick={() => {
                        const onConfirm = customAlert.onConfirm;
                        setCustomAlert(null);
                        if (onConfirm) onConfirm();
                      }}
                      className={`flex-1 px-4 py-2 font-bold rounded-lg shadow-sm transition-all focus:outline-none ${
                        customAlert.type === 'error' ? 'bg-red-600 text-white hover:bg-red-700' :
                        customAlert.type === 'success' ? 'bg-green-600 text-white hover:bg-green-700' :
                        'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
          )}
        </AnimatePresence>
        <ConfirmModal 
          isOpen={!!alertaToDelete}
          title="Excluir AutoAlerta"
          message="Tem certeza que deseja excluir este AutoAlerta? Esta ação não pode ser desfeita."
          onConfirm={handleDelete}
          onCancel={() => setAlertaToDelete(null)}
        />
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              setSelectedAlerta(null);
            }}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          {vehicleImage ? (
             <div className="w-16 h-16 rounded-lg bg-white border border-outline-variant flex items-center justify-center overflow-hidden flex-shrink-0 p-1 shadow-sm">
                <img src={vehicleImage} alt="Veículo" className="w-full h-full object-contain" />
             </div>
          ) : (
             <div className="w-16 h-16 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-on-surface-variant/50 text-[32px]">local_shipping</span>
             </div>
          )}
          <div className="flex-1">
            <h2 className="text-[32px] font-bold text-on-surface tracking-tight mb-2">Tratativa de AutoAlerta</h2>
            <p className="text-on-surface-variant font-medium">Resolva o alerta {selectedAlerta.number}.</p>
          </div>
          <button
              onClick={() => setAlertaToDelete(selectedAlerta.id)}
              className="w-10 h-10 rounded-full bg-error-container text-on-error-container flex items-center justify-center hover:bg-error hover:text-white transition-colors"
              title="Excluir Alerta"
          >
              <span className="material-symbols-outlined">delete</span>
          </button>
        </div>

        <div className="bg-surface-container-lowest border border-error-container p-6 rounded-3xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-error text-white px-4 py-1 rounded-bl-xl font-bold text-sm shadow-md">
            {selectedAlerta.number}
          </div>
          <div className="flex flex-col md:flex-row gap-6 mb-6 pb-6 border-b border-outline-variant/50">
             <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Veículo</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">local_shipping</span>
                    <span className="font-bold text-on-surface">{selectedAlerta.plate}</span>
                  </div>
                </div>
                <div>
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Motorista</span>
                  <div className="mt-2 flex items-center gap-4">
                    {driverInfo?.imageUrl ? (
                      <div className="w-12 h-12 rounded-full overflow-hidden border border-outline-variant flex-shrink-0">
                         <img src={driverInfo.imageUrl} alt={selectedAlerta.driverName} className={`w-full h-full object-cover transition-all duration-300 ${isPrivacyMode ? 'blur-[8px]' : ''}`} />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center flex-shrink-0">
                         <span className="material-symbols-outlined text-on-surface-variant">person</span>
                      </div>
                    )}
                    <div>
                      <span className="font-bold text-on-surface block">{selectedAlerta.driverName}</span>
                      {driverInfo?.phone && (
                         <span className="text-sm text-on-surface-variant flex items-center gap-1 mt-1">
                            <span className="material-symbols-outlined text-[16px]">call</span>
                            {driverInfo.phone}
                         </span>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Status Atual</span>
                  <div className="mt-1">
                    {selectedAlerta.status === 'pending' && <span className="text-xs font-bold bg-warning-container text-on-warning-container px-3 py-1 rounded-full">Pendente</span>}
                    {selectedAlerta.status === 'os_generated' && <span className="text-xs font-bold bg-primary-container text-on-primary-container px-3 py-1 rounded-full">OS Gerada</span>}
                    {selectedAlerta.status === 'rejected' && <span className="text-xs font-bold bg-surface-container-high text-on-surface px-3 py-1 rounded-full">Ignorado</span>}
                  </div>
                </div>
             </div>
          </div>
          <div className="bg-error-container/30 border border-error-container/50 p-4 rounded-xl">
              <span className="text-xs font-semibold text-error uppercase tracking-wider flex items-center gap-1 mb-2">
                <span className="material-symbols-outlined text-[16px]">campaign</span>
                Reporte do Operador
              </span>
              <p className="text-on-surface font-medium whitespace-pre-wrap">{selectedAlerta.observation}</p>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-error-container/20">
             <button 
               onClick={async () => {
                 const element = document.getElementById('autoalerta-receipt-share');
                 if (!element) return;
                 try {
                   element.style.display = 'block';
                   const blob = await toBlob(element, {
                     cacheBust: true,
                     backgroundColor: '#ffffff',
                     style: {
                       transform: 'scale(1)',
                       transformOrigin: 'top left'
                     },
                     fontEmbedCSS: '' // Disable font embedding to avoid SecurityError
                   });
                   if (blob) {
                     await navigator.clipboard.write([
                         new ClipboardItem({ 'image/png': blob })
                     ]);
                     setCustomAlert({
                       title: 'Sucesso',
                       message: 'Cópia realizada! Agora cole no WhatsApp do motorista ou gestor.',
                       type: 'success'
                     });
                   }
                 } catch (err) {
                   console.error('Failed to copy image', err);
                   setCustomAlert({
                     title: 'Erro',
                     message: 'Não foi possível capturar a imagem da tratativa.',
                     type: 'error'
                   });
                 } finally {
                   element.style.display = 'none';
                 }
               }}
               className="px-4 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900 transition-colors flex items-center gap-2"
             >
               <span className="material-symbols-outlined text-[20px]">share</span>
               Compartilhar
             </button>
             {selectedAlerta.status === 'pending' && (
                <button 
                  onClick={() => handleUpdateStatus(selectedAlerta.id, 'rejected')}
                  className="px-4 py-2 border border-outline-variant text-on-surface-variant font-bold rounded-lg hover:bg-surface-container"
                >
                  Ignorar Alerta
                </button>
             )}
             {selectedAlerta.status !== 'os_generated' && (
                <>
                  <button 
                    onClick={() => navigate(`/checklist?vehicleId=${selectedAlerta.vehicleId || ''}&vehiclePlate=${encodeURIComponent(selectedAlerta.plate || '')}&autoAlertaId=${selectedAlerta.id}&driverName=${encodeURIComponent(selectedAlerta.driverName || '')}`)}
                    className="px-4 py-2 bg-primary-container text-on-primary-container font-bold rounded-lg hover:opacity-90 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[20px]">fact_check</span>
                    Iniciar Inspeção
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(selectedAlerta.id, 'os_generated')}
                    className="px-4 py-2 bg-primary text-on-primary font-bold rounded-lg hover:opacity-90 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                    Marcar como Tratado
                  </button>
                </>
             )}
          </div>
        </div>

        {/* Hidden element for sharing - Optimized UI based on model */}
        <div id="autoalerta-receipt-share" style={{ display: 'none', position: 'fixed', top: '0', left: '0', width: '480px', backgroundColor: '#f8fafc', padding: '16px' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '32px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            
            {/* Logo and Aura */}
            <div style={{ position: 'relative', marginBottom: '32px' }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '180px', height: '180px', background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%' }}></div>
              <img 
                src="https://i.imgur.com/9iZCsf6.png" 
                alt="Rota 360" 
                style={{ height: '70px', width: 'auto', position: 'relative', zIndex: 1 }} 
              />
            </div>

            {/* Status Icon Placeholder */}
            <div style={{ width: '80px', height: '80px', backgroundColor: '#eff6ff', borderRadius: '50%', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#dbeafe' }}></div>
            </div>

            <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#1e293b', margin: '0 0 4px 0', textAlign: 'center', lineHeight: '1.2' }}>AutoAlerta</h2>
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#1e293b', margin: '0 0 12px 0', textAlign: 'center', lineHeight: '1.2', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Emitido</h2>
            <p style={{ fontSize: '15px', color: '#64748b', margin: '0 0 32px 0', textAlign: 'center', fontWeight: '500' }}>Seu reporte foi enviado com sucesso.</p>

            {/* Ticket ID Box */}
            <div style={{ backgroundColor: '#f1f5f9', borderRadius: '20px', padding: '16px 40px', textAlign: 'center', marginBottom: '40px', width: '100%' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nº do Pedido</p>
              <p style={{ fontSize: '24px', fontWeight: '900', color: '#2563eb', margin: 0, fontFamily: 'monospace' }}>{selectedAlerta.number}</p>
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: '#f1f5f9', marginBottom: '32px' }}></div>

            {/* Info Cards */}
            <div style={{ width: '100%', display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <div style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: '16px', padding: '16px', border: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', margin: '0 0 6px 0', textTransform: 'uppercase' }}>Veículo</p>
                <p style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', margin: 0 }}>{selectedAlerta.plate}</p>
              </div>
              <div style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: '16px', padding: '16px', border: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', margin: '0 0 6px 0', textTransform: 'uppercase' }}>Motorista</p>
                <p style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', margin: 0 }}>{selectedAlerta.driverName}</p>
              </div>
            </div>

            <div style={{ width: '100%', backgroundColor: '#f8fafc', borderRadius: '16px', padding: '20px', border: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Observação</p>
              <p style={{ fontSize: '13px', color: '#334155', margin: 0, lineHeight: '1.6', fontWeight: '500' }}>
                {selectedAlerta.observation}
              </p>
            </div>

            {/* Interaction Mockups (visual only for the PNG) */}
            <div style={{ width: '100%', display: 'flex', gap: '8px', marginTop: '32px' }}>
               <div style={{ flex: 1, height: '44px', borderRadius: '12px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '12px', fontWeight: '700' }}>Imprimir / PNG</div>
               <div style={{ flex: 1, height: '44px', borderRadius: '12px', backgroundColor: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: '12px', fontWeight: '700' }}>Compartilhar</div>
               <div style={{ flex: 1, height: '44px', borderRadius: '12px', backgroundColor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '12px', fontWeight: '700' }}>Novo AutoAlerta</div>
            </div>
          </div>
        </div>

      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmModal 
        isOpen={!!alertaToDelete}
        title="Excluir AutoAlerta"
        message="Tem certeza que deseja excluir este AutoAlerta? Esta ação não pode ser desfeita."
        onConfirm={handleDelete}
        onCancel={() => setAlertaToDelete(null)}
      />
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-[32px] font-bold text-on-surface tracking-tight mb-2">Gestão de AutoAlertas</h2>
          <p className="text-on-surface-variant font-medium">Caixa de entrada de alertas de problemas reportados pelos operadores.</p>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-on-surface-variant font-medium">Carregando alertas...</div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Número</th>
                <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Data</th>
                <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Veículo</th>
                <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Problema Resumido</th>
                <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {alertas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-on-surface-variant">
                    Nenhum alerta pendente no momento.
                  </td>
                </tr>
              ) : (
                alertas.map(alerta => (
                  <tr key={alerta.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="p-4 text-sm font-mono font-bold text-primary">{alerta.number}</td>
                    <td className="p-4 text-sm font-medium text-on-surface">{new Date(alerta.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="p-4">
                      <div className="font-bold text-on-surface">{alerta.plate}</div>
                      <div className="text-xs text-on-surface-variant">{alerta.driverName}</div>
                    </td>
                    <td className="p-4 text-sm text-on-surface max-w-sm truncate" title={alerta.observation}>
                      {alerta.observation}
                    </td>
                    <td className="p-4">
                      {alerta.status === 'pending' && <span className="text-xs font-bold bg-warning-container text-on-warning-container px-3 py-1 rounded-full">Pendente</span>}
                      {alerta.status === 'os_generated' && <span className="text-xs font-bold bg-primary-container text-on-primary-container px-3 py-1 rounded-full">Tratado</span>}
                      {alerta.status === 'rejected' && <span className="text-xs font-bold bg-surface-container-high text-on-surface px-3 py-1 rounded-full">Ignorado</span>}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => setAlertaToDelete(alerta.id)}
                          className="px-3 py-2 bg-error-container text-on-error-container hover:bg-error hover:text-white transition-colors rounded-lg font-bold text-sm"
                          title="Excluir"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                        <button 
                          onClick={() => handleSelectAlerta(alerta)}
                          className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 transition-colors rounded-lg font-bold text-sm"
                        >
                          Avaliar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
