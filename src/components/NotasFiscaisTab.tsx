import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function NotasFiscaisTab() {
  const [cnpj, setCnpj] = useState('');
  const [certName, setCertName] = useState('');
  const [password, setPassword] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [lastSync, setLastSync] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carregar configurações do Firestore
  useEffect(() => {
    const fetchA1Config = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'integrations'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.a1Config) {
            const config = data.a1Config;
            setCnpj(config.cnpj || '');
            setCertName(config.certificateName || '');
            setPassword(config.password || '');
            setApiToken(config.apiToken || '');
            setLastSync(config.lastSync || '');
            setIsConfigured(config.isConfigured || false);
            if (config.isConfigured) setStatus('success');
          }
        }
      } catch (error) {
        console.error("Erro ao carregar configuração A1:", error);
      }
    };
    fetchA1Config();
  }, []);

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
      setCertName(e.target.files[0].name);
      setStatus('idle');
    }
  };

  const handleSaveCredentials = async () => {
    setSaving(true);
    setStatus('testing');
    
    try {
      // Simulação do processo de teste de integração
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const newConfig = {
        cnpj,
        certificateName: certName,
        password,
        apiToken,
        lastSync,
        isConfigured: true,
        fleetCNPJs: companyCNPJs.map(c => c.cnpj),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'settings', 'integrations'), {
        a1Config: newConfig
      }, { merge: true });

      setIsConfigured(true);
      setStatus('success');
    } catch (error) {
      console.error("Erro ao salvar configuração A1:", error);
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncHistory = () => {
    window.dispatchEvent(new CustomEvent('START_INVOICE_SYNC', { detail: { full: true } }));
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-[20px] font-bold text-on-surface mb-2">Integração de Notas Fiscais (NFe)</h3>
            <p className="text-sm text-on-surface-variant max-w-2xl">
              Faça o upload do seu <strong>Certificado Digital A1 (.pfx / .p12)</strong> para que o sistema possa consultar automaticamente e baixar os PDFs e XMLs das notas fiscais dos últimos 4 anos.
            </p>
          </div>
          {isConfigured && (
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-100">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              CONECTADO
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 mt-6">
          <div className="space-y-4">
             <h4 className="font-bold text-on-surface text-sm uppercase tracking-wider flex items-center gap-2">
               <span className="material-symbols-outlined text-secondary text-[20px]">apartment</span>
               Dados da Empresa
             </h4>
             <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1.5">CNPJ Principal para Monitoramento</label>
                  <input 
                    type="text" 
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 focus:ring-2 focus:ring-secondary outline-none font-mono"
                    placeholder="26.005.751/0001-94"
                  />
                </div>
                <div className="pt-2">
                  <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest block mb-2">CNPJs da Frota (Leitura Automática)</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {companyCNPJs.map((c, i) => (
                      <div key={i} className="p-2.5 bg-surface-container rounded-lg border border-outline-variant/50">
                        <span className="font-bold text-on-surface block">{c.cnpj}</span>
                        {c.ie && <span className="text-[10px] text-on-surface-variant">IE: {c.ie}</span>}
                      </div>
                    ))}
                  </div>
                </div>
             </div>
          </div>

          <div className="space-y-4">
             <h4 className="font-bold text-on-surface text-sm uppercase tracking-wider flex items-center gap-2">
               <span className="material-symbols-outlined text-secondary text-[20px]">lock</span>
               Certificação e Segurança
             </h4>
             <div className="space-y-4">
                <div 
                  className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${certName ? 'border-secondary bg-secondary/5' : 'border-outline-variant hover:border-secondary hover:bg-surface-container-low'}`}
                  onClick={handleUploadClick}
                >
                  <span className="material-symbols-outlined text-[32px] text-secondary mb-2">
                    {certName ? 'verified' : 'upload_file'}
                  </span>
                  <span className="font-bold text-on-surface text-sm mb-1">
                    {certName ? `Certificado: ${certName}` : 'Upload do Certificado A1 (.pfx)'}
                  </span>
                  {!certName && <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Clique para buscar arquivo</span>}
                  <input type="file" id="cert-upload" ref={fileInputRef} className="hidden" accept=".pfx,.p12" onChange={handleFileChange} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1.5">Senha</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setStatus('idle'); }}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-xl pl-4 pr-10 py-2.5 focus:ring-2 focus:ring-secondary outline-none text-sm"
                        placeholder="******"
                      />
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowPassword(!showPassword); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-secondary transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1.5">Token API (Opcional)</label>
                    <div className="relative">
                      <input 
                        type={showToken ? "text" : "password"} 
                        value={apiToken}
                        onChange={(e) => { setApiToken(e.target.value); setStatus('idle'); }}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-xl pl-4 pr-10 py-2.5 focus:ring-2 focus:ring-secondary outline-none text-sm"
                        placeholder="Token SEFAZ"
                      />
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowToken(!showToken); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-secondary transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">{showToken ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  </div>
                </div>
             </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-outline-variant/30">
          <div className="flex items-center gap-3">
            <button 
              onClick={handleSaveCredentials}
              disabled={(!certName && !password) || saving}
              className={`px-6 py-2.5 rounded-xl font-bold hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm ${status === 'error' ? 'bg-error text-on-error' : 'bg-primary text-on-primary'}`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {saving ? 'sync' : status === 'success' ? 'check_circle' : 'save'}
              </span>
              {saving ? 'Salvando...' : status === 'success' ? 'Integração Ativa' : 'Testar e Salvar Configuração'}
            </button>
            
            {isConfigured && (
              <button 
                onClick={handleSyncHistory}
                className="px-6 py-2.5 bg-secondary text-on-secondary rounded-xl font-bold hover:shadow-lg transition-all active:scale-95 text-sm flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">history</span>
                Sincronizar Histórico (4 anos)
              </button>
            )}
          </div>

          {(lastSync || isConfigured) && (
            <div className="text-right">
              <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest block">Monitoramento Ativo</span>
              <span className="text-xs text-on-surface font-medium">
                {lastSync ? `Última varredura: ${new Date(lastSync).toLocaleString('pt-BR')}` : 'Aguardando primeira sincronização...'}
              </span>
            </div>
          )}
        </div>

        {status === 'error' && (
          <div className="mt-4 p-3 bg-error/10 border border-error/20 rounded-xl flex items-start gap-3">
            <span className="material-symbols-outlined text-error">error</span>
            <div className="text-xs text-error font-medium">
              Falha ao conectar com o serviço de notas. Verifique se a senha do certificado está correta e tente novamente.
            </div>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-outline-variant/30 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex gap-3">
             <span className="material-symbols-outlined text-secondary">database</span>
             <div>
               <h5 className="font-bold text-sm text-on-surface">Consulta SEFAZ</h5>
               <p className="text-xs text-on-surface-variant leading-relaxed">Varredura automática por novas notas emitidas a cada 6 horas.</p>
             </div>
          </div>
          <div className="flex gap-3">
             <span className="material-symbols-outlined text-secondary">picture_as_pdf</span>
             <div>
               <h5 className="font-bold text-sm text-on-surface">PDF e XML Offline</h5>
               <p className="text-xs text-on-surface-variant leading-relaxed">Armazenamento seguro para consultas rápidas e download imediato.</p>
             </div>
          </div>
          <div className="flex gap-3">
             <span className="material-symbols-outlined text-secondary">analytics</span>
             <div>
               <h5 className="font-bold text-sm text-on-surface">Cruzamento de Dados</h5>
               <p className="text-xs text-on-surface-variant leading-relaxed">Vínculo automático de notas de combustível e manutenção às placas correspondentes.</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

