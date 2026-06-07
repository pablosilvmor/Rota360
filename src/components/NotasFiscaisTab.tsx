import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';

export function NotasFiscaisTab() {
  const [certFile, setCertFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CNPJs fixos da empresa solicitados
  const companyCNPJs = [
    { cnpj: '26.005.751/0001-94', ie: '0629795270043' },
    { cnpj: '26.005.751/0011-66', ie: '' }
  ];

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCertFile(e.target.files[0]);
      setStatus('idle');
    }
  };

  const handleDownloadCert = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (certFile) {
      const url = URL.createObjectURL(certFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = certFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleSaveCredentials = () => {
    setSaving(true);
    setStatus('testing');
    // Simulação do processo de teste de integração
    setTimeout(() => {
      setSaving(false);
      // Simulação de erro se a senha for "erro" ou tentar pela primeira vez pra mostrar a funcionalidade
      if (password.toLowerCase() === 'erro') {
        setStatus('error');
      } else {
        setStatus('success');
      }
    }, 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm p-6">
        <h3 className="text-[20px] font-bold text-on-surface mb-2">Integração de Notas Fiscais (NFe)</h3>
        <p className="text-sm text-on-surface-variant mb-6">
          Faça o upload do seu <strong>Certificado Digital A1 (.pfx / .p12)</strong> para que o sistema possa consultar automaticamente e baixar os PDFs e XMLs das notas fiscais emitidas contra os CNPJs da sua empresa, permitindo cruzar os gastos por placa de veículo.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
             <h4 className="font-bold text-on-surface text-sm mb-4">CNPJs Monitorados</h4>
             <ul className="space-y-3">
               {companyCNPJs.map((c, i) => (
                 <li key={i} className="p-3 bg-surface-container-low rounded-xl border border-outline-variant flex flex-col">
                   <span className="font-bold text-on-surface">{c.cnpj}</span>
                   {c.ie && <span className="text-xs text-on-surface-variant">Inscrição Estadual: {c.ie}</span>}
                 </li>
               ))}
             </ul>
          </div>

          <div className="space-y-4">
             <h4 className="font-bold text-on-surface text-sm">Upload do Certificado A1</h4>
             <div 
               className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${certFile ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary hover:bg-surface-container-low'}`}
               onClick={handleUploadClick}
             >
               <span className="material-symbols-outlined text-[32px] text-primary mb-2">
                 {certFile ? 'verified' : 'upload_file'}
               </span>
               <span className="font-bold text-on-surface text-sm mb-2">
                 {certFile ? `Certificado: ${certFile.name}` : 'Clique para selecionar o certificado A1 (.pfx ou .p12)'}
               </span>
               {certFile && (
                 <button 
                   onClick={handleDownloadCert}
                   className="text-primary hover:text-primary/80 font-semibold text-xs flex items-center gap-1 border border-primary/20 bg-white px-3 py-1.5 rounded-full"
                 >
                   <span className="material-symbols-outlined text-[16px]">download</span>
                   Baixar Certificado
                 </button>
               )}
               <input type="file" id="cert-upload" ref={fileInputRef} className="hidden" accept=".pfx,.p12" onChange={handleFileChange} />
             </div>

             <div className="space-y-4 pt-2">
                <div className="relative">
                 <label className="text-sm font-semibold text-on-surface-variant block mb-1">Senha do Certificado</label>
                 <div className="relative">
                   <input 
                     type={showPassword ? "text" : "password"} 
                     value={password}
                     onChange={(e) => { setPassword(e.target.value); setStatus('idle'); }}
                     className="w-full bg-surface-container-low border border-outline-variant rounded-xl pl-4 pr-12 py-3 focus:ring-2 focus:ring-primary outline-none"
                     placeholder="******"
                   />
                   <button 
                     type="button"
                     onClick={(e) => { e.stopPropagation(); setShowPassword(!showPassword); }}
                     className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
                   >
                     <span className="material-symbols-outlined">{showPassword ? 'visibility_off' : 'visibility'}</span>
                   </button>
                 </div>
               </div>
               
               <div className="relative">
                 <label className="text-sm font-semibold text-on-surface-variant block mb-1">Token da API (SEFAZ / Integrador)</label>
                 <div className="relative">
                   <input 
                     type={showToken ? "text" : "password"} 
                     value={apiToken}
                     onChange={(e) => { setApiToken(e.target.value); setStatus('idle'); }}
                     className="w-full bg-surface-container-low border border-outline-variant rounded-xl pl-4 pr-12 py-3 focus:ring-2 focus:ring-primary outline-none"
                     placeholder="Cole a chave de acesso da API"
                   />
                   <button 
                     type="button"
                     onClick={(e) => { e.stopPropagation(); setShowToken(!showToken); }}
                     className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
                   >
                     <span className="material-symbols-outlined">{showToken ? 'visibility_off' : 'visibility'}</span>
                   </button>
                 </div>
               </div>

               {status === 'success' && (
                 <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-700 text-sm font-medium">
                   <span className="material-symbols-outlined">check_circle</span>
                   Integração concluída com sucesso! Sistema conectado à SEFAZ.
                 </div>
               )}

               {status === 'error' && (
                 <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex flex-col gap-1 text-red-700 text-sm font-medium">
                   <div className="flex items-center gap-2">
                     <span className="material-symbols-outlined text-[20px]">error</span>
                     Falha na autenticação
                   </div>
                   <span className="text-xs text-red-600 font-normal pl-7">
                     A senha ou token fornecido é inválido ou o certificado está corrompido. Revise os dados e tente novamente.
                   </span>
                 </div>
               )}

               <button 
                onClick={handleSaveCredentials}
                disabled={(!certFile && !password) || saving}
                className={`w-full px-4 py-3 rounded-xl font-bold hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 ${status === 'error' ? 'bg-red-600 text-white' : 'bg-primary text-on-primary'}`}
               >
                 {saving ? 'Testando Conexão...' : status === 'success' ? 'Integração Ativa' : status === 'error' ? 'Tentar Novamente' : 'Testar Integração e Salvar'}
               </button>
             </div>
          </div>
        </div>

        <div className="bg-tertiary-container/30 border border-tertiary/20 p-4 rounded-xl flex items-start gap-3">
          <span className="material-symbols-outlined text-tertiary mt-0.5">info</span>
          <div className="text-sm text-on-surface">
            <strong className="block text-tertiary mb-1">Como funciona o cruzamento de gastos?</strong>
            Após a ativação, o sistema buscará os XMLs no portal da SEFAZ regularmente. Notas referentes a serviços de manutenção urbana, peças ou combustíveis poderão ser atreladas às placas da frota vinculando ao centro de custos da respectiva obra e veículo, gerando o PDF detalhado da NFe dentro do lançamento do relatório de gastos.
          </div>
        </div>
      </div>
    </div>
  );
}
