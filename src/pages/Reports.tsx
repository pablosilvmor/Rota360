import { useState, useEffect, ReactNode } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

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
          <div className="w-16 h-12 rounded-lg overflow-hidden bg-surface-container-low border border-outline-variant/30 shrink-0 flex items-center justify-center">
            <img src={val} alt="Veículo" className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-16 h-12 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-center justify-center text-on-surface-variant/30">
            <span className="material-symbols-outlined text-[20px]">image_not_supported</span>
          </div>
        )
      },
      { key: 'plate', label: 'Placa' },
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
      { key: 'assignedDriver', label: 'Motorista Atribuído' },
      { key: 'status', label: 'Status' },
      { key: 'observation', label: 'Observações', renderer: (val: any, item: any) => item?.observation || item?.observations || val || '-' },
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
        renderer: (val: any) => val ? (
          <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-container-low border border-outline-variant/30 shrink-0 mx-auto flex items-center justify-center">
            <img src={val} alt="Motorista" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-12 h-12 rounded-full bg-surface-container-low border border-outline-variant/30 flex items-center justify-center text-on-surface-variant/30 mx-auto">
            <span className="material-symbols-outlined text-[16px]">person</span>
          </div>
        )
      },
      { key: 'name', label: 'Nome' },
      { key: 'cnh', label: 'CNH' },
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
      { key: 'phone', label: 'Telefone' },
      { key: 'vehicleAssigned', label: 'Veículo Atribuído' },
    ]
  },
  {
    id: 'inspections',
    name: 'Inspeções',
    collectionId: 'inspections',
    icon: 'fact_check',
    columns: [
      { key: 'vehiclePlate', label: 'Placa' },
      { key: 'driverName', label: 'Motorista' },
      { key: 'date', label: 'Data', renderer: formatDate },
      { key: 'type', label: 'Tipo' },
      { key: 'odometer', label: 'Odômetro' },
      { key: 'fuelLevel', label: 'Nível' },
      { key: 'status', label: 'Status' },
      { key: 'finalStatus', label: 'Diagnóstico' },
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
              {options.map(opt => (
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
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export function Reports() {
  const [selectedModuleId, setSelectedModuleId] = useLocalStorageState<string | null>('reports_selectedModuleId', null);
  const selectedModule = MODULES.find(m => m.id === selectedModuleId) || null;
  
  const [selectedColumns, setSelectedColumns] = useLocalStorageState<string[]>('reports_selectedColumns', []);
  const [data, setData] = useState<any[]>([]);
  const [reportSearchTerm, setReportSearchTerm] = useLocalStorageState('reports_searchTerm', '');
  const [filterWork, setFilterWork] = useLocalStorageState<string[]>('reports_filterWork', []);
  const [filterStatus, setFilterStatus] = useLocalStorageState<string[]>('reports_filterStatus', []);
  const [works, setWorks] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [headerLogo, setHeaderLogo] = useState<{src: string, ratio: number} | null>(null);
  const [footerLogo, setFooterLogo] = useState<{src: string, ratio: number} | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [exportProgress, setExportProgress] = useState(0);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [wSnap, sSnap] = await Promise.all([
          getDocs(query(collection(db, 'works'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'statuses'), orderBy('name', 'asc')))
        ]);
        setWorks(wSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setStatuses(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching filters", err);
      }
    };
    fetchFilters();

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
    loadImg('https://i.imgur.com/f2EH8ls.png', setHeaderLogo);
    loadImg('https://i.imgur.com/1DaE4Bm.png', setFooterLogo);
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

    try {
      const q = query(collection(db, mod.collectionId));
      const snap = await getDocs(q);
      let docs = snap.docs.map(d => ({id: d.id, ...d.data()}));

      if (mod.id === 'vehicles') {
        const driversSnap = await getDocs(query(collection(db, 'drivers')));
        const driversData = driversSnap.docs.map(d => d.data());
        docs = docs.map((v: any) => {
          const assignedDs = driversData.filter(d => Array.isArray(d.vehicleAssigned) ? d.vehicleAssigned.includes(v.plate) : d.vehicleAssigned === v.plate);
          return { ...v, assignedDriver: assignedDs.length > 0 ? assignedDs.map((d: any) => d.name).join(', ') : 'Não Atribuída' };
        });
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
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, mod.collectionId);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (selectedModule && data.length === 0 && !loadingData) {
      fetchModuleData(selectedModule);
    }
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

  const filteredData = data.filter(item => {
    const matchesSearch = !reportSearchTerm || activeColumns.some(c => {
      const val = item[c.key];
      const rendered = c.renderer ? c.renderer(val, item) : (val != null ? String(val) : '');
      const displayVal = typeof rendered === 'string' ? rendered : (val != null ? String(val) : '');
      return displayVal.toLowerCase().includes(reportSearchTerm.toLowerCase());
    });

    const isVehicles = selectedModule?.id === 'vehicles';
    const matchesWork = !isVehicles || filterWork.length === 0 || filterWork.includes('Todas as Obras') || 
      (Array.isArray(item.costCenter) 
        ? item.costCenter.some(c => filterWork.includes(c)) 
        : filterWork.includes(item.costCenter));
    
    const matchesStatus = !isVehicles || filterStatus.length === 0 || filterStatus.includes('Todos os Status') || 
      filterStatus.includes(item.status);

    return matchesSearch && matchesWork && matchesStatus;
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
    const PLACEHOLDER_IMG = "https://cdn-icons-png.flaticon.com/512/3774/3774278.png"; // Ícone de caminhão/veículo estável

    let loadedCount = 0;
    if (imageColIdx !== -1) {
      const urlsToLoad = Array.from(new Set(sortedData.map(item => item.imageUrl || PLACEHOLDER_IMG)));
      
      await Promise.all(urlsToLoad.map(async (url) => {
        try {
          const fetchUrl = typeof url === 'string' ? url : PLACEHOLDER_IMG;
          let response: Response | null = null;
          
          // Tentativa 1: Proxy WSRV (Redimensionado e estável)
          try {
            const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(fetchUrl)}&w=300&output=jpeg&q=80&errorredirect=${encodeURIComponent(PLACEHOLDER_IMG)}`;
            response = await fetch(proxyUrl);
          } catch (err) {}

          // Tentativa 2: Direto
          if (!response || !response.ok) {
            try {
              response = await fetch(fetchUrl);
            } catch (err) {}
          }

          // Tentativa 3: Placeholder Final
          if (!response || !response.ok) {
            response = await fetch(PLACEHOLDER_IMG);
          }
          
          if (!response || !response.ok) throw new Error("Image unreachable");

          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          
          const imgData = await new Promise<{src: string, ratio: number}>((resolve) => {
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
                  resolve({ src: canvas.toDataURL('image/jpeg', 0.8), ratio: img.naturalWidth / img.naturalHeight });
                } else {
                  resolve({ src: dataUrl, ratio: img.naturalWidth / img.naturalHeight });
                }
              } catch (e) {
                resolve({ src: dataUrl, ratio: img.naturalWidth / img.naturalHeight });
              }
            };
            img.onerror = () => resolve({ src: PLACEHOLDER_IMG, ratio: 1 });
            img.src = dataUrl;
          });
          imageCache[url] = imgData;
        } catch (err) {
          console.error(`[PDF EXPORT] Erro irrecuperável na imagem: ${url}`, err);
        }
        loadedCount++;
        setExportProgress(Math.floor((loadedCount / urlsToLoad.length) * 100));
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

    const isFleetReport = selectedModule.id === 'vehicles';

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
          const imgUrl = item?.imageUrl || "https://cdn-icons-png.flaticon.com/512/3774/3774278.png";
          const cached = imageCache[imgUrl];

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
        
        const byText = "By Pablo Moreira";
        const byWidth = doc.getTextWidth(byText);
        doc.text(byText, pageWidth - marginX - byWidth, pageHeight - 10);
      }
    });

    // @ts-ignore
    if (typeof doc.putTotalPages === 'function') {
      doc.putTotalPages('{total_pages_count_string}');
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
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[32px] font-bold text-on-surface tracking-tight mb-2">Central de Relatórios</h2>
          <p className="text-on-surface-variant font-medium">Extraia informações e gere arquivos profissionais em PDF da base de dados.</p>
        </div>
        <button
          onClick={handleExportPDF}
          disabled={!selectedModule || selectedColumns.length === 0 || loadingData}
          className="relative px-6 py-3 bg-primary text-on-primary rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:hover:shadow-lg flex items-center gap-2 justify-center overflow-hidden"
        >
          {loadingData && exportProgress > 0 && (
            <div className="absolute bottom-0 left-0 h-1 bg-primary-container" style={{ width: `${exportProgress}%` }} />
          )}
          <span className="material-symbols-outlined">
            {loadingData ? 'progress_activity' : 'picture_as_pdf'}
          </span>
          {loadingData ? `Exportando (${exportProgress}%)` : 'Exportar PDF Selecionado'}
        </button>
      </div>

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
              className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-outline-variant bg-surface-container-low/30 flex justify-between items-center flex-wrap gap-4">
                <div>
                  <h3 className="font-bold text-on-surface text-lg">Pré-visualização</h3>
                  <p className="text-sm text-on-surface-variant flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">info</span>
                    O relatório no PDF será ajustado automaticamente para {activeColumns.length > 5 ? 'paisagem' : 'retrato'}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                  <div className="relative flex-1 min-w-[200px]">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                    <input
                      type="text"
                      placeholder="Filtrar dados..."
                      value={reportSearchTerm}
                      onChange={(e) => setReportSearchTerm(e.target.value)}
                      className="w-full bg-white border border-outline-variant rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-all shadow-sm h-[40px]"
                    />
                  </div>
                  {selectedModule?.id === 'vehicles' && (
                    <>
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

              <div className="overflow-x-auto min-h-[400px]">
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
                      <tr className="bg-surface-container-low/50">
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
                      {sortedData.slice(0, 15).map((item, idx) => (
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
              {data.length > 15 && (
                <div className="p-3 bg-surface-container border-t border-outline-variant text-center text-xs font-medium text-on-surface-variant">
                  Mostrando os primeiros 15 de {data.length} registros. O PDF incluirá todos os registros.
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
