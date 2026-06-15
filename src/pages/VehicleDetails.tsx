import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SearchableSelect } from '../components/SearchableSelect';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { PrivateValue, usePrivacy } from '../contexts/PrivacyContext';

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
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  const { isPrivacyMode } = usePrivacy();
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
              className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-white/10 rounded-2xl shadow-xl w-full max-w-md flex flex-col"
            >
              <div className="p-6 border-b border-outline-variant dark:border-white/10 flex justify-between items-center bg-surface-container-low dark:bg-surface-container-high rounded-t-2xl">
                <h3 className="text-xl font-semibold text-on-surface">Atribuir Motorista</h3>
                <button onClick={() => setIsAssignModalOpen(false)} className="text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4 dark:bg-surface-container">
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
                   <button onClick={() => setIsAssignModalOpen(false)} className="flex-1 px-4 py-2 border border-outline-variant dark:border-outline text-on-surface rounded-lg font-semibold hover:bg-surface-container dark:hover:bg-surface-variant transition-colors text-sm">Cancelar</button>
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
          <span className="text-on-surface">Detalhes do Veículo: <PrivateValue value={vehicle.plate} /></span>
        </nav>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button 
                onClick={onDelete} 
                className="flex items-center gap-2 px-4 py-2 bg-error text-white font-semibold rounded-lg hover:bg-error/90 transition-colors shadow-sm text-sm"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                Excluir
              </button>
              <button 
                onClick={onEdit} 
                className="flex items-center gap-2 px-4 py-2 border border-outline-variant bg-white dark:bg-surface text-on-surface font-semibold rounded-lg hover:bg-surface-container dark:hover:bg-surface-variant transition-colors shadow-sm text-sm"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
                Editar Veículo
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hero Section */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        <div className="col-span-12 lg:col-span-8 h-[400px] rounded-2xl overflow-hidden relative shadow-sm border border-outline-variant dark:border-white/10 group bg-white dark:bg-white flex flex-col justify-end">
          <img 
            className="absolute inset-0 w-full h-[120%] -top-[10%] object-contain transition-transform duration-700 group-hover:scale-105 z-10" 
            src={vehicle.imageUrl || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=1200"} 
            alt={vehicle.model} 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-blue-600/60 via-blue-900/20 to-transparent z-10"></div>
          
          <div className="relative z-20 p-10 mt-auto w-full">
            <div className="flex items-center gap-3 mb-6">
              <span className={`px-2.5 py-1 rounded-md font-extrabold text-[10px] uppercase tracking-widest ${vehicle.status === 'Ativo' ? 'bg-primary text-white shadow-lg' : 'bg-white/10 text-red-100 border border-white/20 backdrop-blur-md'}`}>
                {vehicle.status === 'Inativo' ? (
                  <span className="text-red-400">INATIVO</span>
                ) : vehicle.status}
              </span>
              <span className="px-3 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-lg font-bold text-[10px] uppercase tracking-widest leading-none shadow-sm">
                RENAVAM: <span className="font-mono ml-1 opacity-90"><PrivateValue value={vehicle.renavam} /></span>
              </span>
            </div>
            
            <div className="flex flex-col text-white">
              <h2 className="text-[68px] font-bold leading-none mb-3 tracking-tighter filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
                <PrivateValue value={vehicle.plate} />
              </h2>
              <div className="flex items-center gap-2 text-sm font-bold opacity-95 uppercase tracking-wide filter drop-shadow-md">
                <span>{vehicle.brand} {vehicle.model}</span>
                <span className="opacity-40 text-lg">•</span>
                <span>{vehicle.bodywork || 'ABERTA/MECANISMO OPERACIONAL'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          {/* Status Alert */}
          <div className={`p-6 rounded-2xl flex items-center gap-6 flex-1 shadow-sm ${vehicle.exerciceStatus === 'Vencido' ? 'bg-error-container/20 border-error/50 border dark:glass-panel dark:border-red-500/30 dark:shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'bg-surface-container-lowest border-outline-variant border dark:glass-panel dark:border-blue-500/20 dark:hover:shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-shadow'}`}>
            <div className={`h-16 w-16 rounded-full flex items-center justify-center shrink-0 border-2 ${vehicle.exerciceStatus === 'Vencido' ? 'border-error/20 bg-error-container dark:bg-error/10 dark:border-red-500/30' : 'border-primary/20 bg-primary-container/50 dark:bg-primary/10 dark:border-blue-500/30'}`}>
              <div className={`h-12 w-12 rounded-full flex items-center justify-center ${vehicle.exerciceStatus === 'Vencido' ? 'bg-error/20' : 'bg-primary/20 dark:bg-emerald-500/20 dark:shadow-[0_0_15px_rgba(16,185,129,0.4)]'}`}>
                <span className={`material-symbols-outlined text-[28px] ${vehicle.exerciceStatus === 'Vencido' ? 'text-error dark:text-red-400' : 'text-primary dark:text-emerald-400'}`}>
                  {vehicle.exerciceStatus === 'Vencido' ? 'warning' : 'verified'}
                </span>
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Status Documentação</h3>
              <p className="text-[20px] font-bold mb-1 text-on-surface">Exercício {vehicle.exerciceYear}</p>
              <p className={`text-sm font-medium ${vehicle.exerciceStatus === 'Vencido' ? 'text-error dark:text-red-400' : 'text-on-surface-variant'}`}>
                {vehicle.exerciceStatus === 'Vencido' ? 'O licenciamento deste veículo está atrasado.' : 'Documentação em dia e verificada.'}
              </p>
              {vehicle.exerciceStatus === 'Vencido' && (
                <button className="mt-4 text-primary dark:text-blue-400 font-bold text-sm flex items-center gap-2 hover:translate-x-1 transition-transform">
                  Emitir Guia <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              )}
            </div>
          </div>

          {/* Odômetro */}
          <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm flex flex-col justify-between flex-1 dark:glass-panel dark:border-blue-500/20 dark:hover:shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-shadow">
            <div>
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Status do Odômetro</h3>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                  vehicle.lastSyncStatus === 'success' 
                    ? 'bg-success/5 text-success border-success/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30' 
                    : vehicle.lastSyncStatus === 'warning'
                      ? 'bg-warning/5 text-warning border-warning/20'
                      : vehicle.lastSyncStatus === 'failed'
                        ? 'bg-error/5 text-error border-error/20 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30'
                        : 'bg-on-surface-variant/5 text-on-surface-variant border-on-surface-variant/20 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/30'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    vehicle.lastSyncStatus === 'success' ? 'bg-success dark:bg-emerald-400 animate-pulse' : vehicle.lastSyncStatus === 'warning' ? 'bg-warning animate-pulse' : vehicle.lastSyncStatus === 'failed' ? 'bg-error dark:bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-on-surface-variant dark:bg-gray-400'
                  }`}></span>
                  {vehicle.lastSyncStatus === 'success' ? 'CONECTADO' : vehicle.lastSyncStatus === 'warning' ? 'ATENÇÃO' : vehicle.lastSyncStatus === 'failed' ? 'ERRO SYNC' : 'OFFLINE'}
                </div>
              </div>
              <div className="flex justify-between items-baseline mb-4">
                <span className="text-[54px] font-bold text-primary dark:neon-text-primary leading-none tracking-tight">{(vehicle.currentKM || vehicle.odometer || 0).toLocaleString()}</span>
                <span className="text-[20px] font-bold text-on-surface-variant mb-1">KM</span>
              </div>
              {vehicle.lastSyncCheck && (
                <div className="flex flex-col gap-1 mb-6">
                  <p className="text-[10px] text-on-surface-variant/80 font-bold uppercase flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">sync</span>
                    Última sincronização
                  </p>
                  <p className="text-xs font-bold text-primary dark:text-blue-400">
                    {new Date(vehicle.lastSyncCheck || vehicle.lastKmUpdate || vehicle.updatedAt).toLocaleString('pt-BR')}
                  </p>
                  
                  {vehicle.lastTrackerUpdate && (
                    <div className="mt-2 p-2 bg-primary/5 dark:bg-primary/10 rounded-lg border border-primary/10 dark:border-primary/20">
                      <p className="text-[9px] text-primary/70 dark:text-blue-300 font-bold uppercase flex items-center gap-1">
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
                  if (!isAdmin) return;
                  window.dispatchEvent(new CustomEvent('MANUAL_KM_SYNC', { 
                    detail: { vehicleId: vehicle.id, plate: vehicle.plate } 
                  }));
                }}
                disabled={!isAdmin}
                className={`w-full py-3 bg-primary/10 hover:bg-primary/20 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-primary dark:text-blue-400 border border-primary/20 dark:border-blue-500/30 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 ${!isAdmin ? 'opacity-50 cursor-not-allowed mb-2' : 'mb-2 dark:shadow-[0_0_10px_rgba(59,130,246,0.1)]'}`}
              >
                <span className="material-symbols-outlined text-[16px]">sync</span>
                Sincronizar Agora
              </button>
            </div>
            <div className="space-y-2 mt-4 flex-1 flex flex-col justify-end">
              <div className="h-1.5 w-full bg-surface-container-highest dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-primary dark:bg-blue-500 dark:shadow-[0_0_10px_rgba(59,130,246,0.8)] rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, Math.max(0, ((vehicle.currentKM || vehicle.odometer || 0) / 10000) * 100))}%` }}></div>
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
        <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col h-full dark:glass-panel dark:border-blue-500/20 dark:hover:shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-shadow">
          <div className="px-6 py-4 border-b border-outline-variant dark:border-blue-500/20 bg-surface-container-low/30 dark:bg-white/5 flex justify-between items-center">
            <h3 className="text-[10px] font-bold text-on-surface uppercase tracking-widest">Informações Técnicas</h3>
            <span className="material-symbols-outlined text-primary dark:text-blue-400 text-[20px]">precision_manufacturing</span>
          </div>
          <div className="p-6 divide-y divide-outline-variant/30 dark:divide-outline/30 flex-1">
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Cor Predominante</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-on-surface">{vehicle.color}</span>
                <div className="w-4 h-4 rounded-full border border-outline-variant" style={{ backgroundColor: vehicle.color.toLowerCase().includes('bran') ? '#ffffff' : vehicle.color.toLowerCase().includes('pret') ? '#1f2937' : vehicle.color.toLowerCase().includes('verm') ? '#ef4444' : vehicle.color.toLowerCase().includes('prat') ? '#e5e7eb' : vehicle.color.toLowerCase().includes('cinz') ? '#9ca3af' : '#ccc' }}></div>
              </div>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Ano do Modelo</span>
              <span className="font-bold text-sm text-on-surface">{vehicle.modelYear}</span>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Combustível</span>
              <span className="font-bold text-sm text-on-surface">{vehicle.fuelType}</span>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Chassi</span>
              <span className="font-mono text-sm font-bold text-on-surface"><PrivateValue value={vehicle.chassis} /></span>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Centro de Custo</span>
              <span className="font-bold text-sm text-on-surface">
                {(Array.isArray(vehicle.costCenter) ? vehicle.costCenter : [vehicle.costCenter])
                  .map(v => String(v || '').replace(/logística - região sul/gi, '').replace(/logístic a - região sul/gi, '').replace(/,? ?$/, '').trim())
                  .filter(Boolean)
                  .join(', ') || '-'}
              </span>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Lotação</span>
              <span className="font-bold text-sm text-on-surface">{vehicle.capacity || '-'}</span>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">Peso Bruto Total (PBT)</span>
              <span className="font-bold text-sm text-on-surface">{vehicle.grossWeight || '-'}</span>
            </div>
            <div className="py-3.5 flex justify-between items-center">
              <span className="text-on-surface-variant text-sm font-medium">CNPJ / CPF</span>
              <span className="font-bold text-sm text-on-surface"><PrivateValue value={vehicle.ownerCnpj} /></span>
            </div>
            {vehicle.observation && (
              <div className="py-3.5 flex flex-col gap-2">
                <span className="text-on-surface-variant text-sm font-medium">Observação</span>
                <p className="font-medium text-sm text-on-surface bg-surface-container-low dark:bg-surface/50 p-3 rounded-lg border border-outline-variant/30 dark:border-outline/30 leading-relaxed whitespace-pre-wrap">{vehicle.observation}</p>
              </div>
            )}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden dark:glass-panel dark:border-blue-500/20 dark:hover:shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-shadow">
          <div className="px-6 py-4 border-b border-outline-variant dark:border-blue-500/20 bg-surface-container-low/30 dark:bg-white/5 flex justify-between items-center">
            <h3 className="text-[10px] font-bold text-on-surface uppercase tracking-widest">Distribuição Mensal</h3>
            <span className="material-symbols-outlined text-primary dark:text-blue-400 text-[20px]">payments</span>
          </div>
          <div className="p-8 flex items-center gap-10">
            <div className="relative h-32 w-32 shrink-0">
               <svg className="h-full w-full transform -rotate-90">
                <circle className="text-surface-container-highest dark:text-surface-variant" cx="64" cy="64" fill="transparent" r="54" stroke="currentColor" strokeWidth="12"></circle>
                <circle className="text-primary dark:text-blue-500" cx="64" cy="64" fill="transparent" r="54" stroke="currentColor" strokeDasharray="339" strokeDashoffset="100" strokeWidth="12" strokeLinecap="round"></circle>
                <circle className="text-on-tertiary-container dark:text-amber-500" cx="64" cy="64" fill="transparent" r="54" stroke="currentColor" strokeDasharray="339" strokeDashoffset="240" strokeWidth="12" strokeLinecap="round"></circle>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase">Total</span>
                <span className="text-sm font-bold text-on-surface">R$ 1.2k</span>
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary dark:bg-blue-500 dark:neon-glow-primary"></div>
                  <span className="text-xs font-bold text-on-surface-variant">Combustível</span>
                </div>
                <span className="text-sm font-bold text-on-surface">55%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-on-tertiary-container dark:bg-amber-500"></div>
                  <span className="text-xs font-bold text-on-surface-variant">Manutenção</span>
                </div>
                <span className="text-sm font-bold text-on-surface">30%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-surface-container-highest dark:bg-surface-variant"></div>
                  <span className="text-xs font-bold text-on-surface-variant">Outros</span>
                </div>
                <span className="text-sm font-bold text-on-surface">15%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-3 bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm flex flex-col items-center text-center dark:glass-panel dark:border-blue-500/20 dark:hover:shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-shadow">
          <div className="flex justify-between items-center w-full mb-4">
            <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Motoristas Atribuídos</h3>
            {isAdmin && (
              <button 
                onClick={() => setIsAssignModalOpen(true)}
                className="text-primary dark:text-blue-400 hover:bg-primary/10 dark:hover:bg-primary/20 p-1 rounded-full transition-colors"
                title="Atribuir Motorista"
              >
                <span className="material-symbols-outlined text-[20px]">person_add</span>
              </button>
            )}
          </div>
          <div className="w-full space-y-6 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
            {assignedDrivers && assignedDrivers.length > 0 ? (
              assignedDrivers.map((driver) => (
                <div key={driver.id} className="pb-4 border-b border-outline-variant/30 dark:border-outline/30 last:border-0 last:pb-0 relative group/driver">
                  {isAdmin && (
                    <button 
                      onClick={() => handleRemoveDriver(driver.id)}
                      className="absolute top-0 right-0 p-1 text-on-surface-variant hover:text-error dark:hover:text-red-400 opacity-0 group-hover/driver:opacity-100 transition-opacity"
                      title="Remover Atribuição"
                    >
                      <span className="material-symbols-outlined text-[18px]">link_off</span>
                    </button>
                  )}
                  <div className="h-20 w-20 rounded-full mx-auto overflow-hidden mb-3 border-2 border-primary-fixed dark:border-blue-500 p-1 bg-surface-container-low dark:bg-surface">
                    {driver.imageUrl ? (
                      <img 
                        src={driver.imageUrl} 
                        alt={driver.name} 
                        className={`h-full w-full rounded-full object-cover transition-all duration-300 ${isPrivacyMode ? 'blur-[8px]' : ''}`} 
                      />
                    ) : (
                      <div className="h-full w-full rounded-full bg-secondary-container dark:bg-secondary/20 flex items-center justify-center font-bold text-primary dark:text-blue-400 text-xl">
                        {driver.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <h4 className="text-lg font-bold leading-tight mb-1 text-on-surface"><PrivateValue value={driver.name} /></h4>
                  <p className="text-[12px] text-on-surface-variant font-medium mb-1 truncate px-2">Cat. {driver.cnhCategory} • {driver.validUntil ? (new Date(driver.validUntil) < new Date() ? 'Vencida' : 'Válida') : 'Status N/A'}</p>
                  <p className="text-[11px] text-on-surface-variant font-medium mb-3"><PrivateValue value={driver.phone} /></p>
                  <div className="w-full bg-surface-container dark:bg-surface-variant/50 px-3 py-2 rounded-lg flex justify-between items-center">
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase">Status</span>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{driver.status}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2">person_off</span>
                <p className="text-sm font-medium text-on-surface-variant">Nenhum motorista atribuído</p>
                {isAdmin && (
                  <button 
                    onClick={() => setIsAssignModalOpen(true)}
                    className="mt-4 text-xs font-bold text-primary dark:text-blue-400 hover:underline uppercase tracking-wider"
                  >
                    Atribuir Agora
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
