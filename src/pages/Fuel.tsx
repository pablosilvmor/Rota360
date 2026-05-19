import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { SearchableSelect } from '../components/SearchableSelect';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export function Fuel() {
  const [works, setWorks] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [fuelRecords, setFuelRecords] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterWork, setFilterWork] = useLocalStorageState('fuel_filterWork', 'Todas as Obras');

  const [formData, setFormData] = useState({
    vehicleId: '',
    workId: '',
    station: '',
    fuelType: 'Diesel S10',
    liters: '',
    totalValue: '',
    odometer: '',
    card: ''
  });

  useEffect(() => {
    const qWorks = query(collection(db, 'works'), orderBy('name', 'asc'));
    const unsubscribeWorks = onSnapshot(qWorks, (snapshot) => {
      setWorks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'works');
    });

    const qVehicles = query(collection(db, 'vehicles'), orderBy('plate', 'asc'));
    const unsubscribeVehicles = onSnapshot(qVehicles, (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'vehicles');
    });

    const qFuel = query(collection(db, 'fuel_records'), orderBy('date', 'desc'));
    const unsubscribeFuel = onSnapshot(qFuel, (snapshot) => {
      setFuelRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'fuel_records');
    });

    return () => {
      unsubscribeWorks();
      unsubscribeVehicles();
      unsubscribeFuel();
    };
  }, []);

  const handleSaveFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.vehicleId || !formData.liters || !formData.totalValue) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    setLoading(true);
    try {
      const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId);
      const selectedWork = works.find(w => w.id === formData.workId);

      await addDoc(collection(db, 'fuel_records'), {
        ...formData,
        vehiclePlate: selectedVehicle?.plate || '',
        vehicleModel: selectedVehicle?.model || '',
        workName: selectedWork?.name || 'Não informada',
        liters: parseFloat(formData.liters),
        totalValue: parseFloat(formData.totalValue),
        odometer: parseFloat(formData.odometer) || 0,
        date: serverTimestamp(),
        createdAt: serverTimestamp()
      });

      setIsModalOpen(false);
      setFormData({
        vehicleId: '',
        workId: '',
        station: '',
        fuelType: 'Diesel S10',
        liters: '',
        totalValue: '',
        odometer: '',
        card: ''
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'fuel_records');
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = filterWork === 'Todas as Obras' 
    ? fuelRecords 
    : fuelRecords.filter(r => r.workName === filterWork);

  const totalCost = filteredRecords.reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
  const totalLiters = filteredRecords.reduce((acc, curr) => acc + (curr.liters || 0), 0);

  return (
    <motion.div 
      className="pb-12"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <motion.div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4" variants={itemVariants}>
        <div>
          <h2 className="text-[32px] font-semibold text-primary leading-[1.3] tracking-[-0.01em]">Gestão de Combustível</h2>
          <p className="text-base text-on-surface-variant mt-2">Monitore os abastecimentos, custos com combustível e gerencie os cartões da frota.</p>
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
          <button className="self-end px-4 py-2 border border-outline-variant rounded-lg font-semibold hover:bg-surface-container transition-colors">
            Gerenciar Cartões
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="self-end bg-primary text-on-primary px-4 py-2 rounded-lg font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Registrar Abastecimento
          </button>
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10" variants={containerVariants}>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-secondary-container text-on-secondary-container rounded-lg">
               <span className="material-symbols-outlined">payments</span>
            </div>
            <span className="bg-surface-container px-2 py-1 rounded text-xs font-bold text-on-surface-variant">Filtrado</span>
          </div>
          <p className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Custo Total</p>
          <h3 className="text-[36px] font-bold text-primary mt-1 leading-[1.2] tracking-[-0.02em]">R$ {totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
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
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase">Data</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase">Veículo</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase">Posto / Local</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase">Quantidade</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase">Valor Total</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase text-right">Cartão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {filteredRecords.map((item) => (
                <tr key={item.id} className="hover:bg-surface-container transition-colors group">
                  <td className="px-6 py-4">
                    <span className="font-semibold text-sm">
                      {item.date?.toDate ? item.date.toDate().toLocaleString('pt-BR') : 'Processando...'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-primary">{item.vehicleModel}</span>
                      <span className="font-mono text-xs text-on-surface-variant">{item.vehiclePlate}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm">{item.station || 'Não informado'}</span>
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex flex-col">
                      <span className="font-bold text-sm">{item.liters}L</span>
                      <span className="text-xs text-on-surface-variant">{item.fuelType}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-sm">
                      R$ {item.totalValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-high text-xs font-mono">
                      <span className="material-symbols-outlined text-[14px]">credit_card</span>
                      **** {item.card || 'XXXX'}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant">
                    Nenhum registro de abastecimento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
                <h3 className="text-xl font-bold text-primary">Registrar Abastecimento</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-on-surface-variant hover:text-error">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              <form onSubmit={handleSaveFuel} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-1">
                    <SearchableSelect 
                      label="Veículo *"
                      placeholder="Selecione..."
                      options={vehicles.map(v => ({ value: v.id, label: `${v.plate} - ${v.model}` }))}
                      value={formData.vehicleId}
                      onChange={val => setFormData({...formData, vehicleId: val})}
                    />
                  </div>
                  <div className="col-span-1">
                    <SearchableSelect 
                      label="Obra"
                      placeholder="Selecione..."
                      options={works.map(w => ({ value: w.id, label: w.name }))}
                      value={formData.workId}
                      onChange={val => setFormData({...formData, workId: val})}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-1">Posto / Estabelecimento</label>
                    <input 
                      type="text" 
                      value={formData.station}
                      onChange={e => setFormData({...formData, station: e.target.value})}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-sm focus:border-primary outline-none"
                      placeholder="Ex: Posto BR Rodoanel"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-1">Tipo de Combustível</label>
                    <select 
                      value={formData.fuelType}
                      onChange={e => setFormData({...formData, fuelType: e.target.value})}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-sm focus:border-primary outline-none"
                    >
                      <option value="Diesel S10">Diesel S10</option>
                      <option value="Diesel S500">Diesel S500</option>
                      <option value="Gasolina Comum">Gasolina Comum</option>
                      <option value="Gasolina Aditivada">Gasolina Aditivada</option>
                      <option value="Etanol">Etanol</option>
                      <option value="Arla 32">Arla 32</option>
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-1">Cartão (Final)</label>
                    <input 
                      type="text" 
                      maxLength={4}
                      value={formData.card}
                      onChange={e => setFormData({...formData, card: e.target.value})}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-sm focus:border-primary outline-none"
                      placeholder="Ex: 4521"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-1">Quantidade (Litros) *</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={formData.liters}
                      onChange={e => setFormData({...formData, liters: e.target.value})}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-sm focus:border-primary outline-none font-bold"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-1">Valor Total (R$) *</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={formData.totalValue}
                      onChange={e => setFormData({...formData, totalValue: e.target.value})}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-sm focus:border-primary outline-none font-bold"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-1">Odômetro Atual</label>
                    <input 
                      type="number" 
                      value={formData.odometer}
                      onChange={e => setFormData({...formData, odometer: e.target.value})}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-sm focus:border-primary outline-none font-mono"
                      placeholder="KM atual"
                    />
                  </div>
                </div>
                
                <div className="pt-4 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-3 border border-outline-variant rounded-xl font-bold hover:bg-surface-container transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary/90 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {loading ? <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> : <span className="material-symbols-outlined text-[20px]">save</span>}
                    {loading ? 'Salvando...' : 'Salvar Registro'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

