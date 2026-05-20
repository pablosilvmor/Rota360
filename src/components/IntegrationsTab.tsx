import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

export function IntegrationsTab() {
  const [telemetryUrl, setTelemetryUrl] = useState('');
  const [telemetryToken, setTelemetryToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'integrations');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.telemetryUrl) setTelemetryUrl(data.telemetryUrl);
          if (data.telemetryToken) setTelemetryToken(data.telemetryToken);
        }
      } catch (error) {
        console.error("Error fetching integrations:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, 'settings', 'integrations');
      await setDoc(docRef, {
        telemetryUrl,
        telemetryToken,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      alert("Configurações salvas com sucesso!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/integrations');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-on-surface-variant animate-pulse font-bold">Carregando configurações...</div>;
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 p-6 space-y-6">
      <div>
        <h3 className="text-xl font-bold text-on-surface mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">api</span>
          Integração de Telemetria / GPS
        </h3>
        <p className="text-on-surface-variant font-medium text-sm">
          Configure as credenciais e URL da API do provedor (como TicketLog/Edenred ou GPS) para buscar os KMs (Hodômetros) automaticamente.
        </p>
      </div>

      <div className="space-y-4 max-w-2xl bg-surface-container-low p-5 rounded-xl border border-outline-variant/30">
        <div>
          <label className="block text-sm font-bold text-on-surface mb-2">URL Base da API</label>
          <input
            type="text"
            className="w-full bg-white border border-outline-variant rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary transition-all text-sm text-on-surface font-mono"
            value={telemetryUrl}
            onChange={(e) => setTelemetryUrl(e.target.value)}
            placeholder="Ex: https://srv1.ticketlog.com.br/ticketlog-servicos/..."
          />
        </div>
        
        <div>
          <label className="block text-sm font-bold text-on-surface mb-2">Token de Acesso / Auth Key</label>
          <input
            type="password"
            className="w-full bg-white border border-outline-variant rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary transition-all text-sm text-on-surface font-mono"
            value={telemetryToken}
            onChange={(e) => setTelemetryToken(e.target.value)}
            placeholder="Insira o Token, Bearer Token ou Chave da API"
          />
          <p className="text-[11px] text-on-surface-variant mt-1.5 opacity-80 font-bold leading-relaxed px-1">
            Se for HTTP Basic Auth, digite: <code className="bg-surface-container px-1 py-0.5 rounded text-on-surface font-mono">Basic [base64(usuario:senha)]</code>.
            As chaves ficarão gravadas no banco de dados.
          </p>
        </div>

        <div className="pt-4 flex justify-end gap-3 mt-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 uppercase text-sm tracking-wide"
          >
            {isSaving ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-[20px]">save</span>
            )}
            Salvar Configurações
          </button>
        </div>
      </div>
    </div>
  );
}
