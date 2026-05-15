import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, addDoc, updateDoc } from 'firebase/firestore';

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

export function Drivers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isAssignVehicleOpen = searchParams.get('assign') === 'true';
  const isAddDriverOpen = searchParams.get('add') === 'true';
  const editingDriverId = searchParams.get('editId');

  const [drivers, setDrivers] = useState<any[]>([]);
  const [works, setWorks] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState({ driverId: '', vehiclePlate: '', workId: '', workName: '' });
  const [newDriver, setNewDriver] = useState({ name: '', cpf: '', cnh: '', cnhCategory: 'A', validUntil: '' });
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  const editingDriver = drivers.find(d => d.id === editingDriverId) || null;

  useEffect(() => {
    if (editingDriver) {
      setNewDriver({
        name: editingDriver.name || '',
        cpf: editingDriver.cpf || '',
        cnh: editingDriver.cnh || '',
        cnhCategory: editingDriver.cnhCategory || 'A',
        validUntil: editingDriver.validUntil || ''
      });
    } else {
      setNewDriver({ name: '', cpf: '', cnh: '', cnhCategory: 'A', validUntil: '' });
    }
  }, [editingDriver]);

  const stats = {
    total: drivers.length,
    activeShifts: drivers.filter(d => d.status === 'Em Rota').length,
    averageRating: drivers.length > 0 
      ? (drivers.reduce((acc, d) => acc + (parseFloat(d.rating) || 0), 0) / drivers.length).toFixed(1) 
      : '0.0',
    expiringCnh: drivers.filter(d => {
      if (!d.validUntil) return false;
      const expiry = new Date(d.validUntil);
      const today = new Date();
      const diffTime = expiry.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 30 && diffDays > 0;
    }).length
  };

  useEffect(() => {
    const qDrivers = query(collection(db, 'drivers'));
    const unsubscribeDrivers = onSnapshot(qDrivers, (snapshot) => {
      setDrivers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, error => {
      handleFirestoreError(error, OperationType.LIST, 'drivers');
    });

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

    return () => {
      unsubscribeDrivers();
      unsubscribeWorks();
      unsubscribeVehicles();
    };
  }, []);

  const handleConfirmAssignment = async () => {
    if (!assignment.driverId || !assignment.vehiclePlate) return;
    try {
      const driverRef = doc(db, 'drivers', assignment.driverId);
      await updateDoc(driverRef, {
        vehicleAssigned: assignment.vehiclePlate,
        workId: assignment.workId || '',
        workName: assignment.workName || '',
        status: 'Em Rota',
        updatedAt: Date.now()
      });
      setSearchParams({});
      setAssignment({ driverId: '', vehiclePlate: '', workId: '', workName: '' });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'drivers');
    }
  };

  const handleSaveDriver = async () => {
    if(!newDriver.name || !newDriver.cpf) return;
    try {
      if (editingDriverId) {
        const driverRef = doc(db, 'drivers', editingDriverId);
        const { id, createdAt, ...rest } = editingDriver;
        await updateDoc(driverRef, {
          ...rest,
          ...newDriver,
          updatedAt: Date.now()
        });
      } else {
        await addDoc(collection(db, 'drivers'), {
          ...newDriver,
          status: 'Disponível',
          vehicleAssigned: '',
          rating: 5.0,
          createdAt: Date.now()
        });
      }
      setSearchParams({});
      setNewDriver({ name: '', cpf: '', cnh: '', cnhCategory: 'A', validUntil: '' });
    } catch(e) {
      handleFirestoreError(e, editingDriverId ? OperationType.UPDATE : OperationType.CREATE, 'drivers');
    }
  };

  const handleSort = (key: string) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedDrivers = [...drivers].sort((a, b) => {
    const valA = a[sortConfig.key] || '';
    const valB = b[sortConfig.key] || '';
    
    if (typeof valA === 'string') {
      return sortConfig.direction === 'asc' 
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    }
    
    return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
  });

  const availableVehicles = vehicles.filter(v => !drivers.some(d => d.vehicleAssigned === v.plate));

  const SortButton = ({ column, label }: { column: string, label: string }) => (
    <th 
      className="px-6 py-4 uppercase tracking-wider cursor-pointer hover:bg-surface-container transition-colors group"
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className={`material-symbols-outlined text-[16px] transition-all ${sortConfig.key === column ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-50'}`}>
          {sortConfig.key === column && sortConfig.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}
        </span>
      </div>
    </th>
  );

  return (
    <motion.div 
      className="max-w-[1440px] mx-auto pb-10 relative"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <AnimatePresence>
        {isAssignVehicleOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setSearchParams({})}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                <h3 className="text-xl font-semibold text-on-surface">Atribuir Veículo</h3>
                <button onClick={() => setSearchParams({})} className="text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">Motorista</label>
                  <select 
                    className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary"
                    value={assignment.driverId}
                    onChange={(e) => setAssignment({ ...assignment, driverId: e.target.value })}
                  >
                    <option value="">Selecione um motorista...</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>{driver.name} ({driver.cpf})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">Veículo Disponível</label>
                  <select 
                    className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary"
                    value={assignment.vehiclePlate}
                    onChange={(e) => setAssignment({ ...assignment, vehiclePlate: e.target.value })}
                  >
                    <option value="">Selecione um veículo...</option>
                    {availableVehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.plate}>{vehicle.plate} - {vehicle.model}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">Obra (Opcional)</label>
                  <select 
                    className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary"
                    value={assignment.workId}
                    onChange={(e) => {
                      const selectedWork = works.find(w => w.id === e.target.value);
                      setAssignment({ 
                        ...assignment, 
                        workId: e.target.value, 
                        workName: selectedWork ? selectedWork.name : '' 
                      });
                    }}
                  >
                    <option value="">Nenhuma obra atribuída...</option>
                    {works.map((work) => (
                      <option key={work.id} value={work.id}>{work.name}</option>
                    ))}
                  </select>
                </div>
                <div className="pt-4 flex gap-4">
                   <button onClick={() => setSearchParams({})} className="flex-1 px-4 py-2 border border-outline-variant rounded-lg font-semibold hover:bg-surface-container transition-colors">Cancelar</button>
                   <button 
                     onClick={handleConfirmAssignment} 
                     disabled={!assignment.driverId || !assignment.vehiclePlate}
                     className="flex-1 px-4 py-2 bg-primary text-on-primary rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     Confirmar Atribuição
                   </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {(isAddDriverOpen || editingDriverId) && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setSearchParams({})}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                <h3 className="text-xl font-semibold text-on-surface">{editingDriverId ? 'Editar Motorista' : 'Adicionar Novo Motorista'}</h3>
                <button onClick={() => setSearchParams({})} className="text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                   <div className="col-span-2">
                     <label className="block text-sm font-semibold text-on-surface-variant mb-2">Nome Completo</label>
                     <input type="text" value={newDriver.name} onChange={e => setNewDriver({...newDriver, name: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" placeholder="Digite o nome..." />
                   </div>
                   <div className="col-span-1">
                     <label className="block text-sm font-semibold text-on-surface-variant mb-2">CPF</label>
                     <input type="text" value={newDriver.cpf} onChange={e => setNewDriver({...newDriver, cpf: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" placeholder="000.000.000-00" />
                   </div>
                   <div className="col-span-1">
                     <label className="block text-sm font-semibold text-on-surface-variant mb-2">Nº CNH</label>
                     <input type="text" value={newDriver.cnh} onChange={e => setNewDriver({...newDriver, cnh: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" placeholder="Número do registro" />
                   </div>
                   <div className="col-span-1">
                     <label className="block text-sm font-semibold text-on-surface-variant mb-2">Categoria CNH</label>
                     <select value={newDriver.cnhCategory} onChange={e => setNewDriver({...newDriver, cnhCategory: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary">
                        <option>A</option>
                        <option>B</option>
                        <option>C</option>
                        <option>D</option>
                        <option>E</option>
                        <option>AB</option>
                        <option>AC</option>
                        <option>AD</option>
                        <option>AE</option>
                     </select>
                   </div>
                   <div className="col-span-1">
                     <label className="block text-sm font-semibold text-on-surface-variant mb-2">Validade CNH</label>
                     <input 
                       type="date" 
                       value={newDriver.validUntil} 
                       onChange={e => setNewDriver({...newDriver, validUntil: e.target.value})} 
                       onPaste={(e) => {
                         const pastedText = e.clipboardData.getData('text');
                         const dateMatch = pastedText.match(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/);
                         if (dateMatch) {
                           e.preventDefault();
                           setNewDriver({...newDriver, validUntil: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`});
                         }
                       }}
                       className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" 
                     />
                   </div>
                </div>
                <div className="pt-4 flex gap-4">
                   <button onClick={() => setSearchParams({})} className="flex-1 px-4 py-2 border border-outline-variant rounded-lg font-semibold hover:bg-surface-container transition-colors">Cancelar</button>
                   <button onClick={handleSaveDriver} className="flex-1 px-4 py-2 bg-primary text-on-primary rounded-lg font-semibold hover:bg-primary/90 transition-colors">{editingDriverId ? 'Salvar Alterações' : 'Cadastrar Motorista'}</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4" variants={itemVariants}>
        <div>
          <h2 className="text-[32px] font-semibold text-on-surface">Gestão de Motoristas</h2>
          <p className="text-on-surface-variant text-base">Monitore o desempenho e gerencie atribuições em toda a sua frota.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSearchParams({ assign: 'true' })}
            className="flex items-center gap-2 px-6 py-2.5 border border-outline-variant rounded-lg text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">link</span>
            Atribuir Veículo
          </button>
          <button 
            onClick={() => setSearchParams({ add: 'true' })}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:opacity-90 shadow-md active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">person_add</span>
            Adicionar Novo Motorista
          </button>
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10" variants={containerVariants}>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm flex flex-col justify-between h-32 hover:-translate-y-1 transition-transform duration-300">
          <span className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Total de Motoristas</span>
          <div className="flex items-end justify-between">
            <span className="text-[32px] font-bold">{stats.total}</span>
            <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded text-xs font-bold">+4%</span>
          </div>
        </motion.div>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm flex flex-col justify-between h-32 hover:-translate-y-1 transition-transform duration-300">
          <span className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Turnos Ativos</span>
          <div className="flex items-end justify-between">
            <span className="text-[32px] font-bold">{stats.activeShifts}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mb-2"></span>
          </div>
        </motion.div>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm flex flex-col justify-between h-32 hover:-translate-y-1 transition-transform duration-300">
          <span className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Nota Média</span>
          <div className="flex items-end justify-between">
            <span className="text-[32px] font-bold">{stats.averageRating}</span>
            <div className="flex gap-0.5 text-amber-500 mb-2">
              <span className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: "'FILL' 1"}}>star</span>
            </div>
          </div>
        </motion.div>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm flex flex-col justify-between h-32 hover:-translate-y-1 transition-transform duration-300">
          <span className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">CNHs a Vencer</span>
          <div className="flex items-end justify-between">
            <span className="text-[32px] font-bold text-error">{stats.expiringCnh}</span>
            <span className="material-symbols-outlined text-error mb-2">warning</span>
          </div>
        </motion.div>
      </motion.div>
      
      <motion.div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden mb-10" variants={itemVariants}>
        <div className="px-6 py-4 border-b border-outline-variant flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-on-surface-variant text-[12px] font-semibold">Disponibilidade:</span>
              <select className="bg-surface-container-low border border-outline-variant rounded px-3 py-1 text-[13px] focus:ring-0">
                <option>Todos os Motoristas</option>
                <option>Disponível</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-on-surface-variant text-[12px] font-semibold">Unidade:</span>
              <select className="bg-surface-container-low border border-outline-variant rounded px-3 py-1 text-[13px] focus:ring-0">
                <option>Todas as Regiões</option>
                {works.map((work) => (
                  <option key={work.id} value={work.name}>{work.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant text-sm font-semibold">
                <SortButton column="name" label="Perfil do Motorista" />
                <SortButton column="vehicleAssigned" label="Placa do Veículo" />
                <SortButton column="cnhCategory" label="Status da CNH" />
                <SortButton column="rating" label="Desempenho" />
                <SortButton column="status" label="Status" />
                <th className="px-6 py-4 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {sortedDrivers.map(driver => (
                <tr key={driver.id} className="hover:bg-surface-container transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-secondary-container border border-outline-variant flex items-center justify-center font-bold text-primary">
                        {driver.name ? driver.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div>
                        <p className="text-base text-on-surface font-semibold">{driver.name}</p>
                        <p className="text-[12px] text-on-surface-variant">CPF: {driver.cpf}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono bg-on-primary-fixed-variant/5 px-2 py-1 rounded text-on-surface border border-outline-variant/50">{driver.vehicleAssigned || 'Não Atribuído'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-500 text-[18px]">check_circle</span>
                      <span className="text-base">Cat. {driver.cnhCategory}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-surface-container-high rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${(driver.rating / 5) * 100}%` }}></div>
                      </div>
                      <span className="font-bold text-sm">{driver.rating}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[12px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                      {driver.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => setSearchParams({ editId: driver.id })}
                        className="text-on-surface-variant hover:text-primary transition-colors p-1.5 hover:bg-primary/10 rounded-lg"
                        title="Editar Motorista"
                      >
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                      <button 
                        onClick={async () => await deleteDoc(doc(db, 'drivers', driver.id))} 
                        className="text-error hover:text-error/80 transition-colors p-1.5 hover:bg-error/10 rounded-lg"
                        title="Excluir Motorista"
                      >
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {drivers.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-on-surface-variant">
                    Nenhum motorista cadastrado.
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
