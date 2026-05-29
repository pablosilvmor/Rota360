import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

// Custom icons based on status
const createCustomIcon = (color: string) => L.divIcon({
  className: 'custom-div-icon',
  html: `<div class="pulse-marker" style="background-color: ${color}; box-shadow: 0 0 10px ${color}; margin: 9px;"></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

// Helper component to center map on selection
function MapFollow({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

// Base coordinates for Belo Horizonte, MG
const BASE_LAT = -19.9167;
const BASE_LNG = -43.9345;

export function Tracking() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qVehicles = query(collection(db, 'vehicles'), orderBy('plate', 'asc'));
    const unsubscribeVehicles = onSnapshot(qVehicles, (snapshot) => {
      setVehicles(snapshot.docs.map((doc, index) => {
        const data = doc.data();
        
        // Se não houver localização, usamos a base
        let baseLocation = data.location || { lat: BASE_LAT, lng: BASE_LNG };
        
        // Adicionamos um pequeno deslocamento (jitter) baseado no índice para evitar sobreposição total
        // Isso ajuda a ver veículos que estão no mesmo endereço exato
        const jitterLat = (index % 10 - 5) * 0.00015;
        const jitterLng = (index % 12 - 6) * 0.00015;

        return {
          id: doc.id,
          ...data,
          location: {
            lat: baseLocation.lat + jitterLat,
            lng: baseLocation.lng + jitterLng
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

    return () => {
      unsubscribeVehicles();
      unsubscribeDrivers();
    };
  }, [drivers]);

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const selectedVehicleDriver = drivers.find(d => Array.isArray(d.vehicleAssigned) ? d.vehicleAssigned.includes(selectedVehicle?.plate) : d.vehicleAssigned === selectedVehicle?.plate);

  // Calculate center of vehicles
  const mapCenter: [number, number] = vehicles.length > 0
    ? [
        vehicles.reduce((acc, v) => acc + (v.location?.lat || 0), 0) / vehicles.length,
        vehicles.reduce((acc, v) => acc + (v.location?.lng || 0), 0) / vehicles.length
      ]
    : [BASE_LAT, BASE_LNG];

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
          <div className="relative h-full">
            {vehicles.length > 0 && typeof window !== 'undefined' ? (
              <MapContainer 
                key="tracking-live-map-instance"
                center={mapCenter} 
                zoom={12} 
                style={{ width: '100%', height: '100%', backgroundColor: '#0a1a3a' }}
                zoomControl={true}
                attributionControl={false}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                
                {selectedVehicle && selectedVehicle.location ? (
                  <MapFollow center={[selectedVehicle.location.lat, selectedVehicle.location.lng]} />
                ) : (
                  <MapFollow center={mapCenter} />
                )}

                {vehicles.map(v => {
                  const driver = drivers.find(d => Array.isArray(d.vehicleAssigned) ? d.vehicleAssigned.includes(v.plate) : d.vehicleAssigned === v.plate);
                  const status = driver ? driver.status : 'Inativo';
                  const color = status === 'Em Rota' ? '#34d399' : status === 'Disponível' ? '#60a5fa' : '#f87171';
                  
                  if (!v.location || typeof v.location.lat !== 'number') return null;

                  return (
                    <Marker 
                      key={v.id} 
                      position={[v.location.lat, v.location.lng]}
                      icon={createCustomIcon(color)}
                      eventHandlers={{
                        click: () => setSelectedVehicleId(v.id)
                      }}
                    >
                      <Popup>
                        <div className="text-xs font-sans">
                          {v.imageUrl && <img src={v.imageUrl} alt={v.plate} className="w-16 h-10 object-cover rounded mb-1" />}
                          <strong className="text-primary">{v.plate}</strong><br/>
                          {v.model}<br/>
                          <span className="font-bold">{status}</span>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            ) : (
              <div className="w-full h-full bg-surface-container flex items-center justify-center text-on-surface-variant text-sm">
                Carregando mapa...
              </div>
            )}
          </div>
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
              const driver = drivers.find(d => Array.isArray(d.vehicleAssigned) ? d.vehicleAssigned.includes(v.plate) : d.vehicleAssigned === v.plate);
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

