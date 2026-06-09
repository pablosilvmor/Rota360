import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, where, writeBatch, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { SearchableSelect } from '../components/SearchableSelect';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { PrivateValue } from '../contexts/PrivacyContext';
import * as xlsx from 'xlsx';

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
  const [filterWork, setFilterWork] = useLocalStorageState('fuel_filterWork', 'Todas as Obras');
  
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const qWorks = query(collection(db, 'works'), orderBy('name', 'asc'));
    const unsubscribeWorks = onSnapshot(qWorks, (snapshot) => {
      setWorks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'works');
    });

    const qFuel = query(collection(db, 'fuel_records'), orderBy('date', 'desc'));
    const unsubscribeFuel = onSnapshot(qFuel, (snapshot) => {
      setFuelRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'fuel_records');
    });

    return () => {
      unsubscribeWorks();
      unsubscribeFuel();
    };
  }, []);



  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = xlsx.read(data);
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
          importMode: 'excel'
        });
        existingTransIds.add(transactionId);
      }
      
      const totalToImport = batchList.length;
      setImportProgress({ current: 0, total: totalToImport });

      const chunkSize = 400;
      for (let i = 0; i < batchList.length; i += chunkSize) {
        const chunk = batchList.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const item of chunk) {
          batch.set(doc(collection(db, 'fuel_records')), item);
        }
        await batch.commit();
        imported += chunk.length;
        setImportProgress({ current: imported, total: totalToImport });
      }
      
      setImportProgress({ current: totalToImport, total: totalToImport });
      setTimeout(() => alert(`Importação concluída: ${imported} registros novos.\n(Ignorados: ${duplicates} duplicados)`), 100);
      
    } catch (err) {
      console.error(err);
      alert('Erro ao importar arquivo Excel. Verifique se o formato está correto.');
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

  const filteredRecords = filterWork === 'Todas as Obras' 
    ? fuelRecords 
    : fuelRecords.filter(r => r.workName === filterWork);

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

      <motion.div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4" variants={itemVariants}>
        <div>
          <h2 className="text-[32px] font-semibold text-primary leading-[1.3] tracking-[-0.01em]">Gestão de Combustível</h2>
          <p className="text-base text-on-surface-variant mt-2">Monitore os abastecimentos e custos importados da frota.</p>
          {fuelRecords.length > 0 && (
            <p className="text-xs text-on-surface-variant font-medium mt-1">
              Período dos dados: <strong className="text-primary">{firstDateStr}</strong> a <strong className="text-primary">{lastDateStr}</strong>
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">Filtrar por Obra</label>
            <select 
              value={filterWork}
              onChange={(e) => setFilterWork(e.target.value)}
              className="bg-surface border border-outline-variant rounded-lg px-4 py-2 text-sm font-semibold outline-none focus:border-primary transition-colors"
            >
              <option>Todas as Obras</option>
              {works.map((work) => (
                <option key={work.id} value={work.name}>{work.name}</option>
              ))}
            </select>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            accept=".xlsx,.xls" 
            className="hidden" 
            onChange={handleFileInput}
          />
          <button 
            onClick={() => setShowClearConfirm(true)}
            className="self-end px-4 py-2 border border-error/50 text-error rounded-lg font-semibold hover:bg-error/10 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
            Limpar Dados
          </button>
          <div className="relative flex flex-col items-end">
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="self-end px-4 py-2 bg-primary text-on-primary rounded-lg font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {importing ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span>
                  Importando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">upload_file</span>
                  Importar Excel
                </>
              )}
            </button>
            {importing && importProgress.total > 0 && (
              <div className="absolute top-[110%] w-full">
                <div className="flex justify-between text-[10px] font-bold text-primary mb-1">
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
        </div>
      </motion.div>

      <AnimatePresence>
        {showClearConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm text-center">
              <span className="material-symbols-outlined text-[48px] text-error mb-4">warning</span>
              <h3 className="text-xl font-bold text-on-surface mb-2">Excluir Dados</h3>
              <p className="text-sm text-on-surface-variant mb-6">Tem certeza que deseja apagar todos os dados importados? Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-2.5 border border-outline-variant rounded-xl font-bold text-on-surface hover:bg-surface-container"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleClearData}
                  disabled={clearing}
                  className="flex-1 py-2.5 bg-error text-white rounded-xl font-bold hover:bg-error/90 disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {clearing ? <span className="material-symbols-outlined animate-spin text-[18px]">autorenew</span> : null}
                  Confirmar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10" variants={containerVariants}>
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

      <motion.div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden mb-10" variants={itemVariants}>
        <div className="p-6 border-b border-outline-variant bg-white flex justify-between items-center">
          <h4 className="text-[18px] font-semibold text-primary">Histórico de Abastecimentos</h4>
          <button className="text-sm font-semibold text-primary hover:underline">Ver Relatório Completo</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
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
                <th className="p-0">
                  <button onClick={() => handleSort('station')} className="w-full px-6 py-4 text-left text-xs font-semibold text-on-surface-variant uppercase flex items-center gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer">
                    Posto / Local <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">{getSortIcon('station')}</span>
                  </button>
                </th>
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
                <tr key={item.id} className="hover:bg-surface-container transition-colors group">
                  <td className="px-6 py-4">
                    <span className="font-semibold text-sm">
                      {item.date?.toDate ? item.date.toDate().toLocaleString('pt-BR') : 'Processando...'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-primary">{item.vehicleModel || 'N/A'}</span>
                      <span className="font-mono text-xs text-on-surface-variant"><PrivateValue value={item.vehiclePlate} /></span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium">{item.station || 'Não informado'}</span>
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex flex-col">
                      <span className="font-bold text-sm text-on-surface">{item.liters} L</span>
                      <span className="text-xs text-on-surface-variant">{item.fuelType || 'Não informado'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-sm text-on-surface">
                      R$ <PrivateValue value={item.totalValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
                    </span>
                  </td>
                </tr>
              ))}
              {sortedRecords.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-on-surface-variant font-medium">
                    Nenhum registro de abastecimento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>


    </motion.div>
  );
}

