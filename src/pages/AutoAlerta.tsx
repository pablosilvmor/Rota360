import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import html2canvas from "html2canvas";

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

  useEffect(() => {
    fetchData();
  }, []);

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

  const selectVehicleByRecord = (vehicle: any) => {
    setSelectedVehicle(vehicle);
    setSearchTerm(`${vehicle.plate} ${vehicle.model ? `- ${vehicle.model}` : ""}`);
    setIsDropdownOpen(false);

    // Encontra o motorista atribuído
    const assignedDriver = drivers.find(d => 
      Array.isArray(d.vehicleAssigned) 
        ? d.vehicleAssigned.includes(vehicle.plate) 
        : d.vehicleAssigned === vehicle.plate
    );

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
        <div id="autoalerta-receipt" className="bg-surface-container-lowest border border-outline-variant p-8 rounded-3xl shadow-sm space-y-6">
          <div className="flex flex-col items-center justify-center text-center space-y-4 border-b border-outline-variant pb-6">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-[32px]">campaign</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-on-surface">AutoAlerta Emitido</h2>
              <p className="text-on-surface-variant">Seu reporte foi enviado com sucesso.</p>
            </div>
            <div className="bg-surface-container py-2 px-6 rounded-lg">
              <span className="text-sm font-medium text-on-surface-variant">Nº do Pedido</span>
              <p className="text-xl font-mono font-bold text-primary">{successData.number}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container-low p-4 rounded-xl">
                <span className="text-xs font-semibold text-on-surface-variant uppercase">Veículo</span>
                <p className="font-medium text-on-surface mt-1">{successData.plate}</p>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl">
                <span className="text-xs font-semibold text-on-surface-variant uppercase">Motorista</span>
                <p className="font-medium text-on-surface mt-1">{successData.driverName}</p>
              </div>
            </div>
            <div className="bg-surface-container-low p-4 rounded-xl">
              <span className="text-xs font-semibold text-on-surface-variant uppercase">Observação</span>
              <p className="text-sm text-on-surface mt-2 whitespace-pre-wrap">{successData.observation}</p>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row justify-between gap-4">
            <button
              onClick={() => window.print()}
              className="flex-1 py-3 px-4 bg-surface-container text-on-surface rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined">print</span>
              Imprimir / PDF
            </button>
            <button
              onClick={async () => {
                const element = document.getElementById('autoalerta-receipt');
                if (!element) return;
                try {
                  const canvas = await html2canvas(element, { scale: 2, useCORS: true, allowTaint: true });
                  canvas.toBlob(async (blob) => {
                    if (!blob) return;
                    
                    const fallbackDownload = () => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `AutoAlerta_${successData.number}.png`;
                      a.click();
                      URL.revokeObjectURL(url);
                    };

                    const file = new File([blob], `AutoAlerta_${successData.number}.png`, { type: 'image/png' });
                    
                    try {
                      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                          title: `AutoAlerta ${successData.number}`,
                          text: `AutoAlerta emitido para o veículo ${successData.plate} pelo motorista ${successData.driverName}.`,
                          files: [file]
                        });
                      } else if (navigator.clipboard && navigator.clipboard.write) {
                        try {
                           await navigator.clipboard.write([
                             new ClipboardItem({ 'image/png': blob })
                           ]);
                           alert('Imagem copiada para a área de transferência!');
                        } catch(clipErr) {
                           fallbackDownload();
                        }
                      } else {
                        fallbackDownload();
                      }
                    } catch (shareErr: any) {
                      if (shareErr.name === 'NotAllowedError' || shareErr.name === 'DataError') {
                        // O usuário cancelou ou o iframe bloqueou, tenta a área de transferência
                        try {
                          await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': blob })
                          ]);
                          alert('Imagem copiada para a área de transferência!');
                        } catch(clipErr) {
                           fallbackDownload();
                        }
                      } else {
                        console.error('Erro no navigator.share:', shareErr);
                      }
                    }
                  }, 'image/png');
                } catch (err) {
                  console.error('Erro ao gerar imagem:', err);
                  alert('Erro ao processar imagem para compartilhamento. Verifique se o navegador permite compartilhamento.');
                }
              }}
              className="flex-1 py-3 px-4 bg-surface-container text-on-surface rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-surface-container-high transition-colors text-sm sm:text-base"
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
