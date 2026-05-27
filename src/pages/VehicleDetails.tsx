import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SearchableSelect } from '../components/SearchableSelect';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface VehicleDetailsProps {
  vehicle: any;
  assignedDrivers: any[];
  allDrivers: any[];
  works: any[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function VehicleDetails({ vehicle, assignedDrivers, allDrivers, works, onBack, onEdit, onDelete }: VehicleDetailsProps) {
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignment, setAssignment] = useState({ driverId: '', workId: '', workName: '' });

  const containerVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.4 } }
  };

  const handleConfirmAssignment = async () => {
    if (!assignment.driverId) return;
    try {
      const driver = allDrivers.find(d => d.id === assignment.driverId);
      if (!driver) return;

      const currentVehicles = Array.isArray(driver.vehicleAssigned) 
        ? driver.vehicleAssigned 
        : (driver.vehicleAssigned ? [driver.vehicleAssigned] : []);
      
      // Add current vehicle plate if not already there
      if (!currentVehicles.includes(vehicle.plate)) {
        currentVehicles.push(vehicle.plate);
      }

      await updateDoc(doc(db, 'drivers', assignment.driverId), {
        vehicleAssigned: currentVehicles,
        workId: assignment.workId || driver.workId || '',
        workName: assignment.workName || driver.workName || '',
        status: 'Em Rota',
        updatedAt: Date.now()
      });
      
      setIsAssignModalOpen(false);
      setAssignment({ driverId: '', workId: '', workName: '' });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'drivers');
    }
  };

  const handleRemoveDriver = async (driverId: string) => {
    if (!window.confirm('Deseja desvincular este motorista deste veículo?')) return;
    try {
      const driver = assignedDrivers.find(d => d.id === driverId);
      if (!driver) return;

      const currentVehicles = Array.isArray(driver.vehicleAssigned) 
        ? driver.vehicleAssigned.filter((p: string) => p !== vehicle.plate)
        : [];
      
      await updateDoc(doc(db, 'drivers', driverId), {
        vehicleAssigned: currentVehicles,
        status: currentVehicles.length === 0 ? 'Disponível' : driver.status,
        updatedAt: Date.now()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'drivers');
    }
  };

  return (
    <motion.div 
      className="max-w-[1440px] mx-auto pb-12"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <AnimatePresence>
        {isAssignModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsAssignModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-md flex flex-col"
            >
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low rounded-t-2xl">
                <h3 className="text-xl font-semibold text-on-surface">Atribuir Motorista</h3>
                <button onClick={() => setIsAssignModalOpen(false)} className="text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <SearchableSelect 
                  label="Motorista"
                  placeholder="Selecione um motorista..."
                  options={allDrivers
                    .filter(d => {
                      const vAssigned = d.vehicleAssigned;
                      const plates = Array.isArray(vAssigned) ? vAssigned : (vAssigned ? [vAssigned] : []);
                      return !plates.includes(vehicle.plate);
                    })
                    .map(d => ({ value: d.id, label: `${d.name} (${d.cpf})` }))}
                  value={assignment.driverId}
                  onChange={(val) => {
                    const driver = allDrivers.find(d => d.id === val);
                    setAssignment({ 
                      ...assignment, 
                      driverId: val,
                      workId: driver?.workId || '',
                      workName: driver?.workName || ''
                    });
                  }}
                />
                <SearchableSelect 
                  label="Obra (Opcional)"
                  placeholder="Nenhuma obra atribuída..."
                  options={works.map(w => ({ value: w.id, label: w.name }))}
                  value={assignment.workId}
                  onChange={(val) => {
                    const selectedWork = works.find(w => w.id === val);
                    setAssignment({ 
                      ...assignment, 
                      workId: val, 
                      workName: selectedWork ? selectedWork.name : '' 
                    });
                  }}
                />
                <div className="pt-4 flex gap-4">
                   <button onClick={() => setIsAssignModalOpen(false)} className="flex-1 px-4 py-2 border border-outline-variant rounded-lg font-semibold hover:bg-surface-container transition-colors text-sm">Cancelar</button>
                   <button 
                     onClick={handleConfirmAssignment} 
                     disabled={!assignment.driverId}
                     className="flex-1 px-4 py-2 bg-primary text-on-primary rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                   >
                     Confirmar
                   </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar Navigation */}
      <div className="flex justify-between items-center mb-6">
        <nav className="flex items-center gap-2 text-on-surface-variant text-sm font-semibold">
          <button onClick={onBack} className="hover:text-primary flex items-center gap-1">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Frota
          </button>
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          <span className="text-on-surface">Detalhes do Veículo: {vehicle.plate}</span>
        </nav>
        <div className="flex gap-2">
          <button 
            onClick={onDelete} 
            className="flex items-center gap-2 px-4 py-2 bg-error text-white font-semibold rounded-lg hover:bg-error/90 transition-colors shadow-sm text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
            Excluir
          </button>
          <button 
            onClick={onEdit} 
            className="flex items-center gap-2 px-4 py-2 border border-outline-variant bg-white text-on-surface font-semibold rounded-lg hover:bg-surface-container transition-colors shadow-sm text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            Editar Veículo
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        <div className="col-span-12 lg:col-span-8 h-[400px] rounded-2xl overflow-hidden relative shadow-sm border border-outline-variant group">
          <img 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
            src={vehicle.imageUrl || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=1200"} 
            alt={vehicle.model} 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/20 to-transparent"></div>
          <div className="absolute bottom-8 left-8 text-on-primary">
            <div className="flex items-center gap-3 mb-4">
              <span className={`px-3 py-1 rounded font-bold text-[10px] uppercase tracking-wider ${vehicle.status === 'Ativo' ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-error-container text-on-error-container'}`}>
                {vehicle.status}
              </span>
              <span className="px-3 py-1 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded font-bold text-[10px] tracking-wider">
                RENAVAM: {vehicle.renavam}
              </span>
            </div>
            <h2 className="text-[48px] font-bold leading-none mb-2">{vehicle.plate}</h2>
            <p className="text-lg opacity-90 font-medium">{vehicle.brand} {vehicle.model} • {vehicle.bodywork}</p>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          {/* Status Alert */}
          <div className={`p-6 rounded-2xl border-l-4 flex items-start gap-4 flex-1 shadow-sm ${vehicle.exerciceStatus === 'Vencido' ? 'bg-error-container/20 border-error' : 'bg-surface-container border-primary'}`}>
            <div className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 ${vehicle.exerciceStatus === 'Vencido' ? 'bg-error-container' : 'bg-primary-container'}`}>
              <span className={`material-symbols-outlined ${vehicle.exerciceStatus === 'Vencido' ? 'text-error' : 'text-primary-fixed'}`}>
                {vehicle.exerciceStatus === 'Vencido' ? 'warning' : 'verified'}
              </span>
            </div>
            <div>
              <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Status Documentação</h3>
              <p className="text-[20px] font-bold mb-1">Exercício {vehicle.exerciceYear}</p>
              <p className={`text-sm font-medium ${vehicle.exerciceStatus === 'Vencido' ? 'text-error' : 'text-on-surface-variant'}`}>
                {vehicle.exerciceStatus === 'Vencido' ? 'O licenciamento deste veículo está atrasado.' : 'Documentação em dia e verificada.'}
              </p>
              {vehicle.exerciceStatus === 'Vencido' && (
                <button className="mt-4 text-primary font-bold text-sm flex items-center gap-2 hover:translate-x-1 transition-transform">
                  Emitir Guia <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              )}
            </div>
          </div>

          {/* Odômetro */}
          <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm flex flex-col justify-between flex-1">
            <div>
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Status do Odômetro</h3>
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                  vehicle.lastSyncStatus === 'success' 
                    ? 'bg-success/5 text-success border-success/20' 
                    : vehicle.lastSyncStatus === 'warning'
                      ? 'bg-warning/5 text-warning border-warning/20'
                      : vehicle.lastSyncStatus === 'failed'
                        ? 'bg-error/5 text-error border-error/20'
                        : 'bg-on-surface-variant/5 text-on-surface-variant border-on-surface-variant/20'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    vehicle.lastSyncStatus === 'success' ? 'bg-success' : vehicle.lastSyncStatus === 'warning' ? 'bg-warning' : vehicle.lastSyncStatus === 'failed' ? 'bg-error' : 'bg-on-surface-variant'
                  }`}></span>
                  {vehicle.lastSyncStatus === 'success' ? 'CONECTADO' : vehicle.lastSyncStatus === 'warning' ? 'ATENÇÃO' : vehicle.lastSyncStatus === 'failed' ? 'ERRO SYNC' : 'OFFLINE'}
                </div>
              </div>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-[48px] font-bold text-primary leading-none tracking-tight">{(vehicle.currentKM || vehicle.odometer || 0).toLocaleString()}</span>
                <span className="text-[20px] font-bold text-on-surface-variant">KM</span>
              </div>
              {vehicle.lastSyncCheck && (
                <div className="flex flex-col gap-1 mb-4">
                  <p className="text-[10px] text-on-surface-variant/80 font-bold uppercase flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">sync</span>
                    Última sincronização
                  </p>
                  <p className="text-xs font-bold text-primary">
                    {new Date(vehicle.lastSyncCheck || vehicle.lastKmUpdate || vehicle.updatedAt).toLocaleString('pt-BR')}
                  </p>
                  
                  {vehicle.lastTrackerUpdate && (
                    <div className="mt-2 p-2 bg-primary/5 rounded-lg border border-primary/10">
                      <p className="text-[9px] text-primary/70 font-bold uppercase flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">satellite_alt</span>
                        Último sinal do GPS (Tracker)
                      </p>
                      <p className="text-[11px] font-bold text-on-surface">
                        {vehicle.lastTrackerUpdate}
                      </p>
                    </div>
                  )}
                </div>
              )}
              <button 
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('MANUAL_KM_SYNC', { 
                    detail: { vehicleId: vehicle.id, plate: vehicle.plate } 
                  }));
                }}
                className="w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                Sincronizar Agora
              </button>
            </div>
            <div className="space-y-2 mt-4">
              <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: '85%' }}></div>
              </div>
              <div className="flex justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                <span>Último: {(vehicle.lastServiceKm || 0).toLocaleString()}</span>
                <span>Próximo: {(vehicle.nextServiceKm || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Specs Bento Grid */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col h-full">
          <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low/30 flex justify-between items-center">
            <h3 className="text-[10px] font-bold text-on-surface uppercase tracking-widest">Informações Técnicas</h3>
            <span className="material-symbols-outlined text-primary text-[20px]">precision_manufacturing</span>
          </div>
          <div className="p-6 divide-y divide-outline-variant/30 flex-1">
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Cor Predominante</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{vehicle.color}</span>
                <div className="w-4 h-4 rounded-full border border-outline-variant" style={{ backgroundColor: vehicle.color.toLowerCase().includes('bran') ? '#ffffff' : vehicle.color.toLowerCase().includes('pret') ? '#1f2937' : vehicle.color.toLowerCase().includes('verm') ? '#ef4444' : vehicle.color.toLowerCase().includes('prat') ? '#e5e7eb' : vehicle.color.toLowerCase().includes('cinz') ? '#9ca3af' : '#ccc' }}></div>
              </div>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Ano do Modelo</span>
              <span className="font-bold text-sm">{vehicle.modelYear}</span>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Combustível</span>
              <span className="font-bold text-sm">{vehicle.fuelType}</span>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Chassi</span>
              <span className="font-mono text-sm font-bold">{vehicle.chassis}</span>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Centro de Custo</span>
              <span className="font-bold text-sm">
                {(Array.isArray(vehicle.costCenter) ? vehicle.costCenter : [vehicle.costCenter])
                  .map(v => String(v || '').replace(/logística - região sul/gi, '').replace(/logístic a - região sul/gi, '').replace(/,? ?$/, '').trim())
                  .filter(Boolean)
                  .join(', ') || '-'}
              </span>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Lotação</span>
              <span className="font-bold text-sm">{vehicle.capacity || '-'}</span>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Peso Bruto Total (PBT)</span>
              <span className="font-bold text-sm">{vehicle.grossWeight || '-'}</span>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">CNPJ / CPF</span>
              <span className="font-bold text-sm">{vehicle.ownerCnpj || '-'}</span>
            </div>
            {vehicle.observation && (
              <div className="py-3.5 flex flex-col gap-2">
                <span className="text-on-surface-variant text-sm font-medium">Observação</span>
                <p className="font-medium text-sm text-on-surface bg-surface-container-low p-3 rounded-lg border border-outline-variant/30 leading-relaxed whitespace-pre-wrap">{vehicle.observation}</p>
              </div>
            )}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low/30 flex justify-between items-center">
            <h3 className="text-[10px] font-bold text-on-surface uppercase tracking-widest">Distribuição Mensal</h3>
            <span className="material-symbols-outlined text-primary text-[20px]">payments</span>
          </div>
          <div className="p-8 flex items-center gap-10">
            <div className="relative h-32 w-32 shrink-0">
               <svg className="h-full w-full transform -rotate-90">
                <circle className="text-surface-container-highest" cx="64" cy="64" fill="transparent" r="54" stroke="currentColor" strokeWidth="12"></circle>
                <circle className="text-primary" cx="64" cy="64" fill="transparent" r="54" stroke="currentColor" strokeDasharray="339" strokeDashoffset="100" strokeWidth="12"></circle>
                <circle className="text-on-tertiary-container" cx="64" cy="64" fill="transparent" r="54" stroke="currentColor" strokeDasharray="339" strokeDashoffset="240" strokeWidth="12"></circle>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase">Total</span>
                <span className="text-sm font-bold">R$ 1.2k</span>
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary"></div>
                  <span className="text-xs font-bold text-on-surface-variant">Combustível</span>
                </div>
                <span className="text-sm font-bold">55%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-on-tertiary-container"></div>
                  <span className="text-xs font-bold text-on-surface-variant">Manutenção</span>
                </div>
                <span className="text-sm font-bold">30%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-surface-container-highest"></div>
                  <span className="text-xs font-bold text-on-surface-variant">Outros</span>
                </div>
                <span className="text-sm font-bold">15%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-3 bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm flex flex-col items-center text-center">
          <div className="flex justify-between items-center w-full mb-4">
            <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Motoristas Atribuídos</h3>
            <button 
              onClick={() => setIsAssignModalOpen(true)}
              className="text-primary hover:bg-primary/10 p-1 rounded-full transition-colors"
              title="Atribuir Motorista"
            >
              <span className="material-symbols-outlined text-[20px]">person_add</span>
            </button>
          </div>
          <div className="w-full space-y-6 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
            {assignedDrivers && assignedDrivers.length > 0 ? (
              assignedDrivers.map((driver) => (
                <div key={driver.id} className="pb-4 border-b border-outline-variant/30 last:border-0 last:pb-0 relative group/driver">
                  <button 
                    onClick={() => handleRemoveDriver(driver.id)}
                    className="absolute top-0 right-0 p-1 text-on-surface-variant hover:text-error opacity-0 group-hover/driver:opacity-100 transition-opacity"
                    title="Remover Atribuição"
                  >
                    <span className="material-symbols-outlined text-[18px]">link_off</span>
                  </button>
                  <div className="h-20 w-20 rounded-full mx-auto overflow-hidden mb-3 border-2 border-primary-fixed p-1 bg-surface-container-low">
                    {driver.imageUrl ? (
                      <img src={driver.imageUrl} alt={driver.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <div className="h-full w-full rounded-full bg-secondary-container flex items-center justify-center font-bold text-primary text-xl">
                        {driver.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <h4 className="text-lg font-bold leading-tight mb-1">{driver.name}</h4>
                  <p className="text-[12px] text-on-surface-variant font-medium mb-1 truncate px-2">Cat. {driver.cnhCategory} • {driver.validUntil ? (new Date(driver.validUntil) < new Date() ? 'Vencida' : 'Válida') : 'Status N/A'}</p>
                  <p className="text-[11px] text-on-surface-variant font-medium mb-3">{driver.phone || 'Telefone N/A'}</p>
                  <div className="w-full bg-surface-container px-3 py-2 rounded-lg flex justify-between items-center">
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase">Status</span>
                    <span className="text-xs font-bold text-emerald-600">{driver.status}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2">person_off</span>
                <p className="text-sm font-medium text-on-surface-variant">Nenhum motorista atribuído</p>
                <button 
                  onClick={() => setIsAssignModalOpen(true)}
                  className="mt-4 text-xs font-bold text-primary hover:underline uppercase tracking-wider"
                >
                  Atribuir Agora
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
