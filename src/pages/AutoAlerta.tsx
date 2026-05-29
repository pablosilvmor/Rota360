import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, doc, getDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { toPng, toBlob } from "html-to-image";

export function AutoAlerta() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [driverName, setDriverName] = useState("");
  const [observation, setObservation] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);

  const fetchData = async () => {
    try {
      const vSnapshot = await getDocs(collection(db, "vehicles"));
      const vData = vSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setVehicles(vData);

      const dSnapshot = await getDocs(collection(db, "drivers"));
      const dData = dSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setDrivers(dData);

      setLoading(false);
    } catch (e) {
      console.error("Erro ao buscar dados", e);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const normalizePlate = (plate: string) => {
    if (!plate) return "";
    return plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  };

  const selectVehicleByRecord = (vehicle: any) => {
    setSelectedVehicle(vehicle);
    setSearchTerm(`${vehicle.plate} ${vehicle.model ? `- ${vehicle.model}` : ""}`);
    setIsDropdownOpen(false);

    // Encontra o motorista atribuído
    const normalizedSelectedPlate = normalizePlate(vehicle.plate);
    const assignedDriver = drivers.find(d => {
      const assigned = d.vehicleAssigned;
      if (Array.isArray(assigned)) {
        return assigned.some(p => normalizePlate(p) === normalizedSelectedPlate);
      }
      return normalizePlate(assigned) === normalizedSelectedPlate;
    });

    if (assignedDriver) {
      setDriverName(assignedDriver.name);
    } else {
      setDriverName("");
    }
  };

  const filteredVehicles = vehicles.filter(v => 
    v.plate?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.model?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || !driverName.trim() || !observation.trim()) return;

    setSubmitting(true);
    try {
      const orderNumber = `AA-${Math.floor(1000 + Math.random() * 9000)}`;
      
      const newAlert = {
        number: orderNumber,
        vehicleId: selectedVehicle.id,
        plate: selectedVehicle.plate,
        driverName: driverName,
        observation: observation,
        status: "pending", // pending, approved, rejected
        createdAt: Date.now(),
        createdBy: user?.uid || "unknown",
      };

      const docRef = await addDoc(collection(db, "auto_alertas"), newAlert);
      
      setSuccessData({ ...newAlert, id: docRef.id });
    } catch (err) {
      console.error(err);
      alert("Erro ao emitir AutoAlerta.");
    } finally {
      setSubmitting(false);
    }
  };

  if (successData) {
    return (
      <div className="max-w-2xl mx-auto">
        <div id="autoalerta-receipt" style={{ backgroundColor: '#ffffff', color: '#000000', borderColor: '#d1d5db', padding: '2rem', borderRadius: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', border: '1px solid #d1d5db', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '1.5rem', borderBottom: '1px solid #d1d5db', paddingBottom: '2rem' }}>
            <img 
              src="https://i.imgur.com/tIPJCgH.png" 
              alt="Rota 360" 
              style={{ 
                height: '10rem', 
                width: 'auto',
                objectFit: 'contain', 
                marginBottom: '1rem',
                filter: 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.7))'
              }} 
            />
            <div style={{ width: '5rem', height: '5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff', color: '#2563eb' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem' }}>campaign</span>
            </div>
            <div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#000000', margin: 0 }}>AutoAlerta Emitido</h2>
              <p style={{ color: '#666666', marginTop: '0.5rem' }}>Seu reporte foi enviado com sucesso.</p>
            </div>
            <div style={{ padding: '0.75rem 2rem', borderRadius: '0.75rem', backgroundColor: '#f3f4f6' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#666666' }}>Nº do Pedido</span>
              <p style={{ fontSize: '1.5rem', fontFamily: 'monospace', fontWeight: 'bold', color: '#2563eb', margin: 0 }}>{successData.number}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '1rem', borderRadius: '0.75rem', backgroundColor: '#f9fafb' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#666666', textTransform: 'uppercase' }}>Veículo</span>
                <p style={{ fontWeight: '500', color: '#000000', marginTop: '0.25rem' }}>{successData.plate}</p>
              </div>
              <div style={{ padding: '1rem', borderRadius: '0.75rem', backgroundColor: '#f9fafb' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#666666', textTransform: 'uppercase' }}>Motorista</span>
                <p style={{ fontWeight: '500', color: '#000000', marginTop: '0.25rem' }}>{successData.driverName}</p>
              </div>
            </div>
            <div style={{ padding: '1rem', borderRadius: '0.75rem', backgroundColor: '#f9fafb' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#666666', textTransform: 'uppercase' }}>Observação</span>
              <p style={{ fontSize: '0.875rem', color: '#000000', marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{successData.observation}</p>
            </div>
          </div>
          <div className="pt-8 flex flex-col sm:flex-row justify-between gap-4">
            <button
              onClick={async () => {
                const element = document.getElementById('autoalerta-receipt');
                if (!element) return;
                try {
                  const dataUrl = await toPng(element, {
                    cacheBust: true,
                    style: {
                      margin: '0',
                      padding: '2rem'
                    },
                    backgroundColor: '#ffffff',
                    filter: (node) => {
                      if (node instanceof HTMLElement && node.classList.contains('material-symbols-outlined')) {
                        return false;
                      }
                      return true;
                    }
                  });
                  const link = document.createElement('a');
                  link.download = `AutoAlerta_${successData.number}.png`;
                  link.href = dataUrl;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                } catch (err) {
                  console.error(err);
                  window.print();
                }
              }}
              className="flex-1 py-3 px-4 bg-gray-100 text-gray-900 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
            >
              <span className="material-symbols-outlined">print</span>
              Imprimir / PNG
            </button>
            <button
              onClick={async () => {
                const element = document.getElementById('autoalerta-receipt');
                if (!element) return;
                try {
                  const blob = await toBlob(element, {
                    cacheBust: true,
                    backgroundColor: '#ffffff',
                    filter: (node) => {
                      if (node instanceof HTMLElement && node.classList.contains('material-symbols-outlined')) {
                        return false;
                      }
                      return true;
                    }
                  });
                  if (!blob) return;
                  const file = new File([blob], `AutoAlerta_${successData.number}.png`, { type: 'image/png' });
                  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                      title: `AutoAlerta ${successData.number}`,
                      text: `AutoAlerta emitido para o veículo ${successData.plate} pelo motorista ${successData.driverName}.`,
                      files: [file]
                    });
                  } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `AutoAlerta_${successData.number}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }
                } catch (err) {
                  console.error(err);
                  alert('Erro ao compartilhar. A imagem foi baixada em vez disso.');
                }
              }}
              className="flex-1 py-3 px-4 bg-gray-200 text-gray-900 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-300 transition-colors text-sm sm:text-base"
            >
              <span className="material-symbols-outlined">share</span>
              Compartilhar
            </button>
            <button
              onClick={() => {
                setSuccessData(null);
                setObservation("");
                setSelectedVehicle(null);
                setDriverName("");
              }}
              className="flex-1 py-3 px-4 bg-primary text-on-primary rounded-xl font-bold hover:opacity-90 transition-opacity"
            >
              Novo AutoAlerta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-[32px] font-bold text-on-surface tracking-tight mb-2">Novo AutoAlerta</h2>
        <p className="text-on-surface-variant font-medium">Reporte um problema com o seu veículo para a manutenção central de forma rápida e intuitiva.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface-container-lowest border border-outline-variant p-6 rounded-3xl shadow-sm space-y-6">
        {loading ? (
          <div className="py-8 text-center text-on-surface-variant">Carregando formulário...</div>
        ) : (
          <>
            <div className="space-y-2 relative">
              <label className="text-sm font-semibold text-on-surface">Veículo / Placa</label>
              <div 
                className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus-within:border-primary focus-within:ring-1 focus-within:ring-primary flex items-center gap-2 group transition-all cursor-text relative"
              >
                 <span className="material-symbols-outlined text-on-surface-variant group-focus-within:text-primary transition-colors">search</span>
                 <input
                  type="text"
                  placeholder="Digite a placa ou modelo do veículo..."
                  className="bg-transparent border-none outline-none flex-1 font-medium placeholder:font-normal"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    if (!isDropdownOpen) setIsDropdownOpen(true);
                    if (selectedVehicle) {
                       setSelectedVehicle(null);
                       setDriverName("");
                    }
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  onBlur={() => {
                     // Pequeno delay para permitir o clique no item
                     setTimeout(() => setIsDropdownOpen(false), 200);
                  }}
                  required={!selectedVehicle}
                 />
                 {searchTerm && (
                   <button 
                     type="button"
                     onMouseDown={(e) => {
                       // Evita que o onBlur do input seja disparado antes de limparmos o campo
                       e.preventDefault();
                       setSearchTerm("");
                       setSelectedVehicle(null);
                       setDriverName("");
                       setIsDropdownOpen(true);
                     }}
                     className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer text-[20px]"
                     title="Limpar campo"
                   >
                     close
                   </button>
                 )}
              </div>

              {isDropdownOpen && filteredVehicles.length > 0 && (
                <div className="absolute top-[100%] left-0 w-full bg-surface-container-low border border-outline-variant mt-1 rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                   {filteredVehicles.map(v => (
                      <div 
                        key={v.id} 
                        onClick={() => selectVehicleByRecord(v)}
                        className="px-4 py-3 hover:bg-surface-container flex items-center gap-4 cursor-pointer transition-colors border-b border-outline-variant/30 last:border-0"
                      >
                         <div className="w-16 h-16 rounded bg-white border border-outline-variant flex items-center justify-center overflow-hidden flex-shrink-0 p-1">
                            {v.imageUrl ? (
                               <img src={v.imageUrl} alt={v.plate} className="w-full h-full object-contain" />
                            ) : (
                               <span className="material-symbols-outlined text-on-surface-variant/50 text-[20px]">local_shipping</span>
                            )}
                         </div>
                         <div>
                            <div className="font-bold text-on-surface">{v.plate}</div>
                            <div className="text-xs text-on-surface-variant">{v.brand} {v.model}</div>
                         </div>
                      </div>
                   ))}
                </div>
              )}
            </div>

            {selectedVehicle && (
              <div className="flex bg-surface-container p-4 rounded-xl items-center gap-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="w-24 h-24 bg-white rounded-lg overflow-hidden border border-outline-variant flex-shrink-0 flex items-center justify-center p-1">
                  {selectedVehicle.imageUrl ? (
                    <img src={selectedVehicle.imageUrl} alt="Veículo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="material-symbols-outlined text-[32px] text-on-surface-variant text-opacity-50">local_shipping</span>
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-on-surface text-lg">{selectedVehicle.plate}</h4>
                  <p className="text-on-surface-variant text-sm">{selectedVehicle.brand} {selectedVehicle.model}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-on-surface">Nome do Motorista / Operador</label>
              <input
                type="text"
                className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                placeholder="Seu nome completo"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-on-surface">Qual o problema?</label>
              <textarea
                className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[120px]"
                placeholder="Descreva o problema de forma clara..."
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                required
              />
            </div>

            <div className="pt-4 border-t border-outline-variant flex justify-end">
              <button
                type="submit"
                disabled={submitting || !selectedVehicle}
                className="px-6 py-3 bg-error text-white font-bold rounded-xl shadow-lg hover:bg-error/90 transition-colors flex items-center gap-2 group disabled:opacity-50"
              >
                <span className="material-symbols-outlined group-hover:animate-pulse">campaign</span>
                {submitting ? "Enviando..." : "Emitir AutoAlerta"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
