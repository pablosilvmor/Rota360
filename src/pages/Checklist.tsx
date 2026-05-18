import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, getDocs, serverTimestamp, setDoc, doc, query, orderBy, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { SearchableSelect } from '../components/SearchableSelect';
import { useNavigate, useSearchParams } from 'react-router';

// Items default
const defaultItems = [
  { item: 'Nível de Óleo', category: 'Motor', conformidade: 'Em conformidade', service: 'Nenhum' },
  { item: 'Nível de Água / Arrefecimento', category: 'Motor', conformidade: 'Em conformidade', service: 'Nenhum' },
  { item: 'Freios', category: 'Segurança', conformidade: 'Em conformidade', service: 'Nenhum' },
  { item: 'Pneus e Estepe', category: 'Rodagem', conformidade: 'Em conformidade', service: 'Nenhum' },
  { item: 'Sinalização e Faróis', category: 'Elétrica', conformidade: 'Em conformidade', service: 'Nenhum' },
  { item: 'Documentação (CRLV)', category: 'Geral', conformidade: 'Em conformidade', service: 'Nenhum' },
];

export function Checklist() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [step, setStep] = useState(1);
  const [driverName, setDriverName] = useState('');
  const [checklistDate, setChecklistDate] = useState(new Date().toISOString().split('T')[0]);
  const [vehicleId, setVehicleId] = useState('');
  const [vehicles, setVehicles] = useState<any[]>([]);
  
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const snap = await getDocs(collection(db, 'vehicles'));
        setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      }
    };
    fetchVehicles();
  }, []);

  // Carregar checklist para edição se houver um ID
  useEffect(() => {
    if (editId) {
      const loadChecklist = async () => {
        setLoading(true);
        try {
          const docRef = doc(db, 'checklist_history', editId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setDriverName(data.driverName || '');
            setVehicleId(data.vehicleId || '');
            setChecklistDate(data.date || new Date().toISOString().split('T')[0]);
            setItems(data.items || []);
            setStep(2); // Vai direto para a conferência dos itens
          }
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, 'checklist_history');
        } finally {
          setLoading(false);
        }
      };
      loadChecklist();
    }
  }, [editId]);

  const handleStartInspection = async () => {
    if (!driverName || !vehicleId) {
       alert("Preencha seu nome e selecione um veículo.");
       return;
    }
    
    setLoadingItems(true);
    try {
      // Decode vehicleId just in case it's stored mangled
      let itemsSnap = await getDocs(collection(db, `inspections/${vehicleId}/items`));
      
      // Fallback if the path was slightly different or if it was using plate as ID
      if (itemsSnap.empty) {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (vehicle && vehicle.plate) {
           itemsSnap = await getDocs(collection(db, `inspections/${vehicle.plate}/items`));
        }
      }
      
      const loadedItems = itemsSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          item: data.name,
          category: 'Geral',
          conformidade: 'Em conformidade',
          service: ''
        };
      });
      
      if (loadedItems.length === 0) {
        alert("Este veículo ainda não possui itens de inspeção cadastrados na Central de Inspeções. Por favor, cadastre os itens antes de prosseguir.");
        setLoadingItems(false);
        return;
      }
      
      setItems(loadedItems);
      setStep(2);
    } catch (e) {
       console.error("Error starting checklist:", e);
       handleFirestoreError(e, OperationType.LIST, `inspections/${vehicleId}/items`);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleUpdateItem = (index: number, field: string, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async () => {
    if (!driverName || !vehicleId) {
       alert("Preencha seu nome e selecione um veículo.");
       return;
    }
    
    setIsUploading(true);
    setLoading(true);
    setUploadProgress(10);

    try {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      setUploadProgress(20);
      
      // Criar o registro completo para o histórico (Arquivamento para consulta posterior)
      const checklistHistoryData = {
        driverName,
        date: checklistDate || new Date().toISOString().split('T')[0],
        vehicleId,
        vehiclePlate: vehicle?.plate || '',
        vehicleModel: vehicle?.model || '',
        items: items.map(item => ({
          id: item.id,
          item: item.item,
          category: item.category,
          conformidade: item.conformidade,
          service: item.service
        })),
        createdAt: serverTimestamp(),
        status: 'Concluído',
        type: 'Checklist Diário'
      };

      if (editId) {
        await updateDoc(doc(db, 'checklist_history', editId), checklistHistoryData);
      } else {
        await addDoc(collection(db, 'checklist_history'), checklistHistoryData);
      }
      
      setUploadProgress(50);
      
      // Fetch existing records for this vehicle
      const currentVehicleId = vehicleId;
      const recordsSnap = await getDocs(collection(db, `inspections/${currentVehicleId}/records`));
      const recordsByItemId = new Map();
      recordsSnap.forEach(doc => {
        recordsByItemId.set(doc.data().itemId, { id: doc.id, ...doc.data() });
      });
      setUploadProgress(70);

      // Update records based on inspection items
      for (const item of items) {
        const conformityVal = item.conformidade === 'Em conformidade' ? 'SIM' : 'NÃO';
        let serviceExec = item.service || 'NÃO';
        if (conformityVal === 'SIM') serviceExec = 'NÃO';
        
        const existingRecord = recordsByItemId.get(item.id);
        
        if (existingRecord) {
          await setDoc(doc(db, `inspections/${currentVehicleId}/records`, existingRecord.id), {
            conformity: conformityVal,
            serviceExecuted: serviceExec,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } else {
          await addDoc(collection(db, `inspections/${currentVehicleId}/records`), {
            itemId: item.id,
            conformity: conformityVal,
            serviceExecuted: serviceExec,
            lastMaintenanceKM: vehicle?.currentKM || 0,
            nextMaintenanceKM: (vehicle?.currentKM || 0) + 10000,
            updatedAt: serverTimestamp()
          });
        }
      }
      
      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setSuccess(true);
        // Após 2 segundos, redirecionar
        setTimeout(() => {
          navigate('/inspections');
        }, 2000);
      }, 500);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `inspections/${vehicleId}/records`);
      setIsUploading(false);
      setLoading(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (success) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-24 h-24 bg-primary-container text-primary rounded-full flex items-center justify-center mb-6"
        >
          <span className="material-symbols-outlined text-5xl">check_circle</span>
        </motion.div>
        <h2 className="text-3xl font-bold text-on-surface mb-4">Checklist Enviado com Sucesso!</h2>
        <p className="text-on-surface-variant mb-8 max-w-sm">Suas verificações foram enviadas ao controle de frota. Você será redirecionado em instantes.</p>
        <button 
          onClick={() => navigate('/inspections')}
          className="bg-primary text-on-primary font-bold px-8 py-3 rounded-full shadow-lg"
        >
          Voltar para Inspeções
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-24">
      <AnimatePresence>
        {isUploading && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <div className="bg-white rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-primary animate-bounce">cloud_upload</span>
              </div>
              <h3 className="text-xl font-bold mb-2 text-on-surface">Enviando Checklist...</h3>
              <p className="text-sm text-on-surface-variant mb-6">Aguarde enquanto processamos os dados.</p>
              
              <div className="h-3 w-full bg-surface-container-high rounded-full overflow-hidden mb-2">
                <motion.div 
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs font-bold text-primary">{uploadProgress}% concluído</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="bg-primary text-on-primary p-6 rounded-b-3xl shadow-md sticky top-0 z-10 transition-all">
         <div className="flex items-center gap-3 mb-2">
            <button 
              onClick={() => step === 1 ? window.history.back() : setStep(1)} 
              className="w-10 h-10 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div>
              <h1 className="text-2xl font-bold">Checklist Diário</h1>
              <p className="text-primary-container text-sm opacity-80">Preencha as informações do veículo</p>
            </div>
         </div>
         
         <div className="flex gap-2 mt-4">
           <div className={`h-2 flex-1 rounded-full ${step >= 1 ? 'bg-white' : 'bg-primary-fixed/30'}`}></div>
           <div className={`h-2 flex-1 rounded-full ${step >= 2 ? 'bg-white' : 'bg-primary-fixed/30'}`}></div>
         </div>
      </header>
      
      <main className="p-6 max-w-lg mx-auto mt-4">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="space-y-6"
            >
               <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant space-y-6">
                 <div>
                   <label className="block text-sm font-semibold text-on-surface-variant mb-2">Nome do Motorista</label>
                   <input 
                     type="text" 
                     className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:outline-none transition-colors" 
                     placeholder="Seu nome completo"
                     value={driverName}
                     onChange={e => setDriverName(e.target.value)}
                   />
                 </div>
                 
                 <div>
                   <label className="block text-sm font-semibold text-on-surface-variant mb-2">Data</label>
                   <input 
                     type="date" 
                     className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:outline-none transition-colors" 
                     value={checklistDate}
                     onChange={e => setChecklistDate(e.target.value)}
                   />
                 </div>
                 
                 <div>
                   <SearchableSelect 
                     label="Veículo"
                     placeholder="Selecione o veículo"
                     options={vehicles.map(v => ({ value: v.id, label: v.plate + " - " + v.model }))}
                     value={vehicleId}
                     onChange={val => setVehicleId(val)}
                   />
                 </div>
                 
                 <button 
                   onClick={handleStartInspection}
                   disabled={loadingItems}
                   className="w-full py-4 bg-primary text-on-primary rounded-xl font-bold mt-4 shadow-sm active:scale-95 transition-transform disabled:opacity-50"
                 >
                   {loadingItems ? 'Carregando...' : 'Iniciar Inspeção'}
                 </button>
               </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setStep(1)} className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface">
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h3 className="text-xl font-bold text-on-surface">Inspeção de Itens</h3>
              </div>

              {items.length === 0 && (
                <div className="text-center p-6 text-on-surface-variant bg-surface-container-low rounded-xl">
                  Este veículo não possui itens cadastrados na sua ficha de inspeção.
                </div>
              )}

              {items.map((item, idx) => (
                <div key={idx} className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-outline-variant">
                   <div className="flex items-center gap-3 mb-4">
                     <span className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs">
                       {idx + 1}
                     </span>
                     <div>
                       <p className="font-bold text-on-surface leading-tight">{item.item}</p>
                       <p className="text-[11px] text-on-surface-variant uppercase tracking-widest">{item.category}</p>
                     </div>
                   </div>
                   
                   <div className="space-y-4">
                     <div>
                       <label className="block text-xs font-semibold text-on-surface-variant mb-1">Conformidade</label>
                       <div className="flex gap-2">
                         <button 
                           onClick={() => handleUpdateItem(idx, 'conformidade', 'Em conformidade')}
                           className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${item.conformidade === 'Em conformidade' ? 'bg-primary-container border-primary-container text-on-primary-container' : 'border-outline-variant text-on-surface-variant'}`}
                         >
                           OK
                         </button>
                         <button 
                           onClick={() => handleUpdateItem(idx, 'conformidade', 'Não conforme')}
                           className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${item.conformidade === 'Não conforme' ? 'bg-error-container border-error-container text-on-error-container' : 'border-outline-variant text-on-surface-variant'}`}
                         >
                           Com Problema
                         </button>
                       </div>
                     </div>
                     
                     {item.conformidade === 'Não conforme' && (
                       <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}>
                         <label className="block text-xs font-semibold text-on-surface-variant mb-1">Ação Executada / Necessária</label>
                         <input 
                           type="text" 
                           value={item.service}
                           onChange={e => handleUpdateItem(idx, 'service', e.target.value)}
                           className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-sm focus:border-primary focus:outline-none" 
                           placeholder="Ex: Completou água, trocar pneu..."
                         />
                       </motion.div>
                     )}
                   </div>
                </div>
              ))}
              
              <button 
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-4 bg-primary text-on-primary rounded-xl font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                {loading ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : <span className="material-symbols-outlined">send</span>}
                {loading ? 'Enviando...' : 'Finalizar Checklist'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Botão flutuante Voltar ao Topo */}
        <motion.button
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={scrollToTop}
          className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-white rounded-full shadow-2xl flex items-center justify-center z-50 hover:bg-opacity-90 transition-colors"
          title="Voltar ao Topo"
        >
          <span className="material-symbols-outlined">arrow_upward</span>
        </motion.button>
      </main>
    </div>
  );
}
