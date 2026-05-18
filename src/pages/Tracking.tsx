import { motion } from 'framer-motion';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

// Base coordinates for Sao Paulo
const BASE_LAT = -23.5505;
const BASE_LNG = -46.6333;

export function Tracking() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qVehicles = query(collection(db, 'vehicles'), orderBy('plate', 'asc'));
    const unsubscribeVehicles = onSnapshot(qVehicles, (snapshot) => {
      setVehicles(snapshot.docs.map(doc => {
        const data = doc.data();
        const hash = (data.plate || doc.id).split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
        const latOffset = (hash % 100) / 1000;
        const lngOffset = ((hash * 7) % 100) / 1000;
        
        return {
          id: doc.id,
          ...data,
          location: {
            lat: BASE_LAT + latOffset,
            lng: BASE_LNG + lngOffset
          }
        };
      }));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'vehicles');
    });

    const qDrivers = query(collection(db, 'drivers'));
    const unsubscribeDrivers = onSnapshot(qDrivers, (snapshot) => {
      setDrivers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, error => {
      handleFirestoreError(error, OperationType.LIST, 'drivers');
    });

    // Subtle movement simulation for "In Route" vehicles
    const interval = setInterval(() => {
      setVehicles(prev => prev.map(v => {
        const driver = drivers.find(d => d.vehicleAssigned === v.plate);
        if (driver?.status === 'Em Rota') {
          return {
            ...v,
            location: {
              lat: v.location.lat + (Math.random() - 0.5) * 0.0001,
              lng: v.location.lng + (Math.random() - 0.5) * 0.0001
            }
          };
        }
        return v;
      }));
    }, 5000);

    return () => {
      unsubscribeVehicles();
      unsubscribeDrivers();
      clearInterval(interval);
    };
  }, [drivers]);

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const selectedVehicleDriver = drivers.find(d => d.vehicleAssigned === selectedVehicle?.plate);

  if (!hasValidKey) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] text-center font-sans px-4">
        <div className="max-w-2xl bg-surface-container-lowest border border-outline-variant p-8 rounded-2xl shadow-sm">
          <span className="material-symbols-outlined text-[64px] text-primary mb-4">map</span>
          <h2 className="text-2xl font-bold mb-4">Chave da Google Maps API Requerida</h2>
          <p className="mb-6 text-on-surface-variant">Para visualizar o rastreamento em tempo real da frota, é necessário configurar a integração com o Google Maps Platform.</p>
          <div className="text-left bg-surface-container-low p-6 rounded-xl border border-outline-variant">
            <p className="font-semibold mb-2"><strong>Passo 1:</strong> <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noopener" className="text-primary hover:underline">Obter uma API Key</a></p>
            <p className="font-semibold mb-2"><strong>Passo 2:</strong> Adicionar como segredo no AI Studio:</p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Abra as <strong>Configurações</strong> (⚙️ ícone de engrenagem, <strong>canto superior direito</strong>)</li>
              <li>Selecione <strong>Secrets</strong></li>
              <li>Digite <code>GOOGLE_MAPS_PLATFORM_KEY</code> como o nome do segredo e pressione <strong>Enter</strong></li>
              <li>Cole a sua chave de API como o valor e pressione <strong>Enter</strong></li>
            </ul>
          </div>
          <p className="mt-6 text-sm text-on-surface-variant">O aplicativo será reconstruído automaticamente após a adição do segredo.</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="pb-12 h-[calc(100vh-80px)]"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <motion.div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4" variants={itemVariants}>
        <div>
          <h2 className="text-[32px] font-semibold text-primary leading-[1.3] tracking-[-0.01em]">Rastreamento em Tempo Real</h2>
          <p className="text-base text-on-surface-variant mt-2">Acompanhe a localização e o status de todos os veículos da sua frota no mapa ativo.</p>
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-12 gap-6 h-[70vh]" variants={containerVariants}>
        <motion.div className="col-span-12 lg:col-span-8 h-full rounded-2xl overflow-hidden border border-outline-variant relative shadow-sm" variants={itemVariants}>
          <APIProvider apiKey={API_KEY} version="weekly">
            <Map
              defaultCenter={{lat: BASE_LAT, lng: BASE_LNG}}
              defaultZoom={12}
              mapId="FLEET_TRACKING_MAP"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{width: '100%', height: '100%'}}
            >
              {vehicles.map(v => {
                const driver = drivers.find(d => d.vehicleAssigned === v.plate);
                const status = driver ? driver.status : 'Inativo';
                
                return (
                  <AdvancedMarker 
                    key={v.id} 
                    position={v.location} 
                    onClick={() => setSelectedVehicleId(v.id)}
                  >
                    <Pin 
                      background={status === 'Em Rota' ? '#34d399' : status === 'Disponível' ? '#60a5fa' : '#f87171'} 
                      glyphColor="#fff" 
                      borderColor={status === 'Em Rota' ? '#059669' : status === 'Disponível' ? '#2563eb' : '#dc2626'}
                    />
                  </AdvancedMarker>
                );
              })}
            </Map>
          </APIProvider>
          {selectedVehicle && (
            <div className="absolute top-4 right-4 bg-white p-4 rounded-xl shadow-lg border border-outline-variant w-64 animate-in fade-in slide-in-from-right-4 duration-300 z-10">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-primary">{selectedVehicle.model}</h4>
                <button onClick={() => setSelectedVehicleId(null)} className="text-on-surface-variant hover:text-error">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <p className="text-sm border-b border-outline-variant/30 pb-2 mb-2">
                Placa: {selectedVehicle.plate}
              </p>
              <div className="space-y-1">
                <p className="text-xs text-on-surface-variant flex justify-between">
                  <span>Status:</span>
                  <span className="font-semibold text-on-surface">{selectedVehicleDriver ? selectedVehicleDriver.status : 'Inativo'}</span>
                </p>
                <p className="text-xs text-on-surface-variant flex justify-between">
                  <span>Motorista:</span>
                  <span className="font-semibold text-on-surface">{selectedVehicleDriver ? selectedVehicleDriver.name : 'Não Atribuído'}</span>
                </p>
                {selectedVehicleDriver?.workName && (
                  <p className="text-xs text-on-surface-variant flex justify-between">
                    <span>Obra:</span>
                    <span className="font-semibold text-on-surface">{selectedVehicleDriver.workName}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </motion.div>

        <motion.div className="col-span-12 lg:col-span-4 h-full bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col" variants={itemVariants}>
          <div className="p-4 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
            <h3 className="font-bold text-[18px]">Frota Ativa</h3>
            <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{vehicles.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {vehicles.map(v => {
              const driver = drivers.find(d => d.vehicleAssigned === v.plate);
              const status = driver ? driver.status : 'Inativo';
              
              return (
                <div 
                  key={v.id} 
                  onClick={() => setSelectedVehicleId(v.id)}
                  className={`p-4 border rounded-xl cursor-pointer transition-all ${selectedVehicleId === v.id ? 'border-primary bg-primary-container/20' : 'border-outline-variant hover:border-primary/50'}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <h4 className="font-bold text-base">{v.model}</h4>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                      status === 'Em Rota' ? 'bg-emerald-100 text-emerald-800' : 
                      status === 'Disponível' ? 'bg-blue-100 text-blue-800' : 
                      'bg-red-100 text-red-800'
                    }`}>
                      {status}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mb-2 font-mono">{v.plate}</p>
                  <div className="text-xs flex items-center gap-1 text-on-surface-variant">
                    <span className="material-symbols-outlined text-[14px]">person</span>
                    <span className="font-medium text-on-surface">{driver ? driver.name : 'Sem Motorista'}</span>
                  </div>
                  {driver?.workName && (
                     <div className="text-xs flex items-center gap-1 mt-1 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">location_on</span>
                      <span>{driver.workName}</span>
                    </div>
                  )}
                </div>
              );
            })}
            {vehicles.length === 0 && !loading && (
              <div className="text-center py-8 text-on-surface-variant">
                Nenhum veículo cadastrado na frota.
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

