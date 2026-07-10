import { useState, useEffect, ReactNode } from 'react';
import { collection, getDocs, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { createSignature, getQRCodeDataUrl, generateVerificationUrl } from '../utils/pdfSignature';
import { PrivateValue, usePrivacy } from '../contexts/PrivacyContext';
import { useDraggableScroll } from '../hooks/useDraggableScroll';

type ModuleData = {
  id: string;
  name: string;
  collectionId: string;
  columns: { key: string; label: string; renderer?: (val: any, item: any) => ReactNode; align?: 'left' | 'center' | 'right' }[];
  icon: string;
};

const formatDate = (timestamp: any) => {
  if (!timestamp) return '-';
  if (timestamp instanceof Date) return timestamp.toLocaleDateString('pt-BR');
  if (timestamp.toDate) return timestamp.toDate().toLocaleDateString('pt-BR');
  if (typeof timestamp === 'number') return new Date(timestamp).toLocaleDateString('pt-BR');
  return String(timestamp);
};

const DriverPhotoReport = ({ url }: { url: string }) => {
  const { isPrivacyMode } = usePrivacy();
  
  if (!url) {
    return (
      <div className="w-12 h-12 rounded-full bg-surface-container-low dark:bg-surface border border-outline-variant/30 dark:border-blue-500/20 flex items-center justify-center text-on-surface-variant/30 mx-auto">
        <span className="material-symbols-outlined text-[16px]">person</span>
      </div>
    );
  }

  return (
    <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-container-low dark:bg-surface border border-outline-variant/30 dark:border-blue-500/20 shrink-0 mx-auto flex items-center justify-center">
      <img 
        src={url} 
        alt="Motorista" 
        className={`w-full h-full object-cover transition-all duration-300 ${isPrivacyMode ? 'blur-[8px]' : ''}`} 
      />
    </div>
  );
};

const MODULES: ModuleData[] = [
  {
    id: 'vehicles',
    name: 'Frota de Veículos',
    collectionId: 'vehicles',
    icon: 'local_shipping',
    columns: [
      { 
        key: 'imageUrl', 
        label: 'Foto', 
        align: 'center',
        renderer: (val: any) => val ? (
          <div className="w-16 h-12 rounded-lg overflow-hidden bg-white shrink-0 flex items-center justify-center border border-outline-variant/30 shadow-sm">
            <img src={val} alt="Veículo" className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-16 h-12 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-center justify-center text-on-surface-variant/30">
            <span className="material-symbols-outlined text-[20px]">image_not_supported</span>
          </div>
        )
      },
      { key: 'plate', label: 'Placa', renderer: (val) => <PrivateValue value={val} /> },
      { key: 'brand', label: 'Marca' },
      { key: 'model', label: 'Modelo' },
      { key: 'year', label: 'Ano', align: 'center', renderer: (val: any, item: any) => item?.modelYear || val || '-' },
      { key: 'bodywork', label: 'Carroceria' },
      { key: 'fuelType', label: 'Combustível' },
      { 
        key: 'currentKM', 
        label: 'KM Atual', 
        align: 'center',
        renderer: (val: any, item: any) => (item?.currentKM || item?.odometer || 0).toLocaleString() 
      },
      { 
        key: 'costCenter', 
        label: 'Centro de Custo',
        renderer: (val: any) => {
          const clean = (v: any) => String(v || '').replace(/logística - região sul/gi, '').replace(/logístic a - região sul/gi, '').replace(/,? ?$/, '').trim();
          if (Array.isArray(val)) {
            return val.map(clean).filter(Boolean).join(', ') || '-';
          }
          return clean(val) || '-';
        }
      },
      { key: 'assignedDriver', label: 'Motorista Atribuído', renderer: (val) => <PrivateValue value={val} /> },
      { key: 'status', label: 'Status' },
      { key: 'observation', label: 'Observações', renderer: (val: any, item: any) => item?.observation || item?.observations || val || '-' },
    ]
  },
  {
    id: 'telemetry',
    name: 'Veículos por Telemetria',
    collectionId: 'vehicles',
    icon: 'satellite_alt',
    columns: [
      { key: 'telemetryProvider', label: 'Provedor de Telemetria', renderer: (val) => val || 'Sem Telemetria' },
      { key: 'plate', label: 'Placa', renderer: (val) => <PrivateValue value={val} /> },
      { key: 'brand', label: 'Marca' },
      { key: 'model', label: 'Modelo' },
      { 
        key: 'costCenter', 
        label: 'Obra',
        renderer: (val: any) => {
          const clean = (v: any) => String(v || '').replace(/logística - região sul/gi, '').replace(/logístic a - região sul/gi, '').replace(/,? ?$/, '').trim();
          if (Array.isArray(val)) {
            return val.map(clean).filter(Boolean).join(', ') || '-';
          }
          return clean(val) || '-';
        }
      },
      { key: 'currentKM', label: 'KM Atual', align: 'center', renderer: (val: any, item: any) => (item?.currentKM || item?.odometer || 0).toLocaleString() },
      { key: 'lastSyncCheck', label: 'Última Atualização', align: 'center', renderer: (val: any) => val ? new Date(val).toLocaleString('pt-BR') : '-' },
      { key: 'status', label: 'Status' }
    ]
  },
  {
    id: 'drivers',
    name: 'Motoristas',
    collectionId: 'drivers',
    icon: 'group',
    columns: [
      { 
        key: 'imageUrl', 
        label: 'Foto', 
        align: 'center',
        renderer: (val: any) => <DriverPhotoReport url={val} />
      },
      { key: 'name', label: 'Nome', renderer: (val) => <PrivateValue value={val} /> },
      { key: 'cnh', label: 'CNH', renderer: (val) => <PrivateValue value={val} /> },
      { key: 'cnhCategory', label: 'Categoria CNH', align: 'center' },
      { key: 'validUntil', label: 'Validade CNH', renderer: (val: any) => {
        if (!val) return '-';
        let d;
        if (val instanceof Date) d = val;
        else if (val.toDate) d = val.toDate();
        else if (typeof val === 'number') d = new Date(val);
        else d = new Date(val);
        const day = String(d.getDate() + 1).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}-${month}-${d.getFullYear()}`;
      } },
      { key: 'cnhStatus', label: 'Status CNH', renderer: (val: any, item: any) => item.validUntil ? (new Date(item.validUntil) < new Date() ? 'Vencida' : 'Válida') : 'N/A' },
      { key: 'phone', label: 'Telefone', renderer: (val) => <PrivateValue value={val} /> },
      { key: 'vehicleAssigned', label: 'Veículo Atribuído' },
      { 
        key: 'costCenter', 
        label: 'Obra (Centro de Custo)',
        renderer: (val: any) => {
          const clean = (v: any) => String(v || '').replace(/logística - região sul/gi, '').replace(/logístic a - região sul/gi, '').replace(/,? ?$/, '').trim();
          if (Array.isArray(val)) {
            return val.map(clean).filter(Boolean).join(', ') || '-';
          }
          return clean(val) || '-';
        }
      },
    ]
  }
];

const MultiSelect = ({ label, options, selected, onChange, placeholder }: { label: string, options: any[], selected: string[], onChange: (val: string[]) => void, placeholder: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative flex-1 min-w-[180px]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white border border-outline-variant rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary shadow-sm h-[40px] flex items-center justify-between gap-2"
      >
        <span className="truncate max-w-[140px]">
          {selected.length === 0 ? placeholder : `${selected.length} selecionado(s)`}
        </span>
        <span className="material-symbols-outlined text-[20px] transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          expand_more
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute left-0 right-0 top-[44px] bg-white border border-outline-variant rounded-xl shadow-xl z-20 max-h-[250px] overflow-y-auto py-2"
            >
              <div 
                className="px-3 py-2 hover:bg-surface-container-low cursor-pointer flex items-center gap-2"
                onClick={() => {
                  onChange([]);
                  setIsOpen(false);
                }}
              >
                <div className={`w-4 h-4 border border-outline-variant rounded flex items-center justify-center ${selected.length === 0 ? 'bg-primary border-primary' : ''}`}>
                  {selected.length === 0 && <span className="material-symbols-outlined text-white text-[12px]">check</span>}
                </div>
                <span className="text-xs font-bold uppercase text-on-surface-variant">Limpar Filtros</span>
              </div>
              <div 
                className="px-3 py-2 hover:bg-surface-container-low cursor-pointer flex items-center gap-2"
                onClick={() => {
                  const allNames = options.map(o => o.name);
                  onChange(allNames);
                }}
              >
                <div className={`w-4 h-4 border border-outline-variant rounded flex items-center justify-center ${selected.length === options.length ? 'bg-primary border-primary' : ''}`}>
                  {selected.length === options.length && <span className="material-symbols-outlined text-white text-[12px]">check</span>}
                </div>
                <span className="text-xs font-bold uppercase text-on-surface-variant">Selecionar Todos</span>
              </div>
              <div className="h-px bg-outline-variant/30 my-1" />
              {(() => {
                const allOptions = [...options];
                selected.forEach(s => {
                  if (!allOptions.find(o => o.name === s)) {
                    allOptions.push({ id: s, name: s });
                  }
                });
                return allOptions.map(opt => (
                  <div 
                    key={opt.id || opt.name} 
                    className="px-3 py-2 hover:bg-surface-container-low cursor-pointer flex items-center gap-2"
                    onClick={() => {
                      const next = selected.includes(opt.name) 
                        ? selected.filter(s => s !== opt.name) 
                        : [...selected, opt.name];
                      onChange(next);
                    }}
                  >
                    <div className={`w-4 h-4 border border-outline-variant rounded flex items-center justify-center ${selected.includes(opt.name) ? 'bg-primary border-primary' : ''}`}>
                      {selected.includes(opt.name) && <span className="material-symbols-outlined text-white text-[12px]">check</span>}
                    </div>
                    <span className="text-sm truncate">{opt.name}</span>
                  </div>
                ));
              })()}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export function Reports() {
  const { userData } = useAuth();
  const [selectedModuleId, setSelectedModuleId] = useLocalStorageState<string | null>('reports_selectedModuleId', null);
  const selectedModule = MODULES.find(m => m.id === selectedModuleId) || null;
  
  const [selectedColumns, setSelectedColumns] = useLocalStorageState<string[]>('reports_selectedColumns', []);
  const [data, setData] = useState<any[]>([]);
  const [reportSearchTerm, setReportSearchTerm] = useLocalStorageState('reports_searchTerm', '');
  const [filterWork, setFilterWork] = useLocalStorageState<string[]>('reports_filterWork', []);
  const [filterStatus, setFilterStatus] = useLocalStorageState<string[]>('reports_filterStatus', []);
  const [filterProvider, setFilterProvider] = useLocalStorageState<string[]>('reports_filterProvider', []);
  const [works, setWorks] = useState<any[]>([]);
  const [worksLoaded, setWorksLoaded] = useState(false);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [headerLogo, setHeaderLogo] = useState<{src: string, ratio: number} | null>(null);
  const [footerLogo, setFooterLogo] = useState<{src: string, ratio: number} | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  type ReportProfile = {
    id: string;
    name: string;
    moduleId: string | null;
    columns: string[];
    filters: {
      searchTerm: string;
      work: string[];
      status: string[];
    };
  };
  const [reportProfiles, setReportProfiles] = useLocalStorageState<ReportProfile[]>('reports_savedProfiles', []);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState('');

  const { scrollRef, isDragging, events } = useDraggableScroll<HTMLDivElement>();

  const handleSaveProfile = () => {
    if (!editingProfileName.trim()) return;
    
    if (editingProfileId) {
      setReportProfiles(prev => prev.map(p => 
        p.id === editingProfileId 
          ? { ...p, name: editingProfileName, moduleId: selectedModuleId, columns: selectedColumns, filters: { searchTerm: reportSearchTerm, work: filterWork, status: filterStatus } }
          : p
      ));
    } else {
      const newProfile: ReportProfile = {
        id: Date.now().toString(),
        name: editingProfileName,
        moduleId: selectedModuleId,
        columns: selectedColumns,
        filters: { searchTerm: reportSearchTerm, work: filterWork, status: filterStatus }
      };
      setReportProfiles(prev => [...prev, newProfile]);
    }
    setEditingProfileId(null);
    setEditingProfileName('');
  };

  const handleApplyProfile = (profile: ReportProfile) => {
    if (profile.moduleId && profile.moduleId !== selectedModuleId) {
       const mod = MODULES.find(m => m.id === profile.moduleId);
       if (mod) {
         setSelectedModuleId(mod.id);
         fetchModuleData(mod);
       }
    }
    setSelectedColumns(profile.columns);
    setReportSearchTerm(profile.filters.searchTerm);
    setFilterWork(profile.filters.work);
    setFilterStatus(profile.filters.status);
  };

  useEffect(() => {
    const qWorks = query(collection(db, 'works'), orderBy('name', 'asc'));
    const unsubWorks = onSnapshot(qWorks, (snapshot) => {
      setWorks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setWorksLoaded(true);
    }, (err) => {
      console.error("Error listening to works in Reports", err);
      setWorksLoaded(true);
    });

    const qStatuses = query(collection(db, 'statuses'), orderBy('name', 'asc'));
    const unsubStatuses = onSnapshot(qStatuses, (snapshot) => {
      setStatuses(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("Error listening to statuses in Reports", err);
    });

    const loadImg = async (url: string, setter: (val: {src: string, ratio: number}) => void) => {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const img = new Image();
          img.onload = () => {
            setter({ src: dataUrl, ratio: img.naturalWidth / img.naturalHeight });
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.error("Failed to load image", url, err);
      }
    };
    const unsubImageHeader = loadImg('https://i.imgur.com/f2EH8ls.png', setHeaderLogo);
    const unsubImageFooter = loadImg('https://i.imgur.com/1DaE4Bm.png', setFooterLogo);

    return () => {
      unsubWorks();
      unsubStatuses();
    };
  }, []);

  const handleModuleSelect = async (mod: ModuleData) => {
    setSelectedModuleId(mod.id);
    setSelectedColumns(mod.columns.map(c => c.key));
    setSortConfig(null);
    fetchModuleData(mod);
  };

  const fetchModuleData = async (mod: ModuleData) => {
    setLoadingData(true);
    setData([]);
    
    if (mod.id === 'inspections') {
      setLoadingData(false);
      return; 
    }

    // We use onSnapshot but handle it carefully for reports
    const q = query(collection(db, mod.collectionId));
    let unsubscribeDrivers: (() => void) | null = null;
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      let docs = snapshot.docs.map(d => ({id: d.id, ...d.data() as any}));

      if (mod.id === 'vehicles' || mod.id === 'telemetry') {
        const driversSnap = await getDocs(query(collection(db, 'drivers')));
        const driversData = driversSnap.docs.map(d => d.data());
        docs = docs.map((v: any) => {
          const assignedDs = driversData.filter(d => Array.isArray(d.vehicleAssigned) ? d.vehicleAssigned.includes(v.plate) : d.vehicleAssigned === v.plate);
          return { 
            ...v, 
            assignedDriver: assignedDs.length > 0 ? assignedDs.map((d: any) => d.name).join(', ') : 'Não Atribuída',
            imageUrl: v.imageUrl || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800"
          };
        });
      }

      if (mod.id === 'telemetry') {
        try {
          // Fetch settings to get telemetry providers
          const docRef = doc(db, 'settings', 'integrations');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            let providers: any[] = [];
            if (data.providers) {
              providers = data.providers;
            } else if (data.telemetryUrl || data.telemetryToken) {
              providers = [{ id: '1', name: 'Provedor Padrão', url: data.telemetryUrl || '', token: data.telemetryToken || '' }];
            }

            const plateToProvider: Record<string, string> = {};

            // Fetch from each provider
            for (const provider of providers) {
              const url = provider.url || '';
              const token = provider.token || '';
              
              if (url.includes('solusat')) {
                const [apiKey, apiToken] = token.split(',');
                if (apiKey && apiToken) {
                  try {
                    const res = await fetch(`/api/proxy/solusat/vehicles?t=${Date.now()}`, {
                      headers: { 'apiKey': apiKey, 'apiToken': apiToken }
                    });
                    if (res.ok) {
                      const json = await res.json();
                      if (json.status && json.data) {
                        Object.keys(json.data).forEach(groupKey => {
                           const apiVehicles = Array.isArray(json.data[groupKey]) ? json.data[groupKey] : Object.values(json.data[groupKey] || {});
                           apiVehicles.forEach((av: any) => {
                              const plate = (av.ras_vei_placa || av.ras_vei_veiculo || av.veiculo_placa || av.vei_placa || "").toString();
                              const cleanPlate = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                              if (cleanPlate) plateToProvider[cleanPlate] = provider.name || 'Solusat';
                           });
                        });
                      }
                    }
                  } catch (e) { console.error('Error fetching Solusat for report:', e); }
                }
              } else if (url.includes('gaussfleet')) {
                try {
                  const now = new Date();
                  const dateParam = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                  const res = await fetch(`/api/proxy/gaussfleet/hourmeter`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-AUTH-TOKEN': token },
                    body: JSON.stringify({ date_time: dateParam })
                  });
                  if (res.ok) {
                    const json = await res.json();
                    if (json && json.msg && Array.isArray(json.msg)) {
                      json.msg.forEach((av: any) => {
                         const plate = (av.vehicle_name || "").toString();
                         const cleanPlate = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                         if (cleanPlate) plateToProvider[cleanPlate] = provider.name || 'GaussFleet';
                      });
                    }
                  }
                } catch (e) { console.error('Error fetching GaussFleet for report:', e); }
              }
            }

            // Map the providers to the documents
            docs = docs.map((v: any) => {
               const cleanVPlate = (v.plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
               const prov = plateToProvider[cleanVPlate] || v.telemetryProvider || '';
               return {
                 ...v,
                 telemetryProvider: prov
               };
            });
          }
        } catch (e) {
          console.error("Error setting up telemetry mapping for report", e);
        }
      }

      const preparedData = docs.map((item: any) => {
        if (mod.id === 'drivers' && item.vehicleAssigned) {
           return {
             ...item,
             vehicleAssigned: Array.isArray(item.vehicleAssigned) ? item.vehicleAssigned.join(', ') : item.vehicleAssigned
           };
        }
        return item;
      });

      setData(preparedData);
      setLoadingData(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, mod.collectionId);
      setLoadingData(false);
    });

    return () => {
      unsubscribe();
      if (unsubscribeDrivers) unsubscribeDrivers();
    };
  };

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    if (selectedModule) {
      fetchModuleData(selectedModule).then(unsub => {
        cleanup = unsub;
      });
    }
    return () => {
      if (cleanup) cleanup();
    };
  }, [selectedModuleId]);

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortData = (list: any[]) => {
    if (!sortConfig) return list;

    const sorted = [...list].sort((a, b) => {
      const col = selectedModule?.columns?.find(c => c.key === sortConfig.key);
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      // Use renderer if available for sorting display values
      if (col?.renderer) {
        const rendered = col.renderer(valA, a);
        valA = typeof rendered === 'string' ? rendered : valA;
        const renderedB = col.renderer(valB, b);
        valB = typeof renderedB === 'string' ? renderedB : valB;
      }

      const aStr = String(valA || '').toLowerCase();
      const bStr = String(valB || '').toLowerCase();

      // Check if it's numeric
      const aNum = parseFloat(aStr.replace(/[^\d.,-]/g, '').replace(',', '.'));
      const bNum = parseFloat(bStr.replace(/[^\d.,-]/g, '').replace(',', '.'));

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  };

  const activeColumns = selectedModule?.columns.filter(c => selectedColumns.includes(c.key)) || [];

  const validWorksList = works.map(w => w.name);
  const displayData = worksLoaded ? data.reduce((acc: any[], item: any) => {
    if (selectedModule?.id === 'vehicles' || selectedModule?.id === 'drivers' || selectedModule?.id === 'telemetry') {
      if (selectedModule?.id === 'vehicles' || selectedModule?.id === 'telemetry') {
        // Deduplicate by plate
        const existingIdx = acc.findIndex(v => v.plate && item.plate && v.plate.replace(/[^A-Z0-9]/g, '') === item.plate.replace(/[^A-Z0-9]/g, ''));
        if (existingIdx !== -1) {
          // Keep the one that was updated more recently, or has more data
          const existing = acc[existingIdx];
          const existingTime = existing.updatedAt || 0;
          const itemTime = item.updatedAt || 0;
          if (itemTime <= existingTime) return acc; // Skip older duplicate
          acc.splice(existingIdx, 1); // Remove older duplicate
        }
      }
      
      let itemWorks: string[] = [];
      if (Array.isArray(item.costCenter)) {
        itemWorks = item.costCenter;
      } else if (typeof item.costCenter === 'string' && item.costCenter) {
        itemWorks = item.costCenter.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      const validItemWorks = itemWorks.filter((c: string) => validWorksList.includes(c));
      acc.push({ ...item, costCenter: validItemWorks });
    } else {
      acc.push(item);
    }
    return acc;
  }, []) : data;

  const filteredData = displayData.filter(item => {
    const matchesSearch = !reportSearchTerm || activeColumns.some(c => {
      const val = item[c.key];
      const rendered = c.renderer ? c.renderer(val, item) : (val != null ? String(val) : '');
      const displayVal = typeof rendered === 'string' ? rendered : (val != null ? String(val) : '');
      return displayVal.toLowerCase().includes(reportSearchTerm.toLowerCase());
    });

    let matchesWork = true;
    let matchesStatus = true;
    let matchesProvider = true;

    if (selectedModule?.id === 'vehicles' || selectedModule?.id === 'drivers' || selectedModule?.id === 'telemetry') {
      matchesWork = filterWork.length === 0 || filterWork.includes('Todas as Obras') || 
        (Array.isArray(item.costCenter) 
          ? item.costCenter.some((c: string) => filterWork.includes(c)) 
          : filterWork.includes(item.costCenter));
      
      matchesStatus = filterStatus.length === 0 || filterStatus.includes('Todos os Status') || 
        filterStatus.includes(item.status);
    }

    return matchesSearch && matchesWork && matchesStatus && matchesProvider;
  });

  const sortedData = sortData(filteredData);

  const handleExportPDF = async () => {
    if (!selectedModule) return;

    setLoadingData(true);
    setExportProgress(0);
    const isLandscape = activeColumns.length > 5;
    const doc = new jsPDF(isLandscape ? 'landscape' : 'portrait');

    const title = `Relatório de ${selectedModule.name}`;
    
    // Header and footer setup
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const imageColIdx = activeColumns.findIndex(c => c.key === 'imageUrl');
    const imageCache: { [url: string]: { src: string; ratio: number } } = {};

    let loadedCount = 0;
    if (imageColIdx !== -1) {
      const urls = Array.from(new Set(sortedData.map(item => item.imageUrl).filter(Boolean)));
      await Promise.all(urls.map(async (url) => {
        try {
          const fetchUrl = typeof url === 'string' ? url : '';
          if (!fetchUrl) throw new Error("Empty URL");

          let response: Response;
          console.log(`[PDF EXPORT] Tentando carregar imagem: ${fetchUrl}`);
          
          // Tentativa 1: Direto
          try {
            response = await fetch(fetchUrl);
            if (!response.ok) throw new Error("Fetch failed");
          } catch (e) {
            // Tentativa 2: Proxy WSRV com compressão
            try {
              const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(fetchUrl)}&w=300&output=jpeg&q=80`;
              response = await fetch(proxyUrl);
              if (!response.ok) throw new Error("WSRV proxy failed");
            } catch (e2) {
              // Tentativa 3: Proxy All Origins
              const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(fetchUrl)}`;
              response = await fetch(proxyUrl);
            }
          }
          
          if (!response.ok) throw new Error("All image proxies failed");

          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          
          const imgData = await new Promise<{src: string, ratio: number}>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.fillStyle = '#FFFFFF';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0);
                  resolve({ 
                    src: canvas.toDataURL('image/jpeg', 0.8), 
                    ratio: img.naturalWidth / img.naturalHeight 
                  });
                } else {
                  resolve({ src: dataUrl, ratio: img.naturalWidth / img.naturalHeight });
                }
              } catch (e) {
                // In case of taint error or other canvas errors, fallback to original dataUrl
                resolve({ src: dataUrl, ratio: img.naturalWidth / img.naturalHeight });
              }
            };
            img.onerror = reject;
            img.src = dataUrl;
          });
          imageCache[fetchUrl] = imgData;
          console.log(`[PDF EXPORT] Imagem carregada com sucesso: ${fetchUrl}`);
        } catch (err) {
          console.error(`[PDF EXPORT] Erro ao carregar imagem: ${url}`, err);
        }
        loadedCount++;
        setExportProgress(Math.floor((loadedCount / urls.length) * 100));
      }));
    }

    const tableCols = activeColumns.map(c => c.label);
    const tableData = sortedData.map(item => 
      activeColumns.map(c => {
        const val = item[c.key];
        if (c.key === 'imageUrl') return ''; // Empty so we can draw the image
        const rendered = c.renderer ? c.renderer(val, item) : (val != null ? String(val) : '-');
        return typeof rendered === 'string' ? rendered : (val != null ? String(val) : '-');
      })
    );

    const isFleetReport = selectedModule.id === 'vehicles' || selectedModule.id === 'telemetry';

    autoTable(doc, {
      head: [tableCols],
      body: tableData,
      startY: isFleetReport ? 45 : 40,
      margin: { top: 45, bottom: 30, left: 8, right: 8 },
      rowPageBreak: 'avoid',
      styles: {
        fontSize: isFleetReport ? 7.5 : 9,
        cellPadding: 3,
        valign: 'middle'
      },
      bodyStyles: {
        minCellHeight: imageColIdx !== -1 ? 20 : undefined
      },
      headStyles: {
        fillColor: [20, 24, 27],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      columnStyles: {
        ...(imageColIdx !== -1 ? { [imageColIdx]: { cellWidth: 20 } } : {})
      },
      didParseCell: function(data) {
        if (isFleetReport && data.section === 'body') {
          const colKey = activeColumns[data.column.index].key;
          if (colKey === 'status') {
            const status = String(data.cell.raw).toUpperCase();
            if (status.includes('MANUTENÇÃO')) {
              data.cell.styles.textColor = [0, 102, 204]; // Blue
              data.cell.styles.fontStyle = 'bold';
            } else if (status.includes('INATIVO')) {
              data.cell.styles.textColor = [220, 38, 38]; // Red
              data.cell.styles.fontStyle = 'bold';
            } else if (status.includes('ATIVO')) {
              data.cell.styles.textColor = [22, 163, 74]; // Green
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      },
      didDrawCell: function(hookData) {
        if (imageColIdx !== -1 && hookData.column.index === imageColIdx && hookData.cell.section === 'body') {
          const item = sortedData[hookData.row.index];
          const imgUrl = item?.imageUrl;
          const cached = imgUrl ? imageCache[imgUrl] : null;

          if (cached) {
            const padding = 1.5;
            const cellW = hookData.cell.width - (padding * 2);
            const cellH = hookData.cell.height - (padding * 2);

            const imgW = cached.ratio * 100;
            const imgH = 100;

            const scale = Math.min(cellW / imgW, cellH / imgH);
            const drawW = imgW * scale;
            const drawH = imgH * scale;
            
            const x = hookData.cell.x + padding + (cellW - drawW) / 2;
            const y = hookData.cell.y + padding + (cellH - drawH) / 2;
            
            doc.addImage(cached.src, 'JPEG', x, y, drawW, drawH, '', 'FAST');
          }
        }
      },
      didDrawPage: function (hookData) {
        // Headers
        const marginX = hookData.settings.margin.left;
        if (headerLogo) {
          const h = 12;
          const w = h * headerLogo.ratio;
          doc.addImage(headerLogo.src, 'PNG', marginX, 10, w, h, '', 'FAST');
        }
        
        if (hookData.pageNumber === 1) {
          doc.setFontSize(16);
          doc.setTextColor(40);
          doc.text(title, marginX, 32);
          
          if (isFleetReport) {
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.setFont('helvetica', 'normal');
            doc.text(`Total de Veículos na Frota: ${sortedData.length}`, marginX, 39);
          }
        }

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(100);
        
        const pageNumber = (doc.internal as any).getNumberOfPages();
        const totalPagesExp = "{total_pages_count_string}";
        doc.text(`Pág. ${pageNumber} de ${totalPagesExp}`, marginX, pageHeight - 10);
        
        if (footerLogo) {
          const h = 8;
          const w = h * footerLogo.ratio;
          doc.addImage(footerLogo.src, 'PNG', (pageWidth - w) / 2, pageHeight - 15, w, h, '', 'FAST');
        }
        
        const byText = "ROTA 360 - Gestão de Frota";
        const byWidth = doc.getTextWidth(byText);
        doc.text(byText, pageWidth - marginX - byWidth, pageHeight - 10);
      }
    });

    // @ts-ignore
    if (typeof doc.putTotalPages === 'function') {
      doc.putTotalPages('{total_pages_count_string}');
    }

    const totalPages = (doc as any).internal.getNumberOfPages();
    doc.setPage(totalPages);
    const finalY = (doc as any).lastAutoTable?.finalY || 40;
    
    let signatureY = finalY + 20;
    let signatureHeight = 40;

    if (signatureY + signatureHeight > pageHeight - 20) {
      doc.addPage();
      signatureY = 30;
    }

    // Generate digital signature
    const signatureId = await createSignature({
       documentType: `Relatório de ${title}`,
       documentTitle: title
    });

    if (signatureId) {
      const verifyUrl = generateVerificationUrl(signatureId);
      const qrCodeDataUrl = await getQRCodeDataUrl(verifyUrl);
      
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, signatureY, pageWidth - 28, signatureHeight, 3, 3, "F");
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.1);
      doc.roundedRect(14, signatureY, pageWidth - 28, signatureHeight, 3, 3, "S");
      
      if (qrCodeDataUrl) {
         doc.addImage(qrCodeDataUrl, "JPEG", 20, signatureY + 5, 30, 30);
      }
      
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "bold");
      doc.text("DOCUMENTO ASSINADO DIGITALMENTE", 56, signatureY + 8);
      
      const userName = userData?.signatureInfo?.fullName || userData?.name || 'USUÁRIO DO SISTEMA';
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(`por ${userName.toUpperCase()}`, 56, signatureY + 14);
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`Para verificar a autenticidade deste documento, aponte a câmera para o QR Code\nou acesse a URL abaixo:`, 56, signatureY + 20);
      
      doc.setTextColor(37, 99, 235);
      doc.text(verifyUrl, 56, signatureY + 28);
      
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.text(`Código de Validação: ${signatureId}`, 56, signatureY + 36);

      // Add Seal Logo on the right
      if (footerLogo) {
        const h = 14;
        const w = h * footerLogo.ratio;
        // Position it at the top right of the signature box area
        doc.addImage(footerLogo.src, 'PNG', pageWidth - 14 - w - 10, signatureY + 6, w, h, '', 'FAST');
      }
    } else {
      doc.setLineWidth(0.5);
      doc.setDrawColor(200);
      doc.line(pageWidth / 2 - 45, signatureY + 20, pageWidth / 2 + 45, signatureY + 20);
      doc.setFontSize(10);
      doc.setTextColor(50);
      doc.setFont("helvetica", "bold");
      doc.text("Assinatura do Responsável", pageWidth / 2, signatureY + 26, {
        align: "center",
      });
    }

    doc.save(`${title.replace(/\s+/g, '_').toLowerCase()}.pdf`);
    setLoadingData(false);
    setExportProgress(0);
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="min-h-screen bg-surface dark:bg-surface-container-lowest pb-24">
      <header className="bg-primary text-on-primary p-6 rounded-b-3xl shadow-md sticky top-0 z-10 transition-all mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.history.back()}
              className="w-10 h-10 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div>
              <h1 className="text-2xl font-bold">Central de Relatórios</h1>
              <p className="text-primary-container text-sm opacity-80">
                Extraia informações e gere arquivos profissionais em PDF
              </p>
            </div>
          </div>
          <button
            onClick={handleExportPDF}
            disabled={!selectedModule || selectedColumns.length === 0 || loadingData}
            className="relative px-6 py-3 bg-white text-primary rounded-xl font-bold shadow-lg shadow-black/10 hover:shadow-xl hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:hover:shadow-lg flex items-center gap-2 justify-center overflow-hidden"
          >
            {loadingData && exportProgress > 0 && (
              <div className="absolute bottom-0 left-0 h-1 bg-primary/20" style={{ width: `${exportProgress}%` }} />
            )}
            <span className="material-symbols-outlined">
              {loadingData ? 'progress_activity' : 'picture_as_pdf'}
            </span>
            {loadingData ? `Exportando (${exportProgress}%)` : 'Exportar PDF'}
          </button>
        </div>
      </header>

      <div className="w-full px-4 lg:px-6">

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-8">
        <div className="space-y-6">
          <div className="bg-surface/70 backdrop-blur-md rounded-2xl p-6 border border-outline-variant/50 shadow-sm animate-in fade-in slide-in-from-left-4 duration-500">
            <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2 uppercase tracking-wide text-sm">
              <span className="material-symbols-outlined text-primary">database</span>
              Base de Dados
            </h3>
            <div className="space-y-3">
              {MODULES.map(mod => (
                <button
                  key={mod.id}
                  onClick={() => handleModuleSelect(mod)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                    selectedModule?.id === mod.id 
                      ? 'bg-primary text-on-primary shadow-md font-bold' 
                      : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low border border-outline-variant/50'
                  }`}
                >
                  <span className="material-symbols-outlined">{mod.icon}</span>
                  {mod.name}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence>
            {selectedModule && (
              <motion.div 
                initial="hidden" animate="visible" exit="hidden" variants={itemVariants}
                className="bg-surface/70 backdrop-blur-md rounded-2xl p-6 border border-outline-variant/50 shadow-sm"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-on-surface flex items-center gap-2 uppercase tracking-wide text-sm">
                    <span className="material-symbols-outlined text-primary">view_column</span>
                    Colunas
                  </h3>
                  <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-1 rounded-full">{activeColumns.length} sel.</span>
                </div>
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {selectedModule.columns.map(c => (
                    <label key={c.key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-container cursor-pointer transition-colors group">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedColumns.includes(c.key)}
                          onChange={() => toggleColumn(c.key)}
                          className="w-5 h-5 appearance-none border-2 border-outline rounded-md checked:bg-primary checked:border-primary transition-colors cursor-pointer"
                        />
                        {selectedColumns.includes(c.key) && (
                          <span className="material-symbols-outlined absolute text-on-primary text-[14px] pointer-events-none">check</span>
                        )}
                      </div>
                      <span className={`text-sm ${selectedColumns.includes(c.key) ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                        {c.label}
                      </span>
                    </label>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-6">
          {!selectedModule ? (
            <div className="bg-surface-container-low border-2 border-dashed border-outline-variant rounded-2xl p-12 text-center h-full flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-300">
              <span className="material-symbols-outlined text-6xl text-on-surface-variant/50 mb-4">document_scanner</span>
              <h3 className="text-xl font-bold text-on-surface mb-2">Nenhuma base selecionada</h3>
              <p className="text-on-surface-variant">Selecione uma base de dados no menu lateral para iniciar a montagem do seu relatório.</p>
            </div>
          ) : (
            <motion.div 
              initial="hidden" animate="visible" variants={itemVariants}
              className="flex border border-outline-variant rounded-2xl shadow-sm overflow-hidden bg-surface-container-lowest flex-col xl:flex-row"
            >
              {/* Profiles Sidebar */}
              <div className="w-full xl:w-[300px] border-b xl:border-b-0 xl:border-r border-outline-variant flex flex-col p-6 overflow-y-auto bg-white dark:bg-surface-container-low custom-scrollbar flex-shrink-0 relative">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-lg font-bold text-on-surface flex items-center gap-2">
                       <span className="material-symbols-outlined text-primary">bookmark</span>
                       Perfis Salvos
                    </h4>
                    <button 
                      onClick={() => { setEditingProfileId(null); setEditingProfileName('Novo Perfil'); }}
                      className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
                    >
                       <span className="material-symbols-outlined text-[20px]">add</span>
                    </button>
                  </div>

                  {editingProfileName !== '' && (
                    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 mb-4">
                       <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-2">Editar Nome do Perfil</label>
                       <input 
                         type="text" 
                         value={editingProfileName}
                         onChange={e => setEditingProfileName(e.target.value)}
                         autoFocus
                         className="w-full h-10 px-3 border border-outline-variant rounded-lg text-sm mb-3 focus:outline-none focus:border-primary"
                       />
                       <div className="flex gap-2">
                          <button onClick={handleSaveProfile} className="flex-1 h-9 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-dark transition-colors">
                              Atualizar
                          </button>
                          <button onClick={() => { setEditingProfileId(null); setEditingProfileName(''); }} className="flex-1 h-9 bg-surface-container-high text-on-surface text-xs font-bold rounded-lg hover:bg-surface-container-highest transition-colors">
                              Cancelar
                          </button>
                       </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {reportProfiles.map(p => {
                      const mod = MODULES.find(m => m.id === p.moduleId);
                      return (
                      <div 
                        key={p.id}
                        className="group bg-surface-container border border-primary/20 rounded-xl p-4 cursor-pointer hover:bg-primary/5 hover:border-primary transition-all relative overflow-hidden"
                        onClick={() => handleApplyProfile(p)}
                      >
                         <div className="flex justify-between items-start mb-1">
                           <h5 className="font-bold text-on-surface text-sm">{p.name}</h5>
                           <div className="flex gap-1 opacity-100 xl:opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                               onClick={(e) => { e.stopPropagation(); setEditingProfileId(p.id); setEditingProfileName(p.name); }}
                               className="p-1 text-primary hover:bg-primary/10 rounded"
                             >
                                <span className="material-symbols-outlined text-[14px]">edit</span>
                             </button>
                             <button 
                               onClick={(e) => { e.stopPropagation(); setReportProfiles(prev => prev.filter(x => x.id !== p.id)); }}
                               className="p-1 text-error hover:bg-error/10 rounded"
                             >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                             </button>
                           </div>
                         </div>
                         <p className="text-[11px] text-on-surface-variant font-medium">
                           {mod?.name || 'Base Desconhecida'}
                         </p>
                         <p className="text-[10px] text-on-surface-variant mt-1">
                           {p.columns.length} campos • {p.columns.length > 5 ? 'Paisagem' : 'Retrato'}
                         </p>
                      </div>
                    )})}
                    {reportProfiles.length === 0 && editingProfileName === '' && (
                      <p className="text-center text-sm text-on-surface-variant italic py-10 opacity-70">
                         Nenhum perfil salvo
                      </p>
                    )}
                  </div>
              </div>

              <div className="flex-1 flex flex-col bg-surface-container-lowest overflow-hidden min-w-0">
                <div className="p-4 border-b border-outline-variant bg-surface-container-low/30 flex justify-between items-center flex-wrap gap-4">
                <div>
                  <h3 className="font-bold text-on-surface text-lg">Pré-visualização</h3>
                  <p className="text-sm text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">info</span>
                    O relatório no PDF será ajustado automaticamente para {activeColumns.length > 5 ? 'paisagem' : 'retrato'}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                  {(reportSearchTerm || filterWork.length > 0 || filterStatus.length > 0) && (
                    <button
                      onClick={() => {
                        setReportSearchTerm('');
                        setFilterWork([]);
                        setFilterStatus([]);
                      }}
                      className="px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5 rounded-lg flex items-center gap-1.5 transition-colors border border-primary/20"
                      title="Limpar todos os filtros"
                    >
                      <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
                      LIMPAR FILTROS
                    </button>
                  )}
                  <div className="relative flex-1 min-w-[180px]">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                    <input
                      type="text"
                      placeholder="Filtrar dados..."
                      value={reportSearchTerm}
                      onChange={(e) => setReportSearchTerm(e.target.value)}
                      className="w-full bg-white dark:bg-surface-container-low border border-outline-variant rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-all shadow-sm h-[40px]"
                    />
                  </div>
                  {(selectedModule?.id === 'vehicles' || selectedModule?.id === 'drivers' || selectedModule?.id === 'telemetry') && (
                    <>
                      {selectedModule?.id === 'telemetry' && (
                        <MultiSelect 
                          label="Provedor"
                          placeholder="Provedor de Telemetria"
                          options={[
                            { name: 'Todos os Provedores' },
                            { name: 'GaussFleet' },
                            { name: 'Solusat' },
                            { name: 'Sem Telemetria' }
                          ]}
                          selected={filterProvider}
                          onChange={setFilterProvider}
                        />
                      )}
                      <MultiSelect 
                        label="Obras"
                        placeholder="Obras"
                        options={works}
                        selected={filterWork}
                        onChange={setFilterWork}
                      />
                      <MultiSelect 
                        label="Status"
                        placeholder="Status"
                        options={[
                          { name: 'Ativo' },
                          { name: 'Inativo' },
                          { name: 'Em Manutenção' },
                          ...statuses
                        ]}
                        selected={filterStatus}
                        onChange={setFilterStatus}
                      />
                    </>
                  )}
                </div>
              </div>

              {selectedModule?.id === 'telemetry' && data.length > 0 && (
                <div className="p-6 border-b border-outline-variant/30 bg-surface-container-low/30">
                   <div className="flex gap-2 items-center mb-4">
                      <span className="material-symbols-outlined text-primary text-[20px]">insights</span>
                      <h4 className="font-bold text-on-surface text-sm uppercase tracking-wide">Resumo da Frota</h4>
                   </div>
                   <div className="flex flex-wrap gap-4">
                     {Object.entries(sortedData.reduce((acc, curr) => {
                         const prov = curr.telemetryProvider || 'Sem Telemetria';
                         acc[prov] = (acc[prov] || 0) + 1;
                         return acc;
                     }, {} as Record<string, number>)).sort((a: any, b: any) => b[1] - a[1]).map(([prov, count]: any) => (
                         <div key={prov} className="bg-white dark:bg-surface-container-low border border-outline-variant/50 rounded-2xl px-5 py-4 flex flex-col min-w-[140px] shadow-sm animate-in fade-in zoom-in-95 duration-300">
                            <span className="text-3xl font-black text-primary">{count}</span>
                            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mt-1 truncate">{prov}</span>
                         </div>
                     ))}
                   </div>
                </div>
              )}

              <div 
                ref={scrollRef}
                {...events}
                className={`overflow-x-auto w-full min-h-[400px] select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              >
                {loadingData ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
                    <p className="text-on-surface-variant font-medium">Carregando dados...</p>
                  </div>
                ) : activeColumns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                     <span className="material-symbols-outlined text-5xl text-on-surface-variant/50 mb-2">view_column_2</span>
                     <p className="font-bold text-on-surface">Nenhuma coluna selecionada</p>
                     <p className="text-sm text-on-surface-variant">Selecione pelo menos uma coluna para visualizar os dados.</p>
                  </div>
                ) : selectedModule && selectedModule.id === 'inspections' ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                     <span className="material-symbols-outlined text-5xl text-on-surface-variant/50 mb-2">info</span>
                     <p className="font-bold text-on-surface">Base de Inspeções Indisponível</p>
                     <p className="text-sm text-on-surface-variant mt-2 max-w-md">O sistema atual de inspeções funciona através de relatórios e checklists digitais para PDF. Não há dados tabulares diários de checklists individuais estruturados para compor uma tabela no momento.</p>
                  </div>
                ) : data.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                     <span className="material-symbols-outlined text-5xl text-on-surface-variant/50 mb-2">search_off</span>
                     <p className="font-bold text-on-surface">Nenhum registro encontrado</p>
                     <p className="text-sm text-on-surface-variant">A base de dados selecionada está vazia.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse table-auto min-w-max">
                    <thead>
                      <tr className="bg-surface-container-low dark:bg-surface-variant/50">
                        {activeColumns.map(c => (
                          <th 
                            key={c.key} 
                            onClick={() => handleSort(c.key)}
                            className={`px-5 py-3 text-sm font-bold text-on-surface-variant border-b border-outline-variant/30 uppercase tracking-wider whitespace-nowrap text-${c.align || 'left'} cursor-pointer hover:bg-surface-container transition-colors group select-none`}
                          >
                            <div className={`flex items-center gap-1 ${c.align === 'center' ? 'justify-center' : c.align === 'right' ? 'justify-end' : ''}`}>
                              {c.label}
                              <span className={`material-symbols-outlined text-[18px] transition-opacity ${sortConfig?.key === c.key ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-40'}`}>
                                {sortConfig?.key === c.key && sortConfig.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {sortedData.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-surface-container transition-colors">
                          {activeColumns.map(c => {
                            const val = item[c.key];
                            const rendered = c.renderer ? c.renderer(val, item) : null;
                            const displayVal = rendered !== null ? rendered : (val != null && val !== "" ? String(val) : '-');
                            
                            return (
                              <td key={c.key} className={`px-5 py-3 text-sm text-on-surface whitespace-normal break-words align-middle max-w-[250px] min-w-[120px] text-${c.align || 'left'}`}>
                                {displayVal}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="p-3 bg-surface-container border-t border-outline-variant text-center text-xs font-medium text-on-surface-variant">
                Exibindo total de {sortedData.length} registros.
              </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
