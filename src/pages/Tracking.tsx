import { motion } from 'framer-motion';
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useState, useEffect } from 'react';

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

// Fake locations around Sao Paulo
const vehicles = [
  { id: 'FTL-8824', placa: 'XYZ-9876', status: 'Em Trânsito', location: { lat: -23.5505, lng: -46.6333 }, driver: 'Elena Gilbert' },
  { id: 'TRK-2109', placa: 'ABC-1234', status: 'Disponível', location: { lat: -23.5615, lng: -46.6559 }, driver: 'Marco Vianna' },
  { id: 'VOL-4411', placa: 'QWE-1234', status: 'Inativo', location: { lat: -23.5489, lng: -46.6388 }, driver: 'Não Atribuído' },
];

export function Tracking() {
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);

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
              defaultCenter={{lat: -23.5505, lng: -46.6333}}
              defaultZoom={13}
              mapId="FLEET_TRACKING_MAP"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{width: '100%', height: '100%'}}
            >
              {vehicles.map(v => (
                <AdvancedMarker 
                  key={v.id} 
                  position={v.location} 
                  onClick={() => setSelectedVehicle(v.id)}
                >
                  <Pin 
                    background={v.status === 'Em Trânsito' ? '#34d399' : v.status === 'Disponível' ? '#60a5fa' : '#f87171'} 
                    glyphColor="#fff" 
                    borderColor={v.status === 'Em Trânsito' ? '#059669' : v.status === 'Disponível' ? '#2563eb' : '#dc2626'}
                  />
                </AdvancedMarker>
              ))}
            </Map>
          </APIProvider>
          {selectedVehicle && (
            <div className="absolute top-4 right-4 bg-white p-4 rounded-xl shadow-lg border border-outline-variant w-64 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-primary">{selectedVehicle}</h4>
                <button onClick={() => setSelectedVehicle(null)} className="text-on-surface-variant hover:text-error">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <p className="text-sm border-b border-outline-variant/30 pb-2 mb-2">
                {vehicles.find(v => v.id === selectedVehicle)?.placa}
              </p>
              <div className="space-y-1">
                <p className="text-xs text-on-surface-variant flex justify-between">
                  <span>Status:</span>
                  <span className="font-semibold text-on-surface">{vehicles.find(v => v.id === selectedVehicle)?.status}</span>
                </p>
                <p className="text-xs text-on-surface-variant flex justify-between">
                  <span>Motorista:</span>
                  <span className="font-semibold text-on-surface">{vehicles.find(v => v.id === selectedVehicle)?.driver}</span>
                </p>
              </div>
            </div>
          )}
        </motion.div>

        <motion.div className="col-span-12 lg:col-span-4 h-full bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col" variants={itemVariants}>
          <div className="p-4 border-b border-outline-variant bg-surface-container-low">
            <h3 className="font-bold text-[18px]">Veículos Ativos</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {vehicles.map(v => (
              <div 
                key={v.id} 
                onClick={() => setSelectedVehicle(v.id)}
                className={`p-4 border rounded-xl cursor-pointer transition-all ${selectedVehicle === v.id ? 'border-primary bg-primary-container/20' : 'border-outline-variant hover:border-primary/50'}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-base">{v.id}</h4>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${
                    v.status === 'Em Trânsito' ? 'bg-emerald-100 text-emerald-800' : 
                    v.status === 'Disponível' ? 'bg-blue-100 text-blue-800' : 
                    'bg-red-100 text-red-800'
                  }`}>
                    {v.status}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mb-2 font-mono">{v.placa}</p>
                <div className="text-xs flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">person</span>
                  <span>{v.driver}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
