import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, where, writeBatch, doc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { PrivateValue } from '../contexts/PrivacyContext';
import * as xlsx from 'xlsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area } from 'recharts';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
};

export function Fuel() {
  const [works, setWorks] = useState<any[]>([]);
  const [fuelRecords, setFuelRecords] = useState<any[]>([]);
  const [importLogs, setImportLogs] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [filterWork, setFilterWork] = useLocalStorageState('fuel_filterWork', 'Todas as Obras');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useLocalStorageState('fuel_filterMonth', 'Todos');
  const [filterYear, setFilterYear] = useLocalStorageState('fuel_filterYear', 'Todos');
  
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  const clearFilters = () => {
    setFilterWork('Todas as Obras');
    setSearchTerm('');
    setFilterMonth('Todos');
    setFilterYear('Todos');
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const qWorks = query(collection(db, 'works'), orderBy('name', 'asc'));
    const unsubscribeWorks = onSnapshot(qWorks, (snapshot) => {
      setWorks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'works');
    });

    const qVehicles = query(collection(db, 'vehicles'));
    const unsubscribeVehicles = onSnapshot(qVehicles, (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qDrivers = query(collection(db, 'drivers'));
    const unsubscribeDrivers = onSnapshot(qDrivers, (snapshot) => {
      setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qFuel = query(collection(db, 'fuel_records'), orderBy('date', 'desc'));
    const unsubscribeFuel = onSnapshot(qFuel, (snapshot) => {
      setFuelRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'fuel_records');
    });

    const qLogs = query(collection(db, 'fuel_imports'), orderBy('createdAt', 'desc'));
    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      setImportLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'fuel_imports');
    });

    return () => {
      unsubscribeWorks();
      unsubscribeVehicles();
      unsubscribeDrivers();
      unsubscribeFuel();
      unsubscribeLogs();
    };
  }, []);



  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = xlsx.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { raw: false, header: 1 }) as string[][];
      if (rows.length < 2) return;

      const headers = rows[0].map((h: any) => String(h).trim().toUpperCase());
      
      const idxCodTransacao = headers.findIndex(h => h.includes('CODIGO TRANSACAO') || h.includes('CÓDIGO TRANSAÇÃO'));
      const idxDataTransacao = headers.findIndex(h => h.includes('DATA TRANSACAO') || h.includes('DATA TRANSAÇÃO'));
      const idxPlaca = headers.findIndex(h => h.includes('PLACA'));
      const idxModelo = headers.findIndex(h => h.includes('MODELO VEICULO') || h.includes('MODELO VEÍCULO'));
      const idxCombustivel = headers.findIndex(h => h.includes('TIPO COMBUSTIVEL') || h.includes('TIPO COMBUSTÍVEL'));
      const idxLitros = headers.findIndex(h => h === 'LITROS');
      const idxValor = headers.findIndex(h => h.includes('VALOR EMISSAO') || h.includes('VALOR EMISSÃO') || h.includes('VALOR TOTAL'));
      const idxOdometro = headers.findIndex(h => h.includes('ODOMETRO') || h.includes('ODÔMETRO'));
      const idxPosto = headers.findIndex(h => h.includes('NOME ESTABELECIMENT') || h.includes('ESTABELECIMENTO'));
      
      let existingTransIds = new Set(fuelRecords.map(r => String(r.transactionId)));
      const batchList = [];
      let imported = 0;
      let duplicates = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        const codTransacao = idxCodTransacao >= 0 ? row[idxCodTransacao] : row[0];
        if (!codTransacao) continue;
        const transactionId = String(codTransacao).trim();
        
        if (existingTransIds.has(transactionId)) {
          duplicates++;
          continue;
        }
        
        const dataTransStr = idxDataTransacao >= 0 ? row[idxDataTransacao] : row[4];
        const placa = idxPlaca >= 0 ? row[idxPlaca] : row[5];
        const modelo = idxModelo >= 0 ? row[idxModelo] : row[7];
        const combustivel = idxCombustivel >= 0 ? row[idxCombustivel] : row[13];
        const litrosStr = idxLitros >= 0 ? row[idxLitros] : row[14];
        const valorStr = idxValor >= 0 ? row[idxValor] : row[18];
        const odometroStr = idxOdometro >= 0 ? row[idxOdometro] : row[16];
        const posto = idxPosto >= 0 ? row[idxPosto] : row[20];
        
        const litros = parseFloat(String(litrosStr).replace(',', '.'));
        const valor = parseFloat(String(valorStr).replace(/[^\d.,-]/g, '').replace(',', '.'));
        const odometro = parseFloat(String(odometroStr).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        
        let dateValue = new Date();
        if (dataTransStr) {
          const dateStr = String(dataTransStr).trim();
          if (dateStr.includes('/')) {
              const [datePart, timePart] = dateStr.split(' ');
              const [d, m, y] = datePart.split('/');
              if (timePart) {
                  const [h, min, s] = timePart.split(':');
                  dateValue = new Date(Number(y), Number(m)-1, Number(d), Number(h), Number(min), Number(s || 0));
              } else {
                  dateValue = new Date(Number(y), Number(m)-1, Number(d));
              }
          }
        }
        
        const rawData: Record<string, any> = {};
        headers.forEach((header, index) => {
          if (header) {
            rawData[header] = row[index];
          }
        });

        batchList.push({
          transactionId,
          date: dateValue,
          vehiclePlate: String(placa || '').trim(),
          vehicleModel: String(modelo || '').trim(),
          fuelType: String(combustivel || '').trim(),
          liters: isNaN(litros) ? 0 : litros,
          totalValue: isNaN(valor) ? 0 : valor,
          odometer: isNaN(odometro) ? 0 : odometro,
          station: String(posto || '').trim(),
          workName: 'Não informada',
          card: '', 
          createdAt: new Date(),
          importMode: 'excel',
          rawData
        });
        existingTransIds.add(transactionId);
      }
      
      const totalToImport = batchList.length;
      setImportProgress({ current: 0, total: totalToImport });

      const importLog = await addDoc(collection(db, 'fuel_imports'), {
        fileName: file.name,
        user: auth.currentUser?.email || 'Desconhecido',
        createdAt: serverTimestamp(),
        total: totalToImport
      });

      const chunkSize = 400;
      for (let i = 0; i < batchList.length; i += chunkSize) {
        const chunk = batchList.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const item of chunk) {
          batch.set(doc(collection(db, 'fuel_records')), { ...item, importId: importLog.id });
        }
        await batch.commit();
        imported += chunk.length;
        setImportProgress({ current: imported, total: totalToImport });
      }
      
      setImportProgress({ current: totalToImport, total: totalToImport });
      setTimeout(() => alert(`Importação concluída: ${imported} registros novos.\n(Ignorados: ${duplicates} duplicados)`), 100);
      
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao importar arquivo Excel: ${err?.message || err}`);
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
    if (e.target) {
       e.target.value = '';
    }
  };

  const handleClearData = async () => {
    setClearing(true);
    try {
      const q = query(collection(db, 'fuel_records'), where('importMode', '==', 'excel'));
      const snapshot = await getDocs(q);
      const batchList: any[] = [];
      snapshot.forEach(doc => batchList.push(doc.ref));
      
      const chunkSize = 400;
      for (let i = 0; i < batchList.length; i += chunkSize) {
        const chunk = batchList.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const ref of chunk) {
          batch.delete(ref);
        }
        await batch.commit();
      }
      setShowClearConfirm(false);
    } catch (err) {
      console.error(err);
      alert('Erro ao apagar dados importados.');
    } finally {
      setClearing(false);
    }
  };

  const filteredRecords = fuelRecords.filter(r => {
    const matchesWork = filterWork === 'Todas as Obras' || r.workName === filterWork;
    const matchesSearch = searchTerm === '' || 
      String(r.vehiclePlate).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.vehicleModel).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.driverName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.station).toLowerCase().includes(searchTerm.toLowerCase()) ||
      Object.values(r.rawData || {}).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
    
    const recordDate = r.date?.toDate ? r.date.toDate() : new Date(0);
    
    // allow 'Todos' to actually be everything
    const targetMonth = filterMonth;
    const targetYear = filterYear;
    
    const matchesMonth = targetMonth === 'Todos' || (recordDate.getMonth() + 1).toString() === targetMonth;
    const matchesYear = targetYear === 'Todos' || recordDate.getFullYear().toString() === targetYear;
    
    return matchesWork && matchesSearch && matchesMonth && matchesYear;
  });

  let sortedRecords = [...filteredRecords];
  if (sortConfig !== null) {
    sortedRecords.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (sortConfig.key === 'date') {
         aVal = a.date?.toDate ? a.date.toDate() : new Date(0);
         bVal = b.date?.toDate ? b.date.toDate() : new Date(0);
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return 'swap_vert';
    return sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
  };

  const totalCost = filteredRecords.reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
  const totalLiters = filteredRecords.reduce((acc, curr) => acc + (curr.liters || 0), 0);

  let firstDateStr = '-';
  let lastDateStr = '-';
  if (fuelRecords.length > 0) {
    const dates = fuelRecords.map(r => r.date?.toDate ? r.date.toDate().getTime() : 0).filter(t => t > 0);
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      firstDateStr = minDate.toLocaleDateString('pt-BR');
      lastDateStr = maxDate.toLocaleDateString('pt-BR');
    }
  }

  const chartData = React.useMemo(() => {
    const dataByDate: Record<string, { liters: number, totalValue: number }> = {};
    const reversed = [...sortedRecords].reverse();
    reversed.forEach(r => {
      const d = r.date?.toDate ? r.date.toDate() : new Date(0);
      const k = filterMonth === 'Todos' && filterYear === 'Todos' ?
          `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}` :
          `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      
      if (!dataByDate[k]) {
        dataByDate[k] = { liters: 0, totalValue: 0 };
      }
      dataByDate[k].liters += parseFloat(r.liters) || 0;
      dataByDate[k].totalValue += parseFloat(r.totalValue) || 0;
    });
    return Object.keys(dataByDate).map(date => ({
       date,
       liters: Number(dataByDate[date].liters.toFixed(2)),
       totalValue: Number(dataByDate[date].totalValue.toFixed(2))
    }));
  }, [sortedRecords, filterMonth, filterYear]);

  return (
    <motion.div 
      className="pb-12 relative"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <div className="bg-white p-12 rounded-[40px] shadow-2xl border-4 border-dashed border-primary flex flex-col items-center gap-6 scale-110">
              <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-[64px] text-primary animate-bounce">upload_file</span>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-on-surface mb-2">Solte sua planilha do Excel</h2>
                <p className="text-on-surface-variant font-medium">O arquivo (.xlsx) será processado automaticamente.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="mb-8" variants={itemVariants}>
        <h2 className="text-[32px] font-semibold text-primary leading-[1.3] tracking-[-0.01em]">Gestão de Combustível</h2>
        <p className="text-base text-on-surface-variant mt-2">Monitore os abastecimentos e custos importados da frota.</p>
        {fuelRecords.length > 0 && (
          <p className="text-xs text-on-surface-variant font-medium mt-1">
            Período dos dados: <strong className="text-primary">{firstDateStr}</strong> a <strong className="text-primary">{lastDateStr}</strong>
          </p>
        )}
      </motion.div>

      <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6" variants={containerVariants}>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-secondary-container text-on-secondary-container rounded-lg">
               <span className="material-symbols-outlined">payments</span>
            </div>
            <span className="bg-surface-container px-2 py-1 rounded text-xs font-bold text-on-surface-variant">Filtrado</span>
          </div>
          <p className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Custo Total</p>
          <h3 className="text-[36px] font-bold text-primary mt-1 leading-[1.2] tracking-[-0.02em]">R$ <PrivateValue value={totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} /></h3>
          <p className="text-xs text-on-surface-variant mt-2 font-semibold">Valor total gasto no período filtrado</p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-tertiary-container text-on-tertiary-container rounded-lg">
              <span className="material-symbols-outlined">local_gas_station</span>
            </div>
          </div>
          <p className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Volume Abastecido</p>
          <h3 className="text-[36px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">{totalLiters.toLocaleString('pt-BR')} L</h3>
          <p className="text-xs text-on-surface-variant mt-2 font-semibold">Volume acumulado conforme registros</p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-primary-container text-on-primary-container rounded-lg">
              <span className="material-symbols-outlined">description</span>
            </div>
          </div>
          <p className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Total de Registros</p>
          <h3 className="text-[36px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">{filteredRecords.length}</h3>
          <p className="text-xs text-on-surface-variant mt-2 font-semibold">Abastecimentos documentados</p>
        </motion.div>
      </motion.div>

      <motion.div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8" variants={itemVariants}>
          <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant h-[250px]">
              <h4 className="text-sm font-bold text-on-surface-variant mb-4 uppercase">Custo Diário (R$)</h4>
              <ResponsiveContainer width="100%" height="80%" minWidth={1} minHeight={1}>
                <AreaChart data={chartData}>
                  <XAxis dataKey="date" tick={{fontSize: 12}} stroke="#888" tickLine={false} axisLine={false} />
                  <YAxis tick={{fontSize: 12}} stroke="#888" tickLine={false} axisLine={false} />
                  <Tooltip 
                    formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Custo Total']}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  <Area type="monotone" dataKey="totalValue" stroke="#6750a4" fill="#6750a4" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
          </div>
          <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant h-[250px]">
              <h4 className="text-sm font-bold text-on-surface-variant mb-4 uppercase">Litros Diários (L)</h4>
              <ResponsiveContainer width="100%" height="80%" minWidth={1} minHeight={1}>
                <BarChart data={chartData}>
                  <XAxis dataKey="date" tick={{fontSize: 12}} stroke="#888" tickLine={false} axisLine={false} />
                  <YAxis tick={{fontSize: 12}} stroke="#888" tickLine={false} axisLine={false} />
                  <Tooltip 
                    formatter={(value: any) => [`${Number(value).toLocaleString('pt-BR')} L`, 'Litros']}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  <Bar dataKey="liters" fill="#4f378b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
          </div>
      </motion.div>

      <motion.div className="flex flex-col gap-6 mb-8" variants={itemVariants}>
          <div className="sticky top-0 z-40 bg-surface-container-highest/95 backdrop-blur-md border border-outline-variant rounded-2xl p-4 flex items-center justify-between flex-wrap gap-4 shadow-sm">
            <div className="flex gap-4 items-center flex-wrap">
              <input 
                type="text"
                placeholder="🔍 Buscar placa, motorista, posto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-[44px] bg-surface w-64 border border-outline-variant rounded-xl px-4 text-sm outline-none focus:border-primary transition-colors focus:shadow-md"
              />
              <div className="h-6 w-px bg-outline-variant" />
              <select 
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="h-[44px] bg-surface border border-outline-variant rounded-xl px-4 text-sm font-semibold outline-none focus:border-primary transition-all cursor-pointer"
              >
                  <option value="Todos">📅 Mês: Todos</option>
                  {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>)}
              </select>
              <select 
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="h-[44px] bg-surface border border-outline-variant rounded-xl px-4 text-sm font-semibold outline-none focus:border-primary transition-all cursor-pointer"
              >
                  <option value="Todos">📅 Ano: Todos</option>
                  {Array.from({length: 5}, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="h-11 px-6 bg-primary text-on-primary rounded-xl text-sm font-semibold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
              >
                  <span className="material-symbols-outlined text-[18px]">upload_file</span>
                  {importing ? 'Importando...' : 'Importar Excel'}
              </button>
              <button 
                onClick={() => setShowClearConfirm(true)}
                className="h-11 px-6 rounded-xl border border-error/50 text-sm font-semibold text-error hover:bg-error/10"
              >
                Limpar Importações
              </button>
              <button onClick={clearFilters} className="h-11 px-6 rounded-xl border border-outline-variant text-sm font-semibold text-on-surface hover:bg-surface-container">Limpar Filtros</button>
              <button 
                 onClick={() => window.location.href = '/reports'}
                className="h-11 px-6 bg-secondary text-on-secondary rounded-xl text-sm font-semibold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">summarize</span>
                Exportar Relatório
              </button>
            </div>
            
            {showClearConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
                        <h4 className="text-lg font-bold text-on-surface mb-4">Confirmar exclusão</h4>
                        <p className="text-on-surface-variant mb-6">Tem certeza que deseja excluir todos os dados importados? Esta ação não pode ser desfeita.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 rounded-lg text-on-surface">Cancelar</button>
                            <button onClick={handleClearData} className="px-4 py-2 rounded-lg bg-error text-white font-semibold flex items-center gap-2" disabled={clearing}>
                                {clearing ? 'Excluindo...' : 'Confirmar Exclusão'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <input 
                type="file" 
                ref={fileInputRef} 
                accept=".xlsx,.xls" 
                className="hidden" 
                onChange={handleFileInput}
            />
            {importing && importProgress.total > 0 && (
                <div className="w-full mt-2">
                    <div className="flex justify-between text-[9px] font-bold text-primary mb-1">
                        <span>Progresso</span>
                        <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-primary/20 h-1.5 rounded-full overflow-hidden">
                        <div 
                        className="bg-primary h-full transition-all duration-300"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                        />
                    </div>
                </div>
            )}
          </div>
      </motion.div>
      <motion.div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden mb-10" variants={itemVariants}>
        <div className="p-6 border-b border-outline-variant bg-white flex justify-between items-center">
          <h4 className="text-[18px] font-semibold text-primary">Histórico de Abastecimentos</h4>
          <button className="text-sm font-semibold text-primary hover:underline">Ver Relatório Completo</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant sticky top-0 z-10">
                <th className="p-0">
                  <button onClick={() => handleSort('date')} className="w-full px-6 py-4 text-left text-xs font-semibold text-on-surface-variant uppercase flex items-center gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer">
                    Data <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">{getSortIcon('date')}</span>
                  </button>
                </th>
                <th className="p-0">
                  <button onClick={() => handleSort('vehiclePlate')} className="w-full px-6 py-4 text-left text-xs font-semibold text-on-surface-variant uppercase flex items-center gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer">
                    Veículo <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">{getSortIcon('vehiclePlate')}</span>
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-on-surface-variant uppercase">Obra</th>
                <th className="p-0">
                  <button onClick={() => handleSort('station')} className="w-full px-6 py-4 text-left text-xs font-semibold text-on-surface-variant uppercase flex items-center gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer">
                    Posto / Local <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">{getSortIcon('station')}</span>
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-on-surface-variant uppercase">Odômetro</th>
                <th className="p-0">
                  <button onClick={() => handleSort('liters')} className="w-full px-6 py-4 text-left text-xs font-semibold text-on-surface-variant uppercase flex items-center gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer">
                    Quantidade <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">{getSortIcon('liters')}</span>
                  </button>
                </th>
                <th className="p-0">
                  <button onClick={() => handleSort('totalValue')} className="w-full px-6 py-4 text-left text-xs font-semibold text-on-surface-variant uppercase flex items-center gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer">
                    Valor <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">{getSortIcon('totalValue')}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {sortedRecords.map((item) => (
                <tr key={item.id} className="hover:bg-surface-container transition-colors group cursor-pointer" onClick={() => setSelectedRecord(item)}>
                  <td className="px-6 py-4 text-sm font-semibold">
                    {item.date?.toDate ? item.date.toDate().toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm text-primary">{item.vehicleModel || 'N/A'}</span>
                      <span className="font-mono text-xs text-on-surface-variant"><PrivateValue value={item.vehiclePlate} /></span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-on-surface">{item.workName || '-'}</td>
                  <td className="px-6 py-4 text-sm font-medium">{item.station || '-'}</td>
                  <td className="px-6 py-4 text-sm text-on-surface">{item.odometer?.toLocaleString('pt-BR') || '-'}</td>
                  <td className="px-6 py-4">
                     <div className="flex flex-col">
                      <span className="font-bold text-sm text-on-surface">{item.liters} L</span>
                      <span className="text-xs text-on-surface-variant">{item.fuelType || '-'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-on-surface">
                    R$ <PrivateValue value={item.totalValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
                  </td>
                </tr>
              ))}
              {sortedRecords.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-on-surface-variant font-medium">
                    Nenhum registro de abastecimento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>


      <AnimatePresence>
        {selectedRecord && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
            onClick={() => setSelectedRecord(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#121212]/95 border border-white/10 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden my-8 backdrop-blur-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Detalhes do Abastecimento</h3>
                    <p className="text-white/60 text-sm mt-1">
                        Transação: <span className="font-mono text-white/80">{selectedRecord.transactionId || '-'}</span>
                    </p>
                </div>
                <button 
                  onClick={() => setSelectedRecord(null)}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[70vh]">
                <div className="flex flex-col md:flex-row gap-6 mb-8">
                    {/* Vehicle & Driver Images Check */}
                    {(() => {
                        const vehicleDoc = vehicles.find(v => String(v.plate).toUpperCase().replace(/[^A-Z0-9]/g, '') === String(selectedRecord.vehiclePlate).toUpperCase().replace(/[^A-Z0-9]/g, ''));
                        const rawDriverName = typeof selectedRecord.rawData === 'object' && selectedRecord.rawData !== null ? 
                            Object.values(selectedRecord.rawData).find(val => typeof val === 'string' && val.includes('MOTORISTA') || (val && typeof val === 'string' && val.length > 5 && drivers.some(d => String(d.name).toLowerCase() === val.toLowerCase()))) 
                            : null;
                        const matchingDriverStr = typeof rawDriverName === 'string' ? rawDriverName : selectedRecord.driverName;
                        const driverDoc = matchingDriverStr ? drivers.find(d => String(d.name).toLowerCase().includes(matchingDriverStr.toLowerCase()) || matchingDriverStr.toLowerCase().includes(String(d.name).toLowerCase())) : null;

                        return (
                           <div className="flex gap-4 md:w-1/3">
                              {(vehicleDoc?.imageUrl) && (
                                  <div className="flex-1 flex flex-col items-center">
                                      <div className="w-full aspect-square rounded-2xl bg-white/5 border border-white/10 overflow-hidden relative group">
                                          <img src={vehicleDoc.imageUrl} alt="Veículo" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                      </div>
                                      <span className="text-white/70 text-xs font-semibold mt-2 uppercase tracking-widest text-center">{vehicleDoc.plate}</span>
                                  </div>
                              )}
                              {(driverDoc?.photoUrl) && (
                                  <div className="flex-1 flex flex-col items-center">
                                      <div className="w-full aspect-square rounded-2xl bg-white/5 border border-white/10 overflow-hidden relative group">
                                          <img src={driverDoc.photoUrl} alt="Motorista" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                      </div>
                                      <span className="text-white/70 text-xs font-semibold mt-2 uppercase tracking-widest text-center">{driverDoc.name.split(' ')[0]}</span>
                                  </div>
                              )}
                              {!vehicleDoc?.imageUrl && !driverDoc?.photoUrl && (
                                  <div className="w-full h-32 rounded-2xl border border-white/10 border-dashed flex items-center justify-center text-white/30 text-sm font-medium">
                                      Sem imagens associadas
                                  </div>
                              )}
                           </div>
                        );
                    })()}

                    <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="col-span-full mb-2">
                             <h4 className="text-white/90 font-semibold tracking-tight text-lg mb-4">Métricas</h4>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                 <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                     <span className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">Valor Total</span>
                                     <span className="text-lg font-bold text-white">R$ {Number(selectedRecord.totalValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                 </div>
                                 <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                     <span className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">Litros</span>
                                     <span className="text-lg font-bold text-white">{selectedRecord.liters} L</span>
                                 </div>
                                 <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                     <span className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">Odômetro</span>
                                     <span className="text-lg font-bold text-white font-mono">{selectedRecord.odometer}</span>
                                 </div>
                                 <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                     <span className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">Data</span>
                                     <span className="text-sm font-bold text-white">
                                        {selectedRecord.date?.toDate ? selectedRecord.date.toDate().toLocaleString('pt-BR') : '-'}
                                     </span>
                                 </div>
                             </div>
                        </div>
                    </div>
                </div>

                <div className="border-t border-white/10 pt-6">
                    <h4 className="text-white/90 font-semibold tracking-tight text-lg mb-4">Dados Brutos Importados ({selectedRecord.rawData ? Object.keys(selectedRecord.rawData).length : '0'} Colunas)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {selectedRecord.rawData && Object.entries(selectedRecord.rawData).map(([key, value]) => (
                            <div key={key} className="bg-surface-container-lowest/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors">
                                <span className="text-[10px] text-white/50 uppercase tracking-wider block mb-1 truncate" title={key}>{key}</span>
                                <span className="text-sm font-medium text-white/90 break-words">{String(value || '-')}</span>
                            </div>
                        ))}
                        {!selectedRecord.rawData && (
                            <div className="col-span-full text-white/50 text-sm">Nenhum dado bruto disponível para este registro. Reimporte o documento para salvar as colunas extras.</div>
                        )}
                    </div>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm p-6 mb-10" variants={itemVariants}>
        <h4 className="text-[18px] font-semibold text-primary mb-6">Histórico de Importações</h4>
        <div className="space-y-4">
            {importLogs.length === 0 && <p className="text-on-surface-variant">Nenhum histórico de importação.</p>}
            {importLogs.map(log => (
                <div key={log.id} className="flex justify-between items-center p-4 bg-white rounded-xl border border-outline-variant shadow-sm">
                    <div>
                        <p className="font-semibold text-on-surface">{log.fileName}</p>
                        <p className="text-xs text-on-surface-variant">{log.user} • {log.createdAt?.toDate?.()?.toLocaleString() || 'Data indisponível'} • {log.total} registros</p>
                    </div>
                    <button 
                        onClick={async () => {
                            if (!window.confirm('Tem certeza que deseja excluir esta importação e todos os registros associados?')) return;
                            setClearing(true);
                            try {
                                const q = query(collection(db, 'fuel_records'), where('importId', '==', log.id));
                                const snapshot = await getDocs(q);
                                const batch = writeBatch(db);
                                snapshot.forEach(doc => batch.delete(doc.ref));
                                batch.delete(doc(db, 'fuel_imports', log.id));
                                await batch.commit();
                            } catch (err) {
                                console.error(err);
                                alert('Erro ao apagar dados importados.');
                            } finally {
                                setClearing(false);
                            }
                        }}
                        disabled={clearing}
                        className="text-error hover:bg-error/10 p-2 rounded-lg transition-colors"
                    >
                        <span className="material-symbols-outlined">delete</span>
                    </button>
                </div>
            ))}
        </div>
      </motion.div>

    </motion.div>
  );
}

