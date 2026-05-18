import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../lib/firebase';
import { collection, onSnapshot, collectionGroup, getDocs } from 'firebase/firestore';

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

export function Dashboard() {
  const navigate = useNavigate();
  const [isAlertCenterOpen, setIsAlertCenterOpen] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [vehicleStats, setVehicleStats] = useState({
    total: 0,
    active: 0,
    maintenance: 0
  });

  const [expiredInspections, setExpiredInspections] = useState<any[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const [nextServices, setNextServices] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      // Create listeners
      const unsubscribeVehicles = onSnapshot(collection(db, 'vehicles'), async (snapshot) => {
        const vehicles = snapshot.docs.map(d => ({ ...d.data(), id: d.id })) as any[];
        
        const stats = {
          total: vehicles.length,
          active: vehicles.filter(v => v.status === 'Ativo').length,
          maintenance: vehicles.filter(v => v.status === 'Em Manutenção').length
        };
        setVehicleStats(stats);

        // Fetch expired inspections based on current vehicles
        try {
          const recordsSnap = await getDocs(collectionGroup(db, 'records'));
          const itemsSnap = await getDocs(collectionGroup(db, 'items'));
          
          const itemsMap = new Map();
          itemsSnap.forEach(doc => {
            itemsMap.set(doc.id, { ...doc.data(), id: doc.id });
          });

          const expired: any[] = [];
          
          recordsSnap.forEach(recordDoc => {
            const record = recordDoc.data();
            const vehicleId = recordDoc.ref.parent.parent?.id;
            const item = itemsMap.get(record.itemId);
            
            if (vehicleId && item) {
              const vehicle = vehicles.find(v => v.id === vehicleId);
              if (vehicle) {
                const currentKM = vehicle.currentKM || vehicle.odometer || 0;
                const nextKM = record.nextMaintenanceKM || 0;
                const remaining = nextKM - currentKM;
                
                // If it's expired or within 500km of expiring
                if (remaining <= 0) {
                  expired.push({
                    vehicleId: vehicleId,
                    vehiclePlate: vehicle.plate,
                    vehicleModel: vehicle.model,
                    vehicleBrand: vehicle.brand,
                    vehicleImage: vehicle.imageUrl,
                    itemName: item.name,
                    remainingKM: remaining,
                    type: 'expired'
                  });
                } else if (remaining <= 1000) {
                  expired.push({
                    vehicleId: vehicleId,
                    vehiclePlate: vehicle.plate,
                    vehicleModel: vehicle.model,
                    vehicleBrand: vehicle.brand,
                    vehicleImage: vehicle.imageUrl,
                    itemName: item.name,
                    remainingKM: remaining,
                    type: 'warning'
                  });
                }
              }
            }
          });
          
          // Sort so expired is first, then warnings by lowest remaining KM
          expired.sort((a, b) => a.remainingKM - b.remainingKM);
          
          setExpiredInspections(expired);
        } catch (error) {
          console.error("Error fetching inspections:", error);
        } finally {
          setLoadingAlerts(false);
        }
      });

      const unsubscribeAlerts = onSnapshot(collection(db, 'alerts'), (snapshot) => {
        const alertsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        setAlerts(alertsData);
      });

      const unsubscribeMaintenance = onSnapshot(collection(db, 'maintenance'), (snapshot) => {
        const maintenanceData = snapshot.docs
          .map(doc => ({ ...doc.data(), id: doc.id }))
          .filter((os: any) => os.status !== 'Concluído')
          .slice(0, 5);
        setNextServices(maintenanceData);
      });

      return () => {
        unsubscribeVehicles();
        unsubscribeAlerts();
        unsubscribeMaintenance();
      };
    };
    
    fetchData();
  }, []);

  return (
    <motion.div 
      className="pb-10"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <AnimatePresence>
        {isAlertCenterOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsAlertCenterOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container text-on-surface">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[24px]">notifications</span>
                  <h3 className="text-xl font-semibold">Central de Alertas</h3>
                </div>
                <button onClick={() => setIsAlertCenterOpen(false)} className="hover:bg-black/10 p-2 rounded-full transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 overflow-y-auto space-y-4">
                {loadingAlerts ? (
                  <div className="py-12 text-center text-on-surface-variant flex flex-col items-center">
                    <span className="material-symbols-outlined animate-spin mb-2">progress_activity</span>
                    Carregando alertas...
                  </div>
                ) : Number([...alerts, ...(expiredInspections.filter(i => i.type === 'expired'))].length) === 0 ? (
                  <div className="py-12 text-center text-on-surface-variant italic">
                    Nenhum alerta pendente no momento.
                  </div>
                ) : (
                  <>
                    {expiredInspections.filter(i => i.type === 'expired' || i.type === 'warning').map((insp, idx) => (
                      <div 
                        key={`insp-${idx}`}
                        onClick={() => {
                          setIsAlertCenterOpen(false);
                          navigate(`/inspections/${insp.vehicleId}`);
                        }}
                        className={`flex items-start gap-4 p-4 bg-surface-container-low rounded-xl border ${insp.type === 'expired' ? 'border-error/50 shadow-[0_0_10px_rgba(255,0,0,0.05)] hover:bg-error-container/20' : 'border-warning/50 hover:bg-warning-container/20'} transition-all cursor-pointer`}
                      >
                        <div className="w-12 h-12 rounded-lg border border-outline-variant bg-white overflow-hidden flex-shrink-0">
                          <img src={insp.vehicleImage || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800"} className="w-full h-full object-contain" alt={insp.vehicleModel} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-on-surface flex items-center gap-2">
                            {insp.itemName}
                            <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-bold ${insp.type === 'expired' ? 'bg-error-container text-on-error-container' : 'bg-warning-container text-warning-dark'}`}>
                              {insp.type === 'expired' ? 'Vencido' : 'Próximo do Vencimento'}
                            </span>
                          </p>
                          <p className="text-xs font-semibold text-on-surface-variant mt-1.5 uppercase tracking-wide">
                            {insp.vehiclePlate} • {insp.vehicleBrand} {insp.vehicleModel}
                          </p>
                          <p className={`text-[11px] mt-2 font-bold ${insp.type === 'expired' ? 'text-error' : 'text-warning-dark'}`}>
                            {insp.type === 'expired' 
                              ? `Vencido há ${(Math.abs(insp.remainingKM)).toLocaleString()} KM` 
                              : `Faltam ${insp.remainingKM.toLocaleString()} KM`
                            }
                          </p>
                        </div>
                      </div>
                    ))}
                    {alerts.map(alert => (
                      <div key={alert.id} className={`flex gap-4 p-4 bg-surface-container-low rounded-xl border ${alert.severity === 'critical' ? 'border-error/50' : 'border-outline-variant'}`}>
                        <span className={`material-symbols-outlined mt-1 ${alert.severity === 'critical' ? 'text-error' : 'text-on-surface-variant'}`} style={{ fontVariationSettings: alert.severity === 'critical' ? "'FILL' 1" : "" }}>
                          {alert.severity === 'critical' ? 'warning' : 'info'}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-on-surface">{alert.title}</p>
                          <p className="text-xs text-on-surface-variant mt-1">{alert.description}</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="mb-10" variants={itemVariants}>
        <h2 className="text-[32px] font-semibold text-on-surface leading-[1.3] tracking-[-0.01em]">Visão Geral das Operações</h2>
        <p className="text-base text-on-surface-variant mt-2">Status em tempo real do seu ecossistema logístico.</p>
      </motion.div>

      <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10" variants={containerVariants}>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm group hover:-translate-y-1 transition-transform duration-300">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-secondary-fixed rounded-lg text-on-secondary-fixed group-hover:bg-primary-container group-hover:text-primary-fixed transition-colors">
              <span className="material-symbols-outlined">local_shipping</span>
            </div>
            <span className="text-xs text-on-surface-variant font-bold">+2.4%</span>
          </div>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Total de Veículos</h3>
          <p className="text-[48px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">{vehicleStats.total}</p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm group hover:-translate-y-1 transition-transform duration-300">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-tertiary-fixed rounded-lg text-on-tertiary-fixed group-hover:bg-primary-container group-hover:text-primary-fixed transition-colors">
              <span className="material-symbols-outlined">bolt</span>
            </div>
            <span className="text-xs text-on-surface-variant font-bold">92%</span>
          </div>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Ativos Agora</h3>
          <p className="text-[48px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">{vehicleStats.active}</p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm group hover:-translate-y-1 transition-transform duration-300">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-surface-variant rounded-lg text-on-surface-variant group-hover:bg-primary-container group-hover:text-primary-fixed transition-colors">
              <span className="material-symbols-outlined">build</span>
            </div>
            <span className="text-xs text-on-surface-variant font-bold">5.8%</span>
          </div>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Em Manutenção</h3>
          <p className="text-[48px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">{vehicleStats.maintenance}</p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm group hover:-translate-y-1 transition-transform duration-300">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-error-container rounded-lg text-on-error-container group-hover:bg-error group-hover:text-white transition-colors">
              <span className="material-symbols-outlined">report_problem</span>
            </div>
            <span className="text-xs text-error font-bold">CRÍTICO</span>
          </div>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Alertas Ativos</h3>
          <p className="text-[48px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">{alerts.length}</p>
        </motion.div>
      </motion.div>

      <motion.div className="grid grid-cols-12 gap-6 mb-6" variants={itemVariants}>
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-outline-variant flex items-center justify-between">
            <div>
              <h3 className="text-[24px] font-semibold">Custos Mensais da Frota</h3>
              <p className="text-xs text-on-surface-variant mt-1">Gastos com Combustível, Manutenção e Conformidade</p>
            </div>
            <select className="bg-surface-container-low border-outline-variant text-sm font-semibold rounded-lg py-2 pl-4 pr-10 focus:ring-primary">
              <option>Últimos 6 Meses</option>
              <option>Último Ano</option>
            </select>
          </div>
          <div className="p-8 flex-1 flex items-center justify-center border-2 border-dashed border-outline-variant/30 m-4 rounded-xl">
            <p className="text-on-surface-variant italic text-sm">Dados de custo serão exibidos após o primeiro mês de operação.</p>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-primary-container text-on-primary p-8 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6 text-on-primary-fixed">
              <span className="material-symbols-outlined text-tertiary-fixed">priority_high</span>
              <h3 className="text-[24px] font-semibold text-white">Alertas Críticos</h3>
            </div>
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="p-8 text-center text-white/50 italic text-xs">
                  Nenhum alerta ativo
                </div>
              ) : (
                alerts.slice(0, 3).map(alert => (
                  <div key={alert.id} className="flex gap-4 p-4 bg-white/5 rounded-lg border border-white/10">
                    <span className={`material-symbols-outlined mt-1 ${alert.severity === 'critical' ? 'text-error' : 'text-primary-fixed'}`} style={{ fontVariationSettings: alert.severity === 'critical' ? "'FILL' 1" : "" }}>
                      {alert.severity === 'critical' ? 'warning' : 'info'}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">{alert.title}</p>
                      <p className="text-xs text-white/70 mt-1">{alert.description}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <button 
            onClick={() => setIsAlertCenterOpen(true)}
            className="mt-8 bg-primary-fixed text-on-primary-fixed w-full py-4 rounded-lg font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            Ver Central de Alertas
          </button>
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-12 gap-6" variants={itemVariants}>
        <div className="col-span-12 lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-white z-10">
            <h3 className="text-[24px] font-semibold">Mapa de Manutenção</h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-error animate-pulse"></div>
                <span className="text-xs text-on-surface-variant font-medium">Imediato</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-secondary"></div>
                <span className="text-xs text-on-surface-variant font-medium">Agendado</span>
              </div>
            </div>
          </div>
          <div className="relative flex-1 bg-surface-variant min-h-[400px]">
            <img className="absolute inset-0 w-full h-full object-cover grayscale opacity-90" alt="Map" src="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=1200"/>
            <div className="absolute inset-0 bg-primary-container/80 mix-blend-multiply"></div>
            
            {/* Map markers mock */}
            <div className="absolute top-[30%] left-[20%] w-3 h-3 bg-error rounded-full shadow-[0_0_10px_rgba(255,0,0,0.8)] animate-pulse"></div>
            <div className="absolute top-[45%] left-[60%] w-3 h-3 bg-error rounded-full shadow-[0_0_10px_rgba(255,0,0,0.8)] animate-pulse"></div>
            <div className="absolute top-[60%] left-[40%] w-3 h-3 bg-error rounded-full shadow-[0_0_10px_rgba(255,0,0,0.8)] animate-pulse"></div>
            
            <div className="absolute top-[20%] left-[50%] w-2.5 h-2.5 bg-secondary rounded-full"></div>
            <div className="absolute top-[70%] left-[30%] w-2.5 h-2.5 bg-secondary rounded-full"></div>
            <div className="absolute top-[55%] left-[80%] w-2.5 h-2.5 bg-secondary rounded-full"></div>
            <div className="absolute top-[80%] left-[65%] w-2.5 h-2.5 bg-secondary rounded-full"></div>

            <div className="absolute top-6 left-6 p-4 bg-white/90 backdrop-blur border border-outline-variant rounded-xl shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-error animate-pulse"></div>
                <p className="text-sm font-bold text-on-surface">Rastreamento de Frota Ativo</p>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-outline-variant bg-white z-10">
            <h3 className="text-[24px] font-semibold">Próximos Serviços</h3>
          </div>
          <div className="divide-y divide-outline-variant flex-1 overflow-y-auto">
            {loadingAlerts ? (
              <div className="py-12 text-center text-on-surface-variant flex flex-col items-center">
                <span className="material-symbols-outlined animate-spin mb-2">progress_activity</span>
                Carregando...
              </div>
            ) : [...(expiredInspections.filter(i => i.type === 'expired' || i.type === 'warning')), ...nextServices].length === 0 ? (
              <div className="p-12 text-center text-on-surface-variant italic text-sm">
                Nenhuma manutenção ou serviço pendente no momento.
              </div>
            ) : (
              <>
                {expiredInspections.filter(i => i.type === 'expired' || i.type === 'warning').slice(0, 5).map((insp, idx) => (
                  <div 
                    key={`srv-insp-${idx}`} 
                    onClick={() => navigate(`/inspections/${insp.vehicleId}`)}
                    className="p-4 hover:bg-surface-container transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg border border-outline-variant bg-white overflow-hidden flex-shrink-0">
                        <img src={insp.vehicleImage || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800"} className="w-full h-full object-contain" alt={insp.vehicleModel} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-on-surface">{insp.vehiclePlate}</p>
                        <p className="text-xs text-on-surface-variant line-clamp-1">{insp.itemName}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase flex-shrink-0 ${insp.type === 'expired' ? 'bg-error-container text-on-error-container' : 'bg-warning-container text-warning-dark'}`}>
                      {insp.type === 'expired' ? 'Vencido' : 'Próximo'}
                    </span>
                  </div>
                ))}
                {nextServices.map((service: any) => (
                  <div key={service.id} className="p-4 hover:bg-surface-container transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-${service.color || 'primary'}-container flex items-center justify-center`}>
                        <span className="material-symbols-outlined text-[20px] text-on-surface">{service.icon || 'build'}</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-on-surface">{service.plate}</p>
                        <p className="text-xs text-on-surface-variant line-clamp-1">{service.title}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase flex-shrink-0 ${service.priority === 'Crítica' ? 'bg-error-container text-on-error-container' : 'bg-primary-container text-on-primary'}`}>
                      {service.priority}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="p-4 bg-surface-container-low text-center mt-auto border-t border-outline-variant">
            <Link to="/maintenance" className="text-sm text-secondary font-bold hover:underline">Ver Todas as Tarefas de Manutenção</Link>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
