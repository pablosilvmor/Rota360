import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { AddVehicle } from './AddVehicle';
import { VehicleDetails } from './VehicleDetails';
import { ConfirmModal } from '../components/ConfirmModal';
import { motion, AnimatePresence } from 'framer-motion';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { SearchableSelect } from '../components/SearchableSelect';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

export function Fleet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdding = searchParams.get('add') === 'true';
  const editingVehicleId = searchParams.get('editId');
  const selectedVehicleId = searchParams.get('vehicleId');

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [works, setWorks] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicleToDelete, setVehicleToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWork, setFilterWork] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const editingVehicle = vehicles.find(v => v.id === editingVehicleId) || null;
  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId) || null;
  const assignedDriver = drivers.find(d => d.vehicleAssigned === selectedVehicle?.plate) || null;

  useEffect(() => {
    // Listen to vehicles
    const qVehicles = query(collection(db, 'vehicles'), orderBy('createdAt', 'desc'));
    const unsubscribeVehicles = onSnapshot(qVehicles, (snapshot) => {
      const vehiclesData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setVehicles(vehiclesData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'vehicles');
      setLoading(false);
    });

    // Listen to works
    const qWorks = query(collection(db, 'works'), orderBy('name', 'asc'));
    const unsubscribeWorks = onSnapshot(qWorks, (snapshot) => {
      const worksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setWorks(worksData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'works');
    });

    // Listen to statuses
    const qStatuses = query(collection(db, 'statuses'), orderBy('name', 'asc'));
    const unsubscribeStatuses = onSnapshot(qStatuses, (snapshot) => {
      const statusesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStatuses(statusesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'statuses');
    });

    // Listen to drivers
    const qDrivers = query(collection(db, 'drivers'));
    const unsubscribeDrivers = onSnapshot(qDrivers, (snapshot) => {
      setDrivers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, error => {
      handleFirestoreError(error, OperationType.LIST, 'drivers');
    });

    return () => {
      unsubscribeVehicles();
      unsubscribeWorks();
      unsubscribeStatuses();
      unsubscribeDrivers();
    };
  }, []);

  const getAverageAge = () => {
    if (vehicles.length === 0) return '--';
    const currentYear = new Date().getFullYear();
    const totalAge = vehicles.reduce((acc, v) => {
      const year = v.modelYear ? parseInt(v.modelYear) : currentYear;
      return acc + (currentYear - year);
    }, 0);
    const avg = totalAge / vehicles.length;
    return avg.toFixed(1).replace('.', ',');
  };

  const confirmDelete = async () => {
    if (!vehicleToDelete) return;
    try {
      await deleteDoc(doc(db, 'vehicles', vehicleToDelete));
      setVehicleToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'vehicles');
    }
  };

  const handleDelete = (vehicleId: string) => {
    setVehicleToDelete(vehicleId);
  };

  const filteredVehicles = vehicles.filter(v => {
    const matchesSearch = searchTerm === '' || 
      (v.plate || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.brand || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.model || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.bodywork || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.observations || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesWork = filterWork === '' || filterWork === 'Todas as Obras' || v.work === filterWork;
    const matchesStatus = filterStatus === '' || filterStatus === 'Todos os Status' || v.status === filterStatus;

    return matchesSearch && matchesWork && matchesStatus;
  });

  if (isAdding || editingVehicle) {
    return <AddVehicle vehicleToEdit={editingVehicle} onCancel={() => setSearchParams({})} onSave={() => setSearchParams({})} />;
  }

  if (selectedVehicle) {
    return <VehicleDetails 
      vehicle={selectedVehicle} 
      assignedDriver={assignedDriver}
      onBack={() => setSearchParams({})} 
      onDelete={() => {
        handleDelete(selectedVehicle.id);
        setSearchParams({});
      }}
      onEdit={() => {
        setSearchParams({ editId: selectedVehicle.id });
      }} 
    />;
  }

  return (
    <motion.div 
      className="max-w-[1440px] mx-auto pb-10"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <ConfirmModal 
        isOpen={!!vehicleToDelete}
        title="Excluir veículo"
        message="Tem certeza que deseja excluir este veículo? Esta ação não pode ser desfeita."
        onConfirm={confirmDelete}
        onCancel={() => setVehicleToDelete(null)}
        confirmLabel="Excluir"
      />
      <motion.div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4" variants={itemVariants}>
        <div>
          <h2 className="text-[32px] font-semibold text-primary mb-2">Inventário da Frota</h2>
          <p className="text-base text-on-surface-variant">Supervisione e gerencie seus ativos operacionais com inteligência de precisão.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setSearchParams({ add: 'true' })} className="px-5 py-2.5 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-all active:scale-95 flex items-center gap-2 shadow-lg font-semibold text-sm">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Adicionar Veículo
          </button>
        </div>
      </motion.div>

      <motion.div className="bg-surface/70 backdrop-blur-md rounded-2xl p-6 mb-10 shadow-sm flex flex-wrap items-center gap-8 border border-outline-variant/50" variants={itemVariants}>
        <div className="flex-1 min-w-[250px]">
          <label className="block text-sm font-semibold text-on-surface-variant mb-2">Pesquisar</label>
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input
              type="text"
              placeholder="Placa, modelo, observações..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl pl-10 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all shadow-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full transition-colors"
                title="Limpar pesquisa"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <SearchableSelect 
            label="Obra"
            placeholder="Todas as Obras"
            options={[
              { value: '', label: 'Todas as Obras' },
              ...works.map(work => ({ value: work.name, label: work.name }))
            ]}
            value={filterWork}
            onChange={(val) => setFilterWork(val)}
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <SearchableSelect 
            label="Status"
            placeholder="Todos os Status"
            options={[
              { value: '', label: 'Todos os Status' },
              ...statuses.map(s => ({ value: s.name, label: s.name }))
            ]}
            value={filterStatus}
            onChange={(val) => setFilterStatus(val)}
          />
        </div>
        
        <div className="flex items-center gap-4 pt-6">
          {(searchTerm || filterWork || filterStatus) && (
            <button 
              onClick={() => { setSearchTerm(''); setFilterWork(''); setFilterStatus(''); }}
              className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors uppercase tracking-widest px-3 py-1.5 rounded-full hover:bg-surface-container-low"
            >
              LIMPAR FILTRO
              <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>
            </button>
          )}
          <div className="flex items-center gap-2">
            <button className="p-2 text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
              <span className="material-symbols-outlined">grid_view</span>
            </button>
            <button className="p-2 text-primary bg-secondary-container rounded-lg transition-colors">
              <span className="material-symbols-outlined">list</span>
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12" variants={containerVariants}>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <p className="font-semibold text-sm text-on-surface-variant mb-1 uppercase tracking-widest">Frota Total</p>
          <p className="font-bold text-[48px] text-primary leading-[1.2] tracking-[-0.02em]">{vehicles.length}</p>
        </motion.div>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <p className="font-semibold text-sm text-on-surface-variant mb-1 uppercase tracking-widest">Em Operação</p>
          <p className="font-bold text-[48px] text-primary leading-[1.2] tracking-[-0.02em]">{vehicles.filter(v => v.status === 'Ativo').length}</p>
        </motion.div>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <p className="font-semibold text-sm text-on-surface-variant mb-1 uppercase tracking-widest">Manutenção</p>
          <p className="font-bold text-[48px] text-error leading-[1.2] tracking-[-0.02em]">{vehicles.filter(v => v.status === 'Em Manutenção').length}</p>
        </motion.div>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <p className="font-semibold text-sm text-on-surface-variant mb-1 uppercase tracking-widest">Idade Média</p>
          <p className="font-bold text-[48px] text-primary leading-[1.2] tracking-[-0.02em]">{getAverageAge()} <span className="text-[24px]">anos</span></p>
        </motion.div>
      </motion.div>

      <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-8" variants={containerVariants}>
        {loading ? (
          <div className="col-span-full flex justify-center py-20">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
          </div>
        ) : filteredVehicles.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-surface-container-low rounded-2xl border-2 border-dashed border-outline-variant">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant mb-4">local_shipping</span>
            <p className="text-xl font-bold text-on-surface">Nenhum veículo encontrado</p>
            <p className="text-on-surface-variant mt-2">Tente ajustar seus filtros ou cadastre um novo veículo.</p>
            {!searchTerm && !filterWork && !filterStatus && (
              <button 
                onClick={() => setSearchParams({ add: 'true' })}
                className="mt-6 px-6 py-2 bg-primary text-on-primary rounded-lg font-bold"
              >
                Cadastrar Primeiro Veículo
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence>
            {filteredVehicles.map((vehicle, index) => (
              <motion.div 
                key={`card-${vehicle.id}`}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                variants={itemVariants} 
                onClick={() => setSearchParams({ vehicleId: vehicle.id })}
                className="bg-surface-container-lowest border border-outline-variant rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer"
              >
                <div className="relative h-56 overflow-hidden bg-white border-b border-outline-variant/30 flex items-center justify-center p-4">
                  <img 
                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110 drop-shadow-sm" 
                    src={vehicle.imageUrl || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800"} 
                    alt={vehicle.model} 
                  />
                  <div className="absolute top-4 right-4">
                    <span className={`bg-white/90 backdrop-blur-md px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider shadow-sm ${vehicle.status === 'Ativo' ? 'text-on-tertiary-container' : 'text-error'}`}>
                      {vehicle.status}
                    </span>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4 relative">
                    <div>
                      <h3 className="font-bold text-[28px] text-primary leading-none mb-1">{vehicle.plate}</h3>
                      <p className="text-sm text-on-surface-variant font-medium">{vehicle.brand} {vehicle.model}</p>
                      {vehicle.bodywork && <p className="text-xs text-on-surface-variant/80 uppercase font-bold tracking-wide mt-1">{vehicle.bodywork}</p>}
                      <div className="flex items-center gap-1 mt-2 text-on-surface-variant bg-surface-container w-fit px-2 py-0.5 rounded">
                         <span className="material-symbols-outlined text-[14px]">domain</span>
                         <span className="text-xs font-semibold">{vehicle.work || 'Não atribuída'}</span>
                      </div>
                    </div>
                    <div className="relative group/menu">
                      <button 
                        onClick={(e) => { e.stopPropagation(); }} 
                        className="p-2 hover:bg-surface-container rounded-full transition-colors text-on-surface-variant"
                      >
                        <span className="material-symbols-outlined">more_vert</span>
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-white border border-outline-variant rounded-lg shadow-lg py-2 w-32 z-30 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSearchParams({ editId: vehicle.id }); }} 
                          className="w-full text-left px-4 py-2 hover:bg-surface-container text-sm transition-colors"
                        >
                          Editar
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(vehicle.id); }} 
                          className="w-full text-left px-4 py-2 hover:bg-surface-container text-sm text-error transition-colors"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="h-px bg-outline-variant/30 mb-4" />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest mb-1">Odômetro Atual</p>
                      <p className="font-bold text-sm text-on-surface">{(vehicle.currentKM || vehicle.odometer || 0).toLocaleString()} KM</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest mb-1">Próximo Serviço</p>
                      <p className="font-bold text-sm text-on-surface">{(vehicle.nextServiceKm || 0).toLocaleString()} KM</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </motion.div>

      {vehicles.length > 0 && (
        <motion.div className="mt-16 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden" variants={itemVariants}>
          <div className="p-6 border-b border-outline-variant bg-surface-container-low">
            <h4 className="text-sm font-semibold text-on-surface uppercase tracking-widest">Inventário de Veículos</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/50 border-b border-outline-variant">
                  <th className="px-6 py-4 text-sm font-semibold text-on-surface-variant">PLACA</th>
                  <th className="px-6 py-4 text-sm font-semibold text-on-surface-variant">MODELO</th>
                  <th className="px-6 py-4 text-sm font-semibold text-on-surface-variant">ESPÉCIE / TIPO</th>
                  <th className="px-6 py-4 text-sm font-semibold text-on-surface-variant">OBRA</th>
                  <th className="px-6 py-4 text-sm font-semibold text-on-surface-variant text-right">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {filteredVehicles.map((vehicle) => (
                  <tr key={`table-${vehicle.id}`} className="hover:bg-surface-container transition-colors group">
                    <td className="px-6 py-4"><span className="text-sm font-semibold text-primary">{vehicle.plate}</span></td>
                    <td className="px-6 py-4 text-sm font-medium">{vehicle.brand} {vehicle.model}</td>
                    <td className="px-6 py-4 text-sm uppercase">{vehicle.bodywork || '-'}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-1 text-on-surface-variant bg-surface-container w-fit px-2 py-0.5 rounded">
                        <span className="material-symbols-outlined text-[14px]">domain</span>
                        <span className="text-xs font-semibold">{vehicle.work || 'Não atribuída'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={(e) => { e.stopPropagation(); setSearchParams({ vehicleId: vehicle.id }); }} className="text-on-surface-variant hover:text-primary transition-colors">
                        <span className="material-symbols-outlined">visibility</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
