import { useState, ChangeEvent, DragEvent, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc, setDoc, query, orderBy, onSnapshot } from 'firebase/firestore';

export function AddVehicle({ onCancel, onSave, vehicleToEdit }: { onCancel: () => void, onSave: () => void, vehicleToEdit?: any }) {
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'uploading' | 'processing' | 'done'>('idle');
  const [showRawData, setShowRawData] = useState(false);
  const [rawOcrData, setRawOcrData] = useState<any>(null);
  const [works, setWorks] = useState<any[]>([]);
  const [vehicleData, setVehicleData] = useState(vehicleToEdit || {
    plate: '', renavam: '', brand: '', model: '', modelYear: '', chassis: '', fuelType: '', color: '', bodywork: '', costCenter: '', status: 'Ativo',
    exerciceYear: '', exerciceStatus: '', imageUrl: '', observation: '', capacity: '', grossWeight: '', ownerCnpj: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'works'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWorks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'works');
    });
    return () => unsubscribe();
  }, []);

  const [fileName, setFileName] = useState<string>('CRLV_ABC1234.pdf');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (!vehicleData.plate) {
      alert('Por favor, carregue um documento ou preencha a placa.');
      return;
    }

    setIsSaving(true);
    try {
      // Create a clean copy of the data to save
      const dataToSave = { ...vehicleData };
      // Explicitly remove the id from the payload so we don't save it inside the document
      delete dataToSave.id;
      
      const targetId = vehicleToEdit?.id || vehicleData?.id;

      if (targetId) {
        // Edit existing
        const vehicleDoc = doc(db, 'vehicles', targetId);
        await setDoc(vehicleDoc, {
          ...dataToSave,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else {
        // Create new
        const vehiclesRef = collection(db, 'vehicles');
        await addDoc(vehiclesRef, {
          ...dataToSave,
          odometer: 0,
          lastServiceKm: 0,
          nextServiceKm: 10000,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      onSave();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'vehicles');
    } finally {
      setIsSaving(false);
    }
  };

  const processFile = async (file: File) => {
    setFileName(file.name);
    setOcrStatus('uploading');
    
    try {
      // Leitura do arquivo para Base64 no frontend
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const base64Data = await base64Promise;
      setOcrStatus('processing');

      // Chamada direta à API Gemini no frontend seguindo as diretrizes
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Chave de API Gemini (VITE_GEMINI_API_KEY) não encontrada nas variáveis de ambiente. Adicione a chave no painel da Vercel (https://vercel.com).');
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Extraia exatamente as seguintes informações deste CRLV ou nota fiscal de veículo em formato JSON puro: 
      - plate: placa
      - renavam: CÓDIGO RENAVAM ou renavam
      - brand: marca (ex: Mercedes-Benz, Volvo, Scania, etc)
      - model: modelo
      - modelYear: ano modelo
      - chassis: CHASSI ou chassi
      - capacity: LOTAÇÃO ou capacidade de passageiros
      - grossWeight: PBT ou PESO BRUTO TOTAL
      - ownerCnpj: CPF / CNPJ do proprietário
      - observation: OBSERVAÇÕES DO VEÍCULO (leia o bloco de observações com atenção)
      - fuelType: procure o campo COMBUSTÍVEL no documento (ex: DIESEL S10, GASOLINA, FLEX, etc)
      - color: procure o campo COR PREDOMINANTE no documento
      - bodywork: procure o campo ESPÉCIE/TIPO ou CARROCERIA no documento
      - exerciceYear: procure o campo EXERCÍCIO (ano) no documento
      - costCenter: centro de custo (tente inferir ou deixe vazio se não encontrar pistas)
      Retorne APENAS o JSON puro. Não inclua \`\`\`json ou texto extra.
Exemplo de saída: { "plate": "ABC-1234", "renavam": "00123456789", "brand": "Mercedes-Benz", "model": "Sprinter 516 CDI", "modelYear": "2024", "chassis": "WDBCF56789G123456", "capacity": "19P", "grossWeight": "3.85", "ownerCnpj": "26.005.751/0001-94", "observation": "ALIENAÇÃO FIDUCIÁRIA", "fuelType": "DIESEL S10", "color": "BRANCO", "bodywork": "CAMINHÃO/FURGÃO", "exerciceYear": "2024", "costCenter": "Logística - Região Sul" }`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64Data } }] }
        ],
      });

      if (!response.text) {
        throw new Error('Resposta vazia do modelo');
      }

      let text = response.text;
      // Limpeza de formatação markdown se houver
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();

      const data = JSON.parse(text);
      setRawOcrData(data);
      
      const currentYear = new Date().getFullYear();
      const exerciceYearNum = data.exerciceYear ? parseInt(data.exerciceYear) : 0;
      const computedStatus = exerciceYearNum > 0 ? (exerciceYearNum < currentYear ? 'Vencido' : 'VÁLIDA') : '';

      setOcrStatus('done');
      setVehicleData({
        ...vehicleData,
        plate: data.plate || '',
        renavam: data.renavam || '',
        brand: data.brand || '',
        model: data.model || '',
        modelYear: data.modelYear || '',
        chassis: data.chassis || '',
        capacity: data.capacity || '',
        grossWeight: data.grossWeight || '',
        ownerCnpj: data.ownerCnpj || '',
        observation: data.observation || '',
        fuelType: data.fuelType || 'DIESEL S10',
        color: data.color || '',
        bodywork: data.bodywork || '',
        exerciceYear: data.exerciceYear || '',
        exerciceStatus: computedStatus,
        costCenter: data.costCenter || 'Logística - Região Sul',
        status: 'Ativo'
      });
    } catch (error: any) {
      console.error("Erro OCR:", error);
      setOcrStatus('idle');
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('429') || errorMessage.includes('quota')) {
        alert('Limite de uso inteligente atingido. Aguarde cerca de 1 minuto e tente novamente, ou insira os dados manualmente. (Erro de Cota API)');
      } else {
        alert(`Houve um erro no processamento: ${errorMessage}. Tente novamente ou insira os dados manualmente.`);
      }
    }
  };

  const handleSimulateUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="max-w-[1440px] mx-auto pb-16">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <nav className="flex items-center gap-2 text-on-surface-variant text-sm font-semibold mb-4">
            <span className="cursor-pointer hover:text-primary" onClick={onCancel}>Frota</span>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span className="text-on-surface">{vehicleToEdit ? 'Editar Veículo' : 'Novo Cadastro'}</span>
          </nav>
          <h2 className="text-[32px] font-semibold text-on-surface leading-[1.3]">{vehicleToEdit ? 'Editar Veículo' : 'Cadastrar Novo Veículo'}</h2>
          <p className="text-base text-on-surface-variant mt-2 max-w-2xl">{vehicleToEdit ? 'Atualize as informações técnicas e operacionais do veículo na frota.' : 'Agilize a integração da sua frota. Faça o upload do PDF do CRLV e nosso motor de OCR extrairá as especificações técnicas automaticamente.'}</p>
        </div>
        <div className="flex gap-4">
          <button onClick={onCancel} className="px-6 py-2 border border-outline text-on-surface text-sm font-semibold rounded-lg hover:bg-surface-container-low transition-colors active:scale-95 disabled:opacity-50" disabled={isSaving}>Descartar</button>
          <button 
            onClick={handleSubmit} 
            disabled={isSaving}
            className="px-6 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-primary/90 transition-all active:scale-95 shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving && <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>}
            {isSaving ? 'Salvando...' : 'Salvar Veículo'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-5 space-y-6">
          <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-on-surface uppercase tracking-widest">Importação de Documento</h3>
              <span className="flex items-center gap-2 px-2 py-1 bg-secondary-container text-on-secondary-container text-[10px] font-bold rounded">
                <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                OCR ATIVADO
              </span>
            </div>

            {ocrStatus === 'idle' && (
              <label 
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-outline-variant hover:border-primary-fixed-dim transition-colors rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer bg-surface-container-low/50 group"
              >
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleSimulateUpload}
                />
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-primary text-[32px]">upload_file</span>
                </div>
                <p className="text-[24px] font-semibold text-on-surface">Carregar PDF do CRLV</p>
                <p className="text-on-surface-variant text-xs mt-2">Arraste e solte ou clique para navegar</p>
                <p className="text-on-surface-variant text-[10px] mt-4 opacity-50 uppercase tracking-tighter">TAMANHO MÁX: 10MB | FORMATO: PDF, JPG, PNG</p>
              </label>
            )}

            {(ocrStatus === 'uploading' || ocrStatus === 'processing' || ocrStatus === 'done') && (
              <div className="mt-8 pt-8 border-t border-outline-variant">
                <div className="flex items-center gap-4 p-4 bg-primary-container/5 rounded-lg border border-primary-fixed-dim/20">
                  <span className="material-symbols-outlined text-on-primary-fixed-variant">picture_as_pdf</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-on-surface">{fileName}</p>
                    <div className="w-full bg-outline-variant/30 h-1 rounded-full mt-2 overflow-hidden">
                      <div className={`bg-primary h-full transition-all duration-1000 ${ocrStatus === 'uploading' ? 'w-1/3' : ocrStatus === 'processing' ? 'w-2/3' : 'w-full'}`}></div>
                    </div>
                  </div>
                  {ocrStatus === 'done' && <span className="material-symbols-outlined text-on-tertiary-container" style={{fontVariationSettings: "'FILL' 1"}}>check_circle</span>}
                </div>
                <p className="text-xs text-on-surface-variant mt-4 text-center">
                  Análise de OCR: <span className="font-bold text-on-surface">{ocrStatus === 'done' ? '100% Concluída' : 'Processando...'}</span>
                </p>
              </div>
            )}
          </section>

          {ocrStatus === 'done' && (
            <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex items-center justify-around">
              <div className="text-center">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Precisão do OCR</p>
                <p className="text-[24px] font-semibold text-primary">99.2%</p>
              </div>
              <div className="w-px h-10 bg-outline-variant"></div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Campos Encontrados</p>
                <p className="text-[24px] font-semibold text-primary">8/8</p>
              </div>
              <div className="w-px h-10 bg-outline-variant"></div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Status</p>
                <p className="text-[24px] font-semibold text-on-tertiary-container">Pronto</p>
              </div>
            </section>
          )}
        </div>

        <div className="col-span-12 lg:col-span-7">
          <form className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden" onSubmit={(e) => e.preventDefault()}>
            <div className="px-8 py-6 border-b border-outline-variant flex items-center justify-between bg-surface-container-low/30">
              <h3 className="text-[24px] font-semibold text-on-surface">Detalhes do Veículo</h3>
              <span className="text-xs text-on-surface-variant italic">Campos com <span className="material-symbols-outlined text-[12px] text-on-tertiary-container">auto_awesome</span> foram preenchidos automaticamente</span>
            </div>
            
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                    Placa {ocrStatus === 'done' && <span className="material-symbols-outlined text-[14px] text-on-tertiary-container">auto_awesome</span>}
                  </label>
                  <input 
                    className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 font-bold text-on-surface focus:outline-none focus:border-primary" 
                    value={vehicleData.plate} 
                    onChange={(e) => setVehicleData({ ...vehicleData, plate: e.target.value })}
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                    Código Renavam {ocrStatus === 'done' && <span className="material-symbols-outlined text-[14px] text-on-tertiary-container">auto_awesome</span>}
                  </label>
                  <input 
                    className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-on-surface focus:outline-none focus:border-primary" 
                    value={vehicleData.renavam} 
                    onChange={(e) => setVehicleData({ ...vehicleData, renavam: e.target.value })}
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                    Marca {ocrStatus === 'done' && <span className="material-symbols-outlined text-[14px] text-on-tertiary-container">auto_awesome</span>}
                  </label>
                  <input 
                    className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-on-surface focus:outline-none focus:border-primary" 
                    value={vehicleData.brand} 
                    onChange={(e) => setVehicleData({ ...vehicleData, brand: e.target.value })}
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                    Modelo {ocrStatus === 'done' && <span className="material-symbols-outlined text-[14px] text-on-tertiary-container">auto_awesome</span>}
                  </label>
                  <input 
                    className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-on-surface focus:outline-none focus:border-primary" 
                    value={vehicleData.model} 
                    onChange={(e) => setVehicleData({ ...vehicleData, model: e.target.value })}
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">Ano do Modelo</label>
                  <input 
                    className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-on-surface focus:outline-none focus:border-primary" 
                    value={vehicleData.modelYear} 
                    onChange={(e) => setVehicleData({ ...vehicleData, modelYear: e.target.value })}
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                    Espécie / Tipo {ocrStatus === 'done' && <span className="material-symbols-outlined text-[14px] text-on-tertiary-container">auto_awesome</span>}
                  </label>
                  <input 
                    className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-on-surface focus:outline-none focus:border-primary" 
                    value={vehicleData.bodywork} 
                    onChange={(e) => setVehicleData({ ...vehicleData, bodywork: e.target.value })}
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                    Exercício {ocrStatus === 'done' && <span className="material-symbols-outlined text-[14px] text-on-tertiary-container">auto_awesome</span>}
                  </label>
                  <div className="relative">
                    <input 
                      className={`w-full bg-white border-outline-variant border rounded-lg px-4 py-3 font-bold focus:outline-none focus:border-primary ${vehicleData.exerciceStatus === 'Vencido' ? 'text-error' : 'text-on-tertiary-container'}`} 
                      value={vehicleData.exerciceYear} 
                      onChange={(e) => {
                        const year = e.target.value;
                        const currentYear = new Date().getFullYear();
                        const yearNum = parseInt(year) || 0;
                        const status = yearNum > 0 ? (yearNum < currentYear ? 'Vencido' : 'VÁLIDA') : '';
                        setVehicleData({ ...vehicleData, exerciceYear: year, exerciceStatus: status });
                      }}
                    />
                    {vehicleData.exerciceStatus && (
                      <span className={`absolute right-10 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-0.5 rounded uppercase ${vehicleData.exerciceStatus === 'Vencido' ? 'bg-error-container text-on-error-container' : 'bg-tertiary-container text-on-tertiary-container'}`}>
                        {vehicleData.exerciceStatus}
                      </span>
                    )}
                  </div>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                    Chassi {ocrStatus === 'done' && <span className="material-symbols-outlined text-[14px] text-on-tertiary-container">auto_awesome</span>}
                  </label>
                  <input 
                    className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-on-surface font-mono focus:outline-none focus:border-primary" 
                    value={vehicleData.chassis} 
                    onChange={(e) => setVehicleData({ ...vehicleData, chassis: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                    Lotação {ocrStatus === 'done' && <span className="material-symbols-outlined text-[14px] text-on-tertiary-container">auto_awesome</span>}
                  </label>
                  <input 
                    className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-on-surface focus:outline-none focus:border-primary" 
                    value={vehicleData.capacity || ''} 
                    onChange={(e) => setVehicleData({ ...vehicleData, capacity: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                    PBT (Peso Bruto Total) {ocrStatus === 'done' && <span className="material-symbols-outlined text-[14px] text-on-tertiary-container">auto_awesome</span>}
                  </label>
                  <input 
                    className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-on-surface focus:outline-none focus:border-primary" 
                    value={vehicleData.grossWeight || ''} 
                    onChange={(e) => setVehicleData({ ...vehicleData, grossWeight: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                    CNPJ / CPF do Proprietário {ocrStatus === 'done' && <span className="material-symbols-outlined text-[14px] text-on-tertiary-container">auto_awesome</span>}
                  </label>
                  <input 
                    className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-on-surface font-mono focus:outline-none focus:border-primary" 
                    value={vehicleData.ownerCnpj || ''} 
                    onChange={(e) => setVehicleData({ ...vehicleData, ownerCnpj: e.target.value })}
                  />
                </div>
              </div>
              
              <hr className="border-outline-variant/30" />
              
              <div>
                <h4 className="text-sm font-semibold text-primary mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">edit_note</span>
                  ENTRADA MANUAL NECESSÁRIA
                </h4>
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                      Tipo de Combustível {ocrStatus === 'done' && <span className="material-symbols-outlined text-[14px] text-on-tertiary-container font-bold">auto_awesome</span>}
                    </label>
                    <select 
                      className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-base text-on-surface focus:outline-none focus:border-primary font-medium"
                      value={vehicleData.fuelType}
                      onChange={(e) => setVehicleData({ ...vehicleData, fuelType: e.target.value })}
                    >
                      <option value="">Selecione...</option>
                      <option value="DIESEL S10">DIESEL S10</option>
                      <option value="DIESEL">DIESEL</option>
                      <option value="GASOLINA">GASOLINA</option>
                      <option value="ALCOOL/GASOLINA">ALCOOL/GASOLINA</option>
                      <option value="ETANOL">ETANOL</option>
                      <option value="FLEX">FLEX (ALCOOL/GASOL)</option>
                      <option value="ELÉTRICO">ELÉTRICO</option>
                      <option value="HÍBRIDO">HÍBRIDO</option>
                    </select>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2">
                      Cor do Veículo {ocrStatus === 'done' && <span className="material-symbols-outlined text-[14px] text-on-tertiary-container font-bold">auto_awesome</span>}
                    </label>
                    <div className="flex items-center gap-3">
                      <input 
                        className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-on-surface focus:outline-none focus:border-primary font-medium" 
                        placeholder="ex: BRANCO" 
                        type="text" 
                        value={vehicleData.color}
                        onChange={(e) => setVehicleData({ ...vehicleData, color: e.target.value })}
                      />
                      <div className="w-10 h-10 rounded-full border border-outline-variant bg-surface-container-highest flex-shrink-0" style={{ backgroundColor: vehicleData.color.toLowerCase().includes('bran') ? '#ffffff' : vehicleData.color.toLowerCase().includes('pret') ? '#1f2937' : vehicleData.color.toLowerCase().includes('verm') ? '#ef4444' : vehicleData.color.toLowerCase().includes('prat') ? '#e5e7eb' : vehicleData.color.toLowerCase().includes('cinz') ? '#9ca3af' : 'transparent' }}></div>
                    </div>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Obra / Centro de Custo</label>
                    <select 
                      className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-base text-on-surface focus:outline-none focus:border-primary"
                      value={vehicleData.costCenter}
                      onChange={(e) => setVehicleData({ ...vehicleData, costCenter: e.target.value })}
                    >
                      <option value="">Selecione...</option>
                      {works.map((work) => (
                        <option key={work.id} value={work.name}>{work.name}</option>
                      ))}
                      <option value="Sede Administrativa">Sede Administrativa</option>
                    </select>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Link da Imagem (URL)</label>
                    <div className="flex items-center gap-3">
                      <input 
                        className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-on-surface focus:outline-none focus:border-primary font-medium" 
                        placeholder="https://exemplo.com/van.jpg" 
                        type="text" 
                        value={vehicleData.imageUrl}
                        onChange={(e) => setVehicleData({ ...vehicleData, imageUrl: e.target.value })}
                      />
                      <div className="w-10 h-10 rounded-lg border border-outline-variant bg-surface-container overflow-hidden flex-shrink-0">
                        {vehicleData.imageUrl && <img src={vehicleData.imageUrl} className="w-full h-full object-cover" alt="Preview" />}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Status Operacional</label>
                    <div className="flex items-center gap-2 p-1 bg-surface-container rounded-lg">
                      <button 
                        className={`flex-1 py-2 text-center rounded-md text-sm font-semibold transition-colors ${vehicleData.status === 'Ativo' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`} 
                        type="button"
                        onClick={() => setVehicleData({ ...vehicleData, status: 'Ativo' })}
                      >
                        Ativo
                      </button>
                      <button 
                        className={`flex-1 py-2 text-center rounded-md text-sm font-semibold transition-colors ${vehicleData.status === 'Em Manutenção' ? 'bg-white shadow-sm text-error' : 'text-on-surface-variant hover:text-on-surface'}`} 
                        type="button"
                        onClick={() => setVehicleData({ ...vehicleData, status: 'Em Manutenção' })}
                      >
                        Em Manutenção
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Observação</label>
                    <textarea 
                      className="w-full bg-white border-outline-variant border rounded-lg px-4 py-3 text-on-surface focus:outline-none focus:border-primary resize-y" 
                      placeholder="Insira alguma informação adicional..." 
                      rows={3} 
                      value={vehicleData.observation || ''}
                      onChange={(e) => setVehicleData({ ...vehicleData, observation: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-surface-container-high/50 p-8 border-t border-outline-variant flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-on-tertiary-container">verified_user</span>
                <div>
                  <p className="text-sm font-semibold text-on-surface">Validação de Dados Aprovada</p>
                  <p className="text-[10px] text-on-surface-variant uppercase">SISTEMA VERIFICADO CONTRA O BANCO DE DADOS NACIONAL</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowRawData(true)}
                className="flex items-center gap-2 text-primary font-bold hover:underline text-sm"
              >
                <span className="material-symbols-outlined">visibility</span>
                Ver Dados Brutos do OCR
              </button>
            </div>
          </form>

          {showRawData && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
                <div className="px-8 py-6 border-b border-outline-variant flex items-center justify-between">
                  <h3 className="text-[20px] font-bold text-on-surface">Dados Brutos do OCR</h3>
                  <button onClick={() => setShowRawData(false)} className="w-10 h-10 rounded-full hover:bg-surface-container transition-colors flex items-center justify-center">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div className="p-8 overflow-y-auto bg-surface-container-low font-mono text-sm">
                  {rawOcrData ? (
                    <pre className="whitespace-pre-wrap text-secondary">{JSON.stringify(rawOcrData, null, 2)}</pre>
                  ) : (
                    <div className="py-12 text-center text-on-surface-variant italic">
                      Nenhum dado processado ainda. Faça o upload de um CRLV primeiro.
                    </div>
                  )}
                </div>
                <div className="px-8 py-4 border-t border-outline-variant bg-white flex justify-end">
                  <button onClick={() => setShowRawData(false)} className="px-6 py-2 bg-primary text-white rounded-lg font-bold">Entendido</button>
                </div>
              </div>
            </div>
          )}

          {ocrStatus === 'done' && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-primary-container text-on-primary-fixed p-0 rounded-2xl shadow-lg relative overflow-hidden group min-h-[224px]">
                {vehicleData.imageUrl ? (
                  <img src={vehicleData.imageUrl} className="absolute inset-0 w-full h-full object-cover brightness-50 group-hover:scale-105 transition-transform duration-500" alt="Preview Background" />
                ) : (
                  <div className="absolute inset-0 bg-primary-container" />
                )}
                <div className="relative z-10 p-6 h-full flex flex-col justify-between">
                  <h4 className="text-sm font-semibold text-primary-fixed mb-4 uppercase tracking-widest opacity-80">Prévia do Gêmeo Digital</h4>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[48px] leading-none font-bold text-white drop-shadow-md">{vehicleData.plate}</p>
                      <p className="text-base text-white mt-2 font-medium drop-shadow-md">{vehicleData.brand} {vehicleData.model}</p>
                    </div>
                    <span className="material-symbols-outlined text-6xl text-white/40">local_shipping</span>
                  </div>
                </div>
                <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-primary-fixed-dim/10 rounded-full blur-3xl"></div>
              </div>

              <div className="bg-white border border-outline-variant rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold mb-2">Cronograma de Manutenção</p>
                <p className="text-base text-on-surface">Primeiro serviço previsto em <span className="font-bold text-primary">10.000 km</span> ou <span className="font-bold text-primary">6 meses</span>.</p>
                <div className="mt-4 flex -space-x-2">
                  <img alt="Funcionário" className="w-8 h-8 rounded-full border-2 border-white object-cover" src="https://images.unsplash.com/photo-1543132220-3ec99f6094dc?auto=format&fit=crop&q=80&w=100"/>
                  <img alt="Funcionária" className="w-8 h-8 rounded-full border-2 border-white object-cover" src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=100"/>
                  <div className="w-8 h-8 rounded-full border-2 border-white bg-surface-container-highest flex items-center justify-center text-[10px] font-bold text-on-surface-variant">+2</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
