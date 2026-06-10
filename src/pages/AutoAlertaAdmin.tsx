import React, { useState, useEffect } from "react";
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc, getDoc, where, limit, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ConfirmModal } from "../components/ConfirmModal";
import { useNavigate } from "react-router";
import { usePrivacy } from "../contexts/PrivacyContext";
import { toBlob } from 'html-to-image';

export function AutoAlertaAdmin() {
  const { isPrivacyMode } = usePrivacy();
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlerta, setSelectedAlerta] = useState<any | null>(null);
  const [vehicleImage, setVehicleImage] = useState<string | null>(null);
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [alertaToDelete, setAlertaToDelete] = useState<string | null>(null);

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
    } catch (e) {
      console.error(e);
      alert("Erro ao alterar status");
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
                     filter: (node) => {
                       if (node instanceof HTMLElement && node.classList.contains('material-symbols-outlined')) {
                         return false;
                       }
                       return true;
                     }
                   });
                   if (blob) {
                     await navigator.clipboard.write([
                         new ClipboardItem({ 'image/png': blob })
                     ]);
                     alert('Imagem copiada para a área de transferência!');
                   }
                 } catch (err) {
                   console.error('Failed to copy image', err);
                   alert('Não foi possível copiar a imagem.');
                 } finally {
                   element.style.display = 'none';
                 }
               }}
               className="px-4 py-2 bg-surface-container text-on-surface font-bold rounded-lg hover:bg-surface-container-high transition-colors flex items-center gap-2"
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

        {/* Hidden element for sharing */}
        <div id="autoalerta-receipt-share" style={{ display: 'none', position: 'absolute', top: '-9999px', left: '-9999px', width: '500px', backgroundColor: '#ffffff', color: '#000000', borderColor: '#d1d5db', padding: '2rem', borderRadius: '1.5rem', border: '1px solid #d1d5db', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '1.5rem', borderBottom: '1px solid #d1d5db', paddingBottom: '2rem' }}>
            <img 
              src="https://i.imgur.com/9iZCsf6.png" 
              alt="Rota 360" 
              style={{ 
                height: '10rem', 
                width: 'auto',
                objectFit: 'contain', 
                marginBottom: '1rem',
                filter: 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.7))'
              }} 
            />
            <div style={{ width: '5rem', height: '5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff', color: '#2563eb' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem' }}>campaign</span>
            </div>
            <div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#000000', margin: 0 }}>AutoAlerta Emitido</h2>
              <p style={{ color: '#666666', marginTop: '0.5rem' }}>Reporte da equipe.</p>
            </div>
            <div style={{ padding: '0.75rem 2rem', borderRadius: '0.75rem', backgroundColor: '#f3f4f6' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#666666' }}>Nº do Pedido</span>
              <p style={{ fontSize: '1.5rem', fontFamily: 'monospace', fontWeight: 'bold', color: '#2563eb', margin: 0 }}>{selectedAlerta.number}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '1rem', borderRadius: '0.75rem', backgroundColor: '#f9fafb' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#666666', textTransform: 'uppercase' }}>Veículo</span>
                <p style={{ fontWeight: '500', color: '#000000', marginTop: '0.25rem' }}>{selectedAlerta.plate}</p>
              </div>
              <div style={{ padding: '1rem', borderRadius: '0.75rem', backgroundColor: '#f9fafb' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#666666', textTransform: 'uppercase' }}>Motorista</span>
                <p style={{ fontWeight: '500', color: '#000000', marginTop: '0.25rem' }}>{selectedAlerta.driverName}</p>
              </div>
            </div>
            <div style={{ padding: '1rem', borderRadius: '0.75rem', backgroundColor: '#f9fafb' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#666666', textTransform: 'uppercase' }}>Observação</span>
              <p style={{ fontSize: '0.875rem', color: '#000000', marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{selectedAlerta.observation}</p>
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
