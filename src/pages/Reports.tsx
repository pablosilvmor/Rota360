import { useState, useEffect } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'framer-motion';

type ModuleData = {
  id: string;
  name: string;
  collectionId: string;
  columns: { key: string; label: string; renderer?: (val: any, item: any) => string; align?: 'left' | 'center' | 'right' }[];
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
        renderer: (val: any) => Array.isArray(val) ? val.join(', ') : val
      },
      { key: 'assignedDriver', label: 'Motorista Atribuído' },
      { key: 'status', label: 'Status' },
      { key: 'observations', label: 'Observações' },
    ]
  },
  {
    id: 'drivers',
    name: 'Motoristas',
    collectionId: 'drivers',
    icon: 'group',
    columns: [
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
      { key: 'status', label: 'Status' },
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

export function Reports() {
  const [selectedModule, setSelectedModule] = useState<ModuleData | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [data, setData] = useState<any[]>([]);
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [loadingData, setLoadingData] = useState(false);
  const [headerLogo, setHeaderLogo] = useState<{src: string, ratio: number} | null>(null);
  const [footerLogo, setFooterLogo] = useState<{src: string, ratio: number} | null>(null);

  useEffect(() => {
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
    setSelectedModule(mod);
    setSelectedColumns(mod.columns.map(c => c.key));
    setLoadingData(true);
    setData([]);
    
    if (mod.id === 'inspections') {
      setLoadingData(false);
      return; // Will be handled by empty state component logic to show warning
    }

    try {
      const q = query(collection(db, mod.collectionId));
      const snap = await getDocs(q);
      let docs = snap.docs.map(d => ({id: d.id, ...d.data()}));

      if (mod.id === 'vehicles') {
        const driversSnap = await getDocs(query(collection(db, 'drivers')));
        const driversData = driversSnap.docs.map(d => d.data());
        docs = docs.map((v: any) => {
          const assignedD = driversData.find(d => d.vehicleAssigned === v.plate);
          return { ...v, assignedDriver: assignedD ? assignedD.name : 'Não Atribuída' };
        });
      }

      setData(docs);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, mod.collectionId);
    } finally {
      setLoadingData(false);
    }
  };

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const activeColumns = selectedModule?.columns.filter(c => selectedColumns.includes(c.key)) || [];

  const filteredData = data.filter(item => {
    if (!reportSearchTerm) return true;
    const term = reportSearchTerm.toLowerCase();
    return activeColumns.some(c => {
      const val = item[c.key];
      const displayVal = c.renderer ? c.renderer(val, item) : (val != null ? String(val) : '');
      return displayVal.toLowerCase().includes(term);
    });
  });

  const handleExportPDF = () => {
    if (!selectedModule) return;

    const isLandscape = activeColumns.length > 5;
    const doc = new jsPDF(isLandscape ? 'landscape' : 'portrait');

    const title = `Relatório de ${selectedModule.name}`;
    
    // Header and footer setup
    const headerLogoUrl = 'https://i.imgur.com/f2EH8ls.png';
    const footerLogoUrl = 'https://i.imgur.com/1DaE4Bm.png';
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const tableCols = activeColumns.map(c => c.label);
    const tableData = filteredData.map(item => 
      activeColumns.map(c => {
        const val = item[c.key];
        return c.renderer ? c.renderer(val, item) : (val != null ? String(val) : '-');
      })
    );

    autoTable(doc, {
      head: [tableCols],
      body: tableData,
      startY: 40,
      margin: { top: 45, bottom: 30 },
      styles: {
        fontSize: 9,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: [20, 24, 27],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      didDrawPage: function (hookData) {
        // Headers
        if (headerLogo) {
          const h = 12;
          const w = h * headerLogo.ratio;
          doc.addImage(headerLogo.src, 'PNG', 14, 10, w, h, '', 'FAST');
        }
        
        if (hookData.pageNumber === 1) {
          doc.setFontSize(16);
          doc.setTextColor(40);
          doc.text(title, 14, 32);
        }

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(100);
        
        const pageNumber = (doc.internal as any).getNumberOfPages();
        const totalPagesExp = "{total_pages_count_string}";
        doc.text(`Pág. ${pageNumber} de ${totalPagesExp}`, 14, pageHeight - 10);
        
        if (footerLogo) {
          const h = 8;
          const w = h * footerLogo.ratio;
          doc.addImage(footerLogo.src, 'PNG', (pageWidth - w) / 2, pageHeight - 15, w, h, '', 'FAST');
        }
        
        const byText = "By Pablo Moreira";
        const byWidth = doc.getTextWidth(byText);
        doc.text(byText, pageWidth - 14 - byWidth, pageHeight - 10);
      }
    });

    // @ts-ignore
    if (typeof doc.putTotalPages === 'function') {
      doc.putTotalPages('{total_pages_count_string}');
    }

    doc.save(`${title.replace(/\s+/g, '_').toLowerCase()}.pdf`);
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
          className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:hover:shadow-lg flex items-center gap-2 justify-center"
        >
          <span className="material-symbols-outlined">picture_as_pdf</span>
          Exportar PDF Selecionado
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">
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
                <div className="relative w-full md:w-64">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                  <input
                    type="text"
                    placeholder="Filtrar dados..."
                    value={reportSearchTerm}
                    onChange={(e) => setReportSearchTerm(e.target.value)}
                    className="w-full bg-white border border-outline-variant rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-all shadow-sm"
                  />
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
                          <th key={c.key} className={`px-5 py-3 text-sm font-semibold text-on-surface-variant border-b border-outline-variant/30 uppercase tracking-wider whitespace-nowrap text-${c.align || 'left'}`}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {filteredData.slice(0, 15).map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-surface-container transition-colors">
                          {activeColumns.map(c => {
                            const val = item[c.key];
                            const displayVal = c.renderer ? c.renderer(val, item) : (val != null && val !== "" ? String(val) : '-');
                            return (
                              <td key={c.key} className={`px-5 py-3 text-sm text-on-surface whitespace-normal break-words align-top max-w-[250px] min-w-[120px] text-${c.align || 'left'}`}>
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
