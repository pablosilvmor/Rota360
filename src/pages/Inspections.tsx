import { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, doc, getDoc, setDoc, deleteDoc, writeBatch, serverTimestamp, updateDoc, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useParams, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';

interface InspectionItem {
  id: string;
  name: string;
  periodicityKM: number;
}

interface InspectionRecord {
  id: string;
  itemId: string;
  conformity: 'SIM' | 'NÃO' | 'NA' | '';
  serviceExecuted: 'SIM' | 'NÃO' | 'NaKM' | '';
  lastMaintenanceKM: number;
  nextMaintenanceKM: number;
}

function InspectionForm({ vehicleId, onBack }: { vehicleId: string, onBack: () => void }) {
  const [vehicle, setVehicle] = useState<any>(null);
  const [loadingForm, setLoadingForm] = useState(true);
  const [loadingVehicle, setLoadingVehicle] = useState(true);
  
  const [currentKM, setCurrentKM] = useState<number>(0);
  const [isUpdatingKM, setIsUpdatingKM] = useState(false);

  const [items, setItems] = useState<InspectionItem[]>([]);
  const [records, setRecords] = useState<Record<string, InspectionRecord>>({});
  
  const [showImport, setShowImport] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [newItemData, setNewItemData] = useState({ name: '', periodicityKM: '' });
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [vehicleImgDataUrl, setVehicleImgDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [resolvedVehicleId, setResolvedVehicleId] = useState<string | null>(null);

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemData, setEditItemData] = useState<{name: string, periodicityKM: number}>({name: '', periodicityKM: 0});
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc'|'desc' } | null>(null);
  const [itemSearchText, setItemSearchText] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<{ 
    isOpen: boolean; 
    isBulk: boolean; 
    itemId?: string; 
  }>({ isOpen: false, isBulk: false });

  const formatKM = (km: number | undefined | null) => {
    if (km === undefined || km === null) return '0';
    return km.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  };

  useEffect(() => {
    // Fetch vehicle details
    let isMounted = true;
    const fetchVehicle = async () => {
      try {
        let vDoc = await getDoc(doc(db, 'vehicles', vehicleId));
        if (!vDoc.exists()) {
          vDoc = await getDoc(doc(db, 'vehicles', decodeURIComponent(vehicleId)));
        }
        
        let vehicleData = null;
        let finalId = vehicleId;

        if (vDoc.exists()) {
          vehicleData = vDoc.data();
          finalId = vDoc.id;
        } else {
          // Fallback to querying by plate or other possible mangled IDs
          const decId = decodeURIComponent(vehicleId);
          let q = query(collection(db, 'vehicles'), where('plate', '==', decId));
          let snap = await getDocs(q);
          
          if (snap.empty) {
             q = query(collection(db, 'vehicles'), where('plate', '==', decId.trim()));
             snap = await getDocs(q);
          }
          
          if (!snap.empty) {
            vehicleData = snap.docs[0].data();
            finalId = snap.docs[0].id;
          } else {
             // one more try if the doc ID actually has spaces
             q = query(collection(db, 'vehicles'));
             const allSnap = await getDocs(q);
             const matched = allSnap.docs.find(d => d.id.replace(/[^a-zA-Z0-9]/g, '') === decId.replace(/[^a-zA-Z0-9]/g, '') || d.data().plate === decId);
             if (matched) {
                 vehicleData = matched.data();
                 finalId = matched.id;
             }
          }
        }

        if (vehicleData && isMounted) {
          setVehicle({ id: finalId, ...vehicleData });
          setCurrentKM(vehicleData.currentKM || 0);
          setResolvedVehicleId(finalId);

          // Pre-load vehicle image to handle CORS for PDF export
          const imgUrl = vehicleData.imageUrl || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800";
          fetch(imgUrl)
            .then(res => res.blob())
            .then(blob => {
              const reader = new FileReader();
              reader.onloadend = () => {
                if (isMounted) setVehicleImgDataUrl(reader.result as string);
              };
              reader.readAsDataURL(blob);
            })
            .catch(err => console.error("Error pre-loading vehicle image for PDF:", err));
        }
      } catch (error) {
        console.error('Error fetching vehicle:', error);
        handleFirestoreError(error, OperationType.GET, `vehicles/${vehicleId}`);
      } finally {
        if (isMounted) {
          setLoadingVehicle(false);
          // If after all attempts vehicleData is null, finalId is not resolving,
          // we are not going to set resolvedVehicleId, so second effect won't run.
          // In that case we must clear loadingForm to let the !vehicle check trigger.
          setLoadingForm(false); 
        }
      }
    };

    fetchVehicle();
  }, [vehicleId]);

  useEffect(() => {
    if (!resolvedVehicleId) return;

    let isMounted = true;
    let unsubscribeItems: any = null;
    let unsubscribeRecords: any = null;

    try {
      // Listen to inspection items for this vehicle
      const qItems = query(collection(db, `inspections/${resolvedVehicleId}/items`));
      unsubscribeItems = onSnapshot(qItems, (snapshot) => {
        if (!isMounted) return;
        const itemsData = snapshot.docs.map(d => {
          const data = d.data();
          let periodicityKM = Number(data.periodicityKM);
          if (periodicityKM === 100000) {
            periodicityKM = 10000;
            updateDoc(doc(db, `inspections/${resolvedVehicleId}/items`, d.id), { periodicityKM: 10000 }).catch(console.error);
          }
          return { id: d.id, ...data, periodicityKM };
        }) as InspectionItem[];
        setItems(itemsData);
      }, (error) => {
         console.error("Error items listener:", error);
         handleFirestoreError(error, OperationType.LIST, `inspections/${resolvedVehicleId}/items`);
      });

      // Listen to inspection records for this vehicle
      const qRecords = query(collection(db, `inspections/${resolvedVehicleId}/records`));
      unsubscribeRecords = onSnapshot(qRecords, (snapshot) => {
        if (!isMounted) return;
        const recs: Record<string, InspectionRecord> = {};
        snapshot.docs.forEach(d => {
          const data = d.data() as InspectionRecord;
          recs[data.itemId] = { id: d.id, ...data };
        });
        setRecords(recs);
        setLoadingForm(false);
      }, (error) => {
         console.error("Error records listener:", error);
         handleFirestoreError(error, OperationType.LIST, `inspections/${resolvedVehicleId}/records`);
         if (isMounted) setLoadingForm(false);
      });
    } catch (e: any) {
      console.error('Error starting listeners:', e);
      if (isMounted) setLoadingForm(false);
    }

    return () => {
      isMounted = false;
      if (unsubscribeItems) unsubscribeItems();
      if (unsubscribeRecords) unsubscribeRecords();
    };
  }, [resolvedVehicleId]);

  // Consistency check useEffect to fix incorrect NextMaintenanceKM
  useEffect(() => {
    if (!resolvedVehicleId || items.length === 0 || Object.keys(records).length === 0) return;

    const fixInconsistencies = async () => {
      const batch = writeBatch(db);
      let needsBatch = false;

      items.forEach(item => {
        const record = records[item.id];
        if (record) {
          const expectedNextKM = Number(record.lastMaintenanceKM) + Number(item.periodicityKM);
          // If difference is more than 0 (to avoid float issues, though they should be ints)
          if (Math.abs(Number(record.nextMaintenanceKM) - expectedNextKM) > 0.1) {
            console.log(`Syncing record for ${item.name}: ${record.nextMaintenanceKM} -> ${expectedNextKM}`);
            batch.update(doc(db, `inspections/${resolvedVehicleId}/records`, record.id), {
              nextMaintenanceKM: expectedNextKM,
              updatedAt: serverTimestamp()
            });
            needsBatch = true;
          }
        }
      });

      if (needsBatch) {
        try {
          await batch.commit();
        } catch (error) {
          console.error("Error syncing maintenance KM:", error);
        }
      }
    };

    fixInconsistencies();
  }, [items, records, resolvedVehicleId]);

  const parseKM = (val: string) => {
    return parseInt(val.replace(/\D/g, '') || '0', 10);
  };

  const handleUpdateKM = async () => {
    if (!vehicle) return;
    setIsUpdatingKM(true);
    try {
      await updateDoc(doc(db, 'vehicles', vehicleId), {
        currentKM: currentKM,
        updatedAt: serverTimestamp()
      });
      // Also save the record in vehicle state so we don't feel lagging
      setVehicle({ ...vehicle, currentKM });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `vehicles/${vehicleId}`);
    } finally {
      setIsUpdatingKM(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      const element = document.getElementById('inspection-print-container');
      if (!element) return;

      // Usando toJpeg com configurações robustas
      const dataUrl = await htmlToImage.toJpeg(element, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true,
        style: {
          fontFamily: 'sans-serif'
        },
        filter: (node: any) => {
          // Ignorar botões de ação e modais na exportação
          if (node?.getAttribute && (node.getAttribute('data-html2canvas-ignore') === 'true' || node.classList?.contains('fixed'))) {
            return false;
          }
          return true;
        }
      });
      
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Inspecao_${vehicle.plate}.pdf`);
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      alert('Houve um problema ao gerar o PDF. Recomendamos abrir o aplicativo em uma aba separada (fora do preview) ou usar o Google Chrome para esta operação.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileImport = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsReadingFile(true);
    try {
      const fileName = file.name.toLowerCase();
      const extension = fileName.split('.').pop();
      let importedData: { name: string, periodicityKM: number }[] = [];

      if (['xls', 'xlsx', 'xlsm'].includes(extension || '')) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        
        // Skip header (first row)
        const rows = json.slice(1);
        importedData = rows.map(row => {
          if (row && Array.isArray(row) && row.length >= 2) {
            const name = String(row[0] || '').trim();
            const km = String(row[1] || '').trim();
            if (name && km) {
              return {
                name,
                periodicityKM: parseKM(km)
              };
            }
          }
          return null;
        }).filter(Boolean) as any[];
      }
      
      if (importedData.length > 0) {
        const text = importedData.map(d => `${d.name} ; ${formatKM(d.periodicityKM)}`).join('\n');
        setImportText(prev => prev ? prev + '\n' + text : text);
        setImportError(null);
      } else {
        setImportError('Nenhum dado válido encontrado no arquivo. Use o formato: Nome ; Periodicidade');
      }
    } catch (error: any) {
      console.error('Error reading file:', error);
      setImportError(`Erro ao ler o arquivo. Detalhe: ${error.message || 'Verifique se o formato está correto.'}`);
    } finally {
      setIsReadingFile(true); // Small delay feel
      setTimeout(() => setIsReadingFile(false), 500);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportItems = async () => {
    if (!importText.trim()) return;
    setIsSaving(true);
    try {
      const lines = importText.split('\n').filter(l => l.trim() !== '');
      const batch = writeBatch(db);

      const existingNames = new Set(items.map(i => i.name.toLowerCase().trim()));
      const duplicatesFound: string[] = [];
      const addedNames = new Set<string>();
      let addedCount = 0;

      lines.forEach(line => {
        // Expected format: Nome do Item ; Periodicidade
        const parts = line.split(';').map(s => s.trim());
        if (parts.length >= 2) {
          const name = parts[0];
          const periodicityKM = parseKM(parts[1]);
          const normalizedName = name.toLowerCase().trim();
          
          if (!isNaN(periodicityKM) && periodicityKM > 0) {
            if (existingNames.has(normalizedName) || addedNames.has(normalizedName)) {
               if(!duplicatesFound.includes(name)) duplicatesFound.push(name);
            } else {
              const newItemRef = doc(collection(db, `inspections/${vehicleId}/items`));
              batch.set(newItemRef, {
                name,
                periodicityKM,
                createdAt: serverTimestamp()
              });
              // Also create a default record
              const newRecordRef = doc(collection(db, `inspections/${vehicleId}/records`));
              batch.set(newRecordRef, {
                itemId: newItemRef.id,
                conformity: 'SIM',
                serviceExecuted: 'NÃO',
                lastMaintenanceKM: 0,
                nextMaintenanceKM: periodicityKM,
                updatedAt: serverTimestamp()
              });
              addedNames.add(normalizedName);
              addedCount++;
            }
          }
        }
      });
      
      if (addedCount > 0) {
        await batch.commit();
      }
      
      setShowImport(false);
      setImportText('');
      
      if (duplicatesFound.length > 0) {
        alert(`Foram identificados ${duplicatesFound.length} itens duplicados. Eles foram ignorados para evitar duplicidade na tabela.\n\nItens ignorados:\n${duplicatesFound.slice(0, 10).join('\n')}${duplicatesFound.length > 10 ? '\n...' : ''}`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `inspections/${vehicleId}/items`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewItem = async () => {
    const name = newItemData.name.trim();
    const periodicityKM = parseKM(newItemData.periodicityKM);
    if (!name || isNaN(periodicityKM) || periodicityKM <= 0) {
      alert("Preencha o nome e a periodicidade de forma válida.");
      return;
    }
    
    if (items.some(i => i.name.toLowerCase().trim() === name.toLowerCase())) {
        alert(`O item "${name}" já existe na tabela. Operação cancelada para evitar duplicidade.`);
        return;
    }
    
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const newItemRef = doc(collection(db, `inspections/${vehicleId}/items`));
      batch.set(newItemRef, {
        name,
        periodicityKM,
        createdAt: serverTimestamp()
      });
      const newRecordRef = doc(collection(db, `inspections/${vehicleId}/records`));
      batch.set(newRecordRef, {
        itemId: newItemRef.id,
        conformity: 'SIM',
        serviceExecuted: 'NÃO',
        lastMaintenanceKM: 0,
        nextMaintenanceKM: periodicityKM,
        updatedAt: serverTimestamp()
      });
      await batch.commit();
      setShowNewItem(false);
      setNewItemData({ name: '', periodicityKM: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `inspections/${vehicleId}/items`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredItems = items.filter(i => i.name.toLowerCase().includes(itemSearchText.toLowerCase()));

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (!sortConfig) return 0;
    let aVal: any = a[sortConfig.key as keyof InspectionItem];
    let bVal: any = b[sortConfig.key as keyof InspectionItem];
    
    // Sort by records fields if requested
    if (sortConfig.key === 'lastMaintenanceKM' || sortConfig.key === 'nextMaintenanceKM' || sortConfig.key === 'conformity' || sortConfig.key === 'serviceExecuted') {
       aVal = records[a.id]?.[sortConfig.key as keyof InspectionRecord];
       bVal = records[b.id]?.[sortConfig.key as keyof InspectionRecord];
    }
    
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedItems(newSet);
  };
  
  const toggleAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(i => i.id)));
    }
  };

  const handleBulkDelete = () => {
     setConfirmDelete({ isOpen: true, isBulk: true });
  };

  const handleDeleteItem = (id: string) => {
     setConfirmDelete({ isOpen: true, isBulk: false, itemId: id });
  };

  const executeDelete = async () => {
     const { isBulk, itemId } = confirmDelete;
     setConfirmDelete({ ...confirmDelete, isOpen: false });
     
     if (isBulk) {
       try {
         const batch = writeBatch(db);
         for(let id of selectedItems) {
            batch.delete(doc(db, `inspections/${resolvedVehicleId}/items`, id));
            if (records[id]) {
               batch.delete(doc(db, `inspections/${resolvedVehicleId}/records`, records[id].id));
            }
         }
         await batch.commit();
         setSelectedItems(new Set());
       } catch (error) {
         handleFirestoreError(error, OperationType.DELETE, `inspections/${resolvedVehicleId}/items`);
       }
     } else if (itemId) {
       try {
         const batch = writeBatch(db);
         batch.delete(doc(db, `inspections/${resolvedVehicleId}/items`, itemId));
         if (records[itemId]) {
            batch.delete(doc(db, `inspections/${resolvedVehicleId}/records`, records[itemId].id));
         }
         await batch.commit();
         
         const newSelected = new Set(selectedItems);
         newSelected.delete(itemId);
         setSelectedItems(newSelected);
       } catch (error) {
         handleFirestoreError(error, OperationType.DELETE, `inspections/${resolvedVehicleId}/items`);
       }
     }
  };

  const startEditing = (item: InspectionItem) => {
     setEditingItemId(item.id);
     setEditItemData({ name: item.name, periodicityKM: item.periodicityKM });
  };

  const saveEdit = async (id: string) => {
     try {
       const batch = writeBatch(db);
       batch.update(doc(db, `inspections/${resolvedVehicleId}/items`, id), {
          name: editItemData.name,
          periodicityKM: editItemData.periodicityKM
       });
       if(records[id]) {
          // Recompute nextMaintenanceKM
          const next = records[id].lastMaintenanceKM + editItemData.periodicityKM;
          batch.update(doc(db, `inspections/${resolvedVehicleId}/records`, records[id].id), {
             nextMaintenanceKM: next
          });
       }
       await batch.commit();
       setEditingItemId(null);
     } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `inspections/${resolvedVehicleId}/items`);
     }
  };

  const updateRecord = async (itemId: string, updates: Partial<InspectionRecord>) => {
    const record = records[itemId];
    if (!record) return;

    try {
      if (updates.lastMaintenanceKM !== undefined) {
        const item = items.find(i => i.id === itemId);
        if (item) {
          const value = Number(updates.lastMaintenanceKM);
          const batch = writeBatch(db);
          
          // Find all items with same periodicityKM
          const matchingItems = items.filter(i => i.periodicityKM === item.periodicityKM);
          
          // Optimistic state updates
          const newRecordsState = { ...records };
          
          for (const mItem of matchingItems) {
            const mRecord = records[mItem.id];
            if (mRecord) {
               const nextKM = value + mItem.periodicityKM;
               newRecordsState[mItem.id] = { ...mRecord, lastMaintenanceKM: value, nextMaintenanceKM: nextKM };
               
               const mRecRef = doc(db, `inspections/${resolvedVehicleId}/records`, mRecord.id);
               batch.update(mRecRef, {
                 lastMaintenanceKM: value,
                 nextMaintenanceKM: nextKM,
                 updatedAt: serverTimestamp()
               });
            }
          }
          
          setRecords(newRecordsState);
          await batch.commit();
          return;
        }
      }

      // Normal single update
      const recRef = doc(db, `inspections/${resolvedVehicleId}/records`, record.id);
      
      // Calculate nextMaintenanceKM if lastMaintenanceKM changes (fallback if previous block bypassed)
      let nextKM = record.nextMaintenanceKM;
      if (updates.lastMaintenanceKM !== undefined) {
        const item = items.find(i => i.id === itemId);
        if (item) {
          nextKM = Number(updates.lastMaintenanceKM) + item.periodicityKM;
          updates.nextMaintenanceKM = nextKM;
        }
      }

      // Optimistic update
      setRecords(prev => ({
        ...prev,
        [itemId]: { ...prev[itemId], ...updates }
      }));

      await updateDoc(recRef, { ...updates, updatedAt: serverTimestamp() });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inspections/${resolvedVehicleId}/records`);
    }
  };

  if (loadingForm || loadingVehicle) {
    return <div className="p-8 text-center">Carregando formulário...</div>;
  }

  if (!vehicle) {
    return (
      <div className="p-8 text-center text-error flex flex-col items-center justify-center min-h-[40vh]">
        <div className="bg-error-container/30 text-error p-4 rounded-full mb-4">
          <span className="material-symbols-outlined text-4xl">error</span>
        </div>
        <h3 className="text-xl font-bold mb-2">Veículo não encontrado</h3>
        <p className="text-on-surface-variant max-w-md">
          Não foi possível encontrar o veículo selecionado. Verifique se o veículo ainda existe na frota (ID procurado: <code className="bg-surface-container px-1 py-0.5 rounded text-xs">{vehicleId}</code>).
        </p>
        <button 
          onClick={onBack} 
          className="mt-6 px-6 py-2 bg-primary text-on-primary rounded-lg font-bold shadow-sm hover:opacity-90 transition-all"
        >
          Voltar para Inspeções
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="inspection-print-container">
      <div className="flex flex-col md:flex-row justify-between md:items-center bg-surface-container-low p-6 rounded-2xl border border-outline-variant gap-6">
        <div className="flex items-center gap-5">
          <button onClick={onBack} data-html2canvas-ignore="true" className="p-2 hover:bg-surface-container rounded-full transition-colors flex-shrink-0">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          
           <div className="w-16 h-16 rounded-xl overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] flex-shrink-0 border border-outline-variant bg-white">
             <img 
               className="w-full h-full object-contain p-1" 
               src={vehicleImgDataUrl || vehicle.imageUrl || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800"} 
               alt={vehicle.model} 
             />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-on-surface">Inspeção: <span className="text-primary tracking-wide">{vehicle.plate}</span></h2>
            <p className="text-on-surface-variant font-medium text-sm mt-0.5">{vehicle.brand} {vehicle.model}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-surface-container p-4 rounded-xl border border-outline-variant shadow-sm w-full md:w-auto">
          <div className="w-full">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5 block">KM Atual</label>
            <div className="flex items-center gap-2">
              <input 
                type="text"
                value={formatKM(currentKM)}
                onChange={(e) => setCurrentKM(parseKM(e.target.value))}
                className="w-full md:w-32 bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-1.5 font-mono text-sm focus:ring-2 focus:ring-primary outline-none"
              />
              <button 
                onClick={handleUpdateKM}
                data-html2canvas-ignore="true"
                disabled={isUpdatingKM || currentKM === vehicle.currentKM}
                className="bg-primary/10 text-primary hover:bg-primary/20 p-2 rounded-lg transition-colors disabled:opacity-50 disabled:bg-surface-container disabled:text-on-surface-variant flex-shrink-0"
                title="Salvar KM Atual"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <h3 className="text-[20px] font-bold text-on-surface flex items-center gap-2">
          Itens de Inspeção
          <span className="text-[12px] font-bold bg-surface-container-high px-2 py-0.5 rounded-full text-on-surface-variant flex items-center justify-center min-w-[24px]">
            {filteredItems.length}
          </span>
        </h3>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto" data-html2canvas-ignore="true">
          <button 
            onClick={exportToPDF}
            disabled={isExporting}
            className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-2 border border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high rounded-lg font-bold shadow-sm transition-all text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
            {isExporting ? 'Processando...' : 'Exportar PDF'}
          </button>
          {selectedItems.size > 0 && (
            <button 
              onClick={handleBulkDelete}
              className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-2 bg-error text-onError rounded-lg font-bold shadow-sm hover:opacity-90 transition-all text-sm"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Excluir ({selectedItems.size})
            </button>
          )}
          <button 
            onClick={() => setShowImport(true)}
            className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-2 border border-outline-variant text-on-surface-variant hover:text-on-surface rounded-lg font-bold shadow-sm hover:bg-surface-container-low transition-all text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">publish</span>
            Importar
          </button>
          <button 
            onClick={() => setShowNewItem(true)}
            className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold shadow-sm hover:opacity-90 transition-all text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Novo Item
          </button>
        </div>
      </div>

      {showNewItem && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm mb-6 animate-in fade-in slide-in-from-top-2" data-html2canvas-ignore="true">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-on-surface">Cadastrar Novo Item</h3>
            <button onClick={() => setShowNewItem(false)} className="text-on-surface-variant hover:text-error transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">Nome do Item</label>
              <input 
                type="text" 
                value={newItemData.name}
                onChange={e => setNewItemData({...newItemData, name: e.target.value})}
                placeholder="Ex: Troca de Óleo"
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">Periodicidade (KM)</label>
              <input 
                type="text" 
                value={newItemData.periodicityKM ? formatKM(parseKM(newItemData.periodicityKM)) : ''}
                onChange={e => {
                  const parsed = parseKM(e.target.value);
                  setNewItemData({...newItemData, periodicityKM: parsed > 0 ? String(parsed) : ''});
                }}
                placeholder="Ex: 10.000"
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
            <button
              onClick={() => setShowNewItem(false)}
              className="px-6 py-2 text-on-surface-variant font-bold hover:bg-surface-container-low rounded-lg transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateNewItem}
              disabled={isSaving || !newItemData.name.trim() || !newItemData.periodicityKM.trim()}
              className="px-6 py-2 bg-primary text-on-primary rounded-lg font-bold shadow-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? 'Salvando...' : 'Salvar Item'}
            </button>
          </div>
        </div>
      )}

      {showImport && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm mb-6 animate-in fade-in slide-in-from-top-2" data-html2canvas-ignore="true">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-on-surface">Importar Itens e Periodicidade</h3>
            <button onClick={() => { setShowImport(false); setImportError(null); }} className="text-on-surface-variant hover:text-error transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {importError && (
            <div className="mb-4 p-3 bg-error-container/30 text-error text-xs rounded-lg flex items-center gap-2 border border-error/20">
               <span className="material-symbols-outlined text-[18px]">error</span>
               {importError}
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">Opção 1: Arquivo (Excel)</p>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-outline-variant rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-surface-container-low hover:border-primary transition-all group"
              >
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-[28px]">upload_file</span>
                </div>
                <p className="text-sm font-bold text-on-surface mb-1">Clique para selecionar</p>
                <p className="text-[11px] text-on-surface-variant text-center">Planilhas (.xls, .xlsx, .xlsm)</p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileImport} 
                  className="hidden" 
                  accept=".xls, .xlsx, .xlsm"
                />
              </div>
              {isReadingFile && (
                <div className="mt-2 flex items-center gap-2 text-primary font-bold text-xs animate-pulse">
                  <span className="material-symbols-outlined text-[16px] spin">sync</span>
                  Processando arquivo...
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">Opção 2: Entrada Manual</p>
              <p className="text-[11px] text-on-surface-variant mb-2 italic">Cole ou digite os dados abaixo seguindo o padrão:</p>
              <p className="text-[11px] font-mono text-primary font-bold mb-2 bg-primary/5 p-2 rounded">Nome do Item ; Periodicidade (ex: Filtro de Óleo ; 10.000)</p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Exemplo:&#10;Troca de Óleo ; 10.000&#10;Filtro de Ar ; 5.000"
                className="w-full h-32 bg-surface-container-low border border-outline-variant rounded-xl p-3 text-sm text-on-surface resize-none focus:ring-2 focus:ring-primary outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
            <button
              onClick={() => { setShowImport(false); setImportError(null); }}
              className="px-6 py-2 text-on-surface-variant font-bold hover:bg-surface-container-low rounded-lg transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleImportItems}
              disabled={isSaving || !importText.trim()}
              className="px-6 py-2 bg-primary text-on-primary rounded-lg font-bold shadow-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? 'Importando...' : 'Confirmar Importação'}
            </button>
          </div>
        </div>
      )}

        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
          {/* Custom Confirm Delete Modal */}
          {confirmDelete.isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" data-html2canvas-ignore="true">
              <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant p-6 max-w-sm w-full animate-in zoom-in-95 fade-in duration-200">
                <div className="flex items-center gap-3 text-error mb-4">
                  <span className="material-symbols-outlined text-[32px]">warning</span>
                  <h4 className="text-xl font-bold">Confirmar Exclusão</h4>
                </div>
                <p className="text-on-surface-variant mb-6">
                  {confirmDelete.isBulk 
                    ? `Tem certeza que deseja excluir os ${selectedItems.size} itens selecionados? Esta ação não pode ser desfeita.`
                    : 'Tem certeza que deseja excluir este item de inspeção? Esta ação não pode ser desfeita.'}
                </p>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setConfirmDelete({ ...confirmDelete, isOpen: false })}
                    className="px-4 py-2 text-on-surface-variant font-bold hover:bg-surface-container rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={executeDelete}
                    className="px-4 py-2 bg-error text-onError rounded-lg font-bold shadow-sm hover:opacity-90 transition-all"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* List Toolbar / Filter */}
          <div className="p-4 border-b border-outline-variant flex flex-col md:flex-row items-center justify-between gap-4 bg-surface-container-low/30" data-html2canvas-ignore="true">
            <div className="relative w-full md:w-80 group">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 group-focus-within:text-primary transition-colors text-[20px]">search</span>
              <input 
                type="text" 
                placeholder="Filtrar itens..." 
                value={itemSearchText}
                onChange={e => setItemSearchText(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-sm"
              />
            </div>
            {itemSearchText && (
              <button 
                onClick={() => setItemSearchText('')}
                className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors uppercase tracking-widest px-3 py-1.5 rounded-full hover:bg-surface-container-low"
              >
                Limpar Filtros
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50 border-b border-outline-variant">
                <th className="p-4 w-12 text-center border-r border-outline-variant/30" data-html2canvas-ignore="true">
                  <input type="checkbox" onChange={toggleAll} checked={items.length > 0 && selectedItems.size === items.length} className="rounded cursor-pointer" />
                </th>
                <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider cursor-pointer select-none hover:bg-surface-container-low transition-colors" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">Item {sortConfig?.key === 'name' ? <span className="material-symbols-outlined text-[14px]">{sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span> : <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-50">unfold_more</span>}</div>
                </th>
                <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider cursor-pointer select-none hover:bg-surface-container-low transition-colors" onClick={() => handleSort('conformity')}>
                  <div className="flex items-center gap-1">Ações Conformidade {sortConfig?.key === 'conformity' ? <span className="material-symbols-outlined text-[14px]">{sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span> : <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-50">unfold_more</span>}</div>
                </th>
                <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider cursor-pointer select-none hover:bg-surface-container-low transition-colors" onClick={() => handleSort('serviceExecuted')}>
                  <div className="flex items-center gap-1">Serviço Executado {sortConfig?.key === 'serviceExecuted' ? <span className="material-symbols-outlined text-[14px]">{sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span> : <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-50">unfold_more</span>}</div>
                </th>
                <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider cursor-pointer select-none hover:bg-surface-container-low transition-colors" onClick={() => handleSort('lastMaintenanceKM')}>
                  <div className="flex items-center gap-1">Última Manut. (KM) {sortConfig?.key === 'lastMaintenanceKM' ? <span className="material-symbols-outlined text-[14px]">{sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span> : <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-50">unfold_more</span>}</div>
                </th>
                <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider cursor-pointer select-none hover:bg-surface-container-low transition-colors min-w-[170px]" onClick={() => handleSort('nextMaintenanceKM')}>
                  <div className="flex items-center gap-1">Progresso {sortConfig?.key === 'nextMaintenanceKM' ? <span className="material-symbols-outlined text-[14px]">{sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span> : <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-50">unfold_more</span>}</div>
                </th>
                <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider text-center border-l border-outline-variant/30" data-html2canvas-ignore="true">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-on-surface-variant">
                    Nenhum item importado para este veículo.
                  </td>
                </tr>
              ) : (
                sortedItems.map(item => {
                  const record = records[item.id];
                  if (!record) return null;

                  const currentVehicleKM = vehicle.currentKM || vehicle.odometer || 0;
                  const kmSinceLast = currentVehicleKM - record.lastMaintenanceKM;
                  let progressPercent = 0;
                  if (item.periodicityKM > 0) {
                     progressPercent = Math.min(100, Math.max(0, (kmSinceLast / item.periodicityKM) * 100));
                  }
                  
                  const remainingKM = record.nextMaintenanceKM - currentVehicleKM;

                  let progressColor = 'bg-primary';
                  if (progressPercent > 80) progressColor = 'bg-tertiary';
                  if (progressPercent >= 100) progressColor = 'bg-error';

                  return (
                    <tr key={item.id} className={`transition-colors ${selectedItems.has(item.id) ? 'bg-primary/5' : 'hover:bg-surface-container-low/30'}`}>
                      <td className="p-4 text-center border-r border-outline-variant/30" data-html2canvas-ignore="true">
                        <input type="checkbox" checked={selectedItems.has(item.id)} onChange={() => toggleSelection(item.id)} className="rounded cursor-pointer" />
                      </td>
                      <td className="p-4">
                        {editingItemId === item.id ? (
                           <div className="flex flex-col gap-2">
                             <input type="text" value={editItemData.name} onChange={e => setEditItemData({...editItemData, name: e.target.value})} className="border border-outline-variant rounded px-2 py-1 text-sm bg-surface-container-lowest outline-none focus:ring-1 focus:ring-primary" />
                             <div className="flex items-center gap-2">
                               <input 
                                 type="text" 
                                 value={formatKM(editItemData.periodicityKM)} 
                                 onChange={e => setEditItemData({...editItemData, periodicityKM: parseKM(e.target.value)})} 
                                 className="border border-outline-variant rounded px-2 py-1 text-sm w-24 bg-surface-container-lowest font-mono outline-none focus:ring-1 focus:ring-primary" 
                               />
                               <span className="text-xs text-on-surface-variant font-mono">km</span>
                             </div>
                             <div className="flex items-center gap-2 mt-1">
                                <button onClick={() => saveEdit(item.id)} className="text-success hover:bg-success/10 p-1 rounded" title="Salvar"><span className="material-symbols-outlined text-[18px]">check</span></button>
                                <button onClick={() => setEditingItemId(null)} className="text-error hover:bg-error/10 p-1 rounded" title="Cancelar"><span className="material-symbols-outlined text-[18px]">close</span></button>
                             </div>
                           </div>
                        ) : (
                           <div>
                             <div className="font-semibold text-on-surface text-sm">{item.name}</div>
                             <div className="text-xs text-on-surface-variant mt-0.5 font-mono">Periodicidade: {formatKM(item.periodicityKM)} km</div>
                           </div>
                        )}
                      </td>
                      <td className="p-4">
                        <select 
                          value={record.conformity}
                          onChange={(e) => updateRecord(item.id, { conformity: e.target.value as any })}
                          className={`text-sm px-2 py-1 rounded border outline-none cursor-pointer ${
                            record.conformity === 'SIM' ? 'bg-success-container/30 border-success/30 text-success font-semibold' :
                            record.conformity === 'NÃO' ? 'bg-error-container/30 border-error/30 text-error font-semibold' :
                            'bg-surface-container border-outline-variant text-on-surface-variant'
                          }`}
                        >
                          <option value="SIM">SIM</option>
                          <option value="NÃO">NÃO</option>
                          <option value="NA">NA</option>
                        </select>
                      </td>
                      <td className="p-4">
                        <select 
                          value={record.serviceExecuted}
                          onChange={(e) => updateRecord(item.id, { serviceExecuted: e.target.value as any })}
                          className={`text-sm px-2 py-1 rounded border outline-none cursor-pointer ${
                            record.serviceExecuted === 'SIM' ? 'bg-primary-container text-on-primary-container border-primary-container font-semibold' :
                            record.serviceExecuted === 'NaKM' ? 'bg-warning-container/50 text-warning-dark border-warning/50 font-semibold' :
                            'bg-surface-container border-outline-variant text-on-surface-variant'
                          }`}
                        >
                          <option value="SIM">SIM</option>
                          <option value="NÃO">NÃO</option>
                          <option value="NaKM">NaKM</option>
                        </select>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter opacity-70 mb-0.5">KM Informado</div>
                          <input 
                            type="text"
                            value={formatKM(record.lastMaintenanceKM)}
                            onChange={(e) => updateRecord(item.id, { lastMaintenanceKM: parseKM(e.target.value) })}
                            className="w-24 bg-surface-container-low border border-outline-variant rounded px-2 py-1 text-sm font-mono focus:ring-1 focus:ring-primary outline-none"
                            placeholder="KM"
                          />
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col mb-1.5 justify-between gap-1 items-start">
                          <div className="flex justify-between w-full text-xs font-bold font-mono">
                            <span className={progressPercent >= 100 ? 'text-error' : 'text-on-surface-variant'}>
                              Próx: {formatKM(record.nextMaintenanceKM)}
                            </span>
                            <span className={progressPercent >= 100 ? 'text-error' : 'text-primary'}>
                              {Math.round(progressPercent)}%
                            </span>
                          </div>
                          <div className="w-full bg-surface-container-high rounded-full h-2.5 overflow-hidden">
                            <div 
                              className={`h-full ${progressColor} transition-all duration-500`} 
                              style={{ width: `${progressPercent}%` }}
                            ></div>
                          </div>
                          
                          <div className="flex justify-between w-full mt-1 items-center">
                            {remainingKM > 0 ? (
                              <span className={`text-[10px] font-bold uppercase tracking-tight ${remainingKM <= 1000 ? 'text-warning' : 'text-on-surface-variant/60'}`}>
                                Restam {formatKM(remainingKM)} km
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase text-error tracking-tight">
                                Vencido há {formatKM(Math.abs(remainingKM))} km
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 border-l border-outline-variant/30" data-html2canvas-ignore="true">
                         <div className="flex items-center gap-2 justify-center">
                           <button onClick={() => startEditing(item)} className="p-1 text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container rounded-lg flex items-center" title="Editar"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                           <button onClick={() => handleDeleteItem(item.id)} className="p-1 text-on-surface-variant hover:text-error transition-colors hover:bg-surface-container rounded-lg flex items-center" title="Excluir"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                         </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Inspections() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // We fetch the vehicles list to show cards or if an ID is present, we just pass to the Form
    const unsubscribe = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setVehicles(data.sort((a: any, b: any) => 
        (a.plate || "").localeCompare((b.plate || ""), undefined, { numeric: true, sensitivity: 'base' })
      ));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'vehicles'));

    return () => unsubscribe();
  }, []);

  const filteredVehicles = vehicles.filter(v => 
    (v.plate || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.model || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.brand || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (id) {
    return <InspectionForm vehicleId={id} onBack={() => navigate('/inspections')} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[32px] font-bold text-on-surface tracking-tight mb-2">Inspeções da Frota</h2>
          <p className="text-on-surface-variant font-medium">Controle e manutenção preventiva dos veículos.</p>
        </div>
        <div className="relative w-full md:w-72">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            type="text"
            placeholder="Pesquisar placa ou modelo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-10 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full transition-colors"
              title="Limpar pesquisa"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-on-surface-variant">Carregando veículos...</div>
      ) : (
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {filteredVehicles.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="col-span-full p-12 text-center bg-surface-container-low text-on-surface-variant border border-outline-variant rounded-2xl border-dashed"
              >
                Nenhum veículo encontrado para os filtros atuais.
              </motion.div>
            ) : (
              filteredVehicles.map(vehicle => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  key={vehicle.id} 
                  onClick={() => navigate(`/inspections/${vehicle.id}`)}
                  className="bg-surface-container-lowest border border-outline-variant rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:bg-surface-container-low hover:-translate-y-1 transition-all duration-300 cursor-pointer group flex flex-col"
                >
                  <div className="relative h-44 overflow-hidden bg-white border-b border-outline-variant/30 flex items-center justify-center p-4">
                    <img 
                      className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110 drop-shadow-sm" 
                      src={vehicle.imageUrl || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800"} 
                      alt={vehicle.model} 
                    />
                    <div className="absolute top-3 right-3 z-10">
                      <span className={`bg-white/90 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm ${
                        vehicle.status === 'Ativo' ? 'text-success' : 
                        vehicle.status === 'Em Manutenção' ? 'text-warning' : 
                        'text-error'
                      }`}>
                        {vehicle.status || 'Ativo'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-center gap-3 mb-2 flex-1">
                      <div className="bg-primary/10 text-primary p-2.5 rounded-xl">
                        <span className="material-symbols-outlined text-[20px]">fact_check</span>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-on-surface leading-none mb-1">{vehicle.plate}</h3>
                        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">{vehicle.brand} {vehicle.model}</p>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-outline-variant/50 flex justify-between items-center text-sm">
                      <span className="text-on-surface-variant text-[11px] uppercase tracking-wider font-bold">KM Atual</span>
                      <span className="font-mono font-bold text-primary text-base">{(vehicle.currentKM || vehicle.odometer || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
