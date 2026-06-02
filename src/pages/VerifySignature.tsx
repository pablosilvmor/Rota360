import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'framer-motion';

export function VerifySignature() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [signature, setSignature] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSignature = async () => {
      try {
        if (!id) throw new Error('ID da assinatura não fornecido.');
        
        const sigDoc = await getDoc(doc(db, 'signatures', id));
        if (sigDoc.exists()) {
          setSignature({ id: sigDoc.id, ...sigDoc.data() });
        } else {
          setError('Assinatura não encontrada ou inválida.');
        }
      } catch (e: any) {
        setError(e.message || 'Erro ao buscar dados da assinatura.');
      } finally {
        setLoading(false);
      }
    };

    fetchSignature();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface py-12 px-4 flex items-center justify-center" style={{fontFamily: 'Inter, sans-serif'}}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-surface-container-lowest rounded-3xl shadow-xl overflow-hidden border border-outline-variant/30 relative"
      >
        <div className="absolute top-0 left-0 right-0 h-2 bg-primary"></div>
        
        <div className="p-8 pb-6 text-center border-b border-outline-variant/30 flex flex-col items-center">
          <div className="flex justify-center items-center mb-4">
             <div className="w-24 h-24 flex items-center justify-center">
               <img src="https://i.imgur.com/1DaE4Bm.png" alt="Logo ROTA 360" className="w-20 h-20 object-contain" />
             </div>
          </div>
          <h2 className="text-2xl font-bold text-on-surface tracking-tight" style={{fontFamily: 'Space Grotesk, sans-serif'}}>ROTA 360</h2>
          <p className="mt-1 text-sm font-medium text-on-surface-variant uppercase tracking-widest">Documento Digital</p>
          <div className="mt-4 p-3 bg-surface-container rounded-lg text-left w-full text-xs text-on-surface-variant">
             <p className="font-bold text-on-surface">Emitente:</p>
             <p>{signature.signerName || 'Usuário'}</p>
             <p className="truncate">{signature.signerEmail || 'Não informado'}</p>
          </div>
        </div>

        {error ? (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-error-container rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-error text-[32px]">error</span>
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2">Autenticação Falhou</h3>
            <p className="text-on-surface-variant font-medium">{error}</p>
          </div>
        ) : signature ? (
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-center gap-2 text-emerald-600 mb-2">
              <span className="material-symbols-outlined text-[28px]">check_circle</span>
              <span className="font-bold tracking-wide">ASSINATURA AUTÊNTICA</span>
            </div>
            
            <div className="space-y-4">
              <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/50">
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mb-1">Documento</p>
                <p className="font-bold text-on-surface">{signature.documentTitle}</p>
                <p className="text-xs border text-on-surface-variant inline-block mt-2 px-2 py-0.5 rounded uppercase tracking-wider font-semibold border-outline-variant/50 bg-white">
                  {signature.documentType}
                </p>
              </div>

              <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/50">
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mb-1">Assinatura</p>
                <p className="font-bold text-on-surface">{signature.signatureInfo?.fullName || signature.signerName}</p>
                <p className="text-sm font-medium text-on-surface-variant">{signature.signerEmail}</p>
                
                {signature.signatureInfo && (
                  <div className="mt-2 space-y-1 text-xs text-on-surface-variant">
                    <p><span className="font-semibold text-on-surface">Matrícula:</span> {signature.signatureInfo.matricula}</p>
                    <p><span className="font-semibold text-on-surface">CPF:</span> {signature.signatureInfo.cpf}</p>
                    <p><span className="font-semibold text-on-surface">Cargo:</span> {signature.signatureInfo.role}</p>
                    <p><span className="font-semibold text-on-surface">Empresa:</span> {signature.signatureInfo.company}</p>
                  </div>
                )}
                
                <div className="mt-4 pt-4 border-t border-outline-variant/30 text-xs text-on-surface-variant font-medium">
                  Validado por conta ROTA 360 autenticada.
                </div>
              </div>

              <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/50">
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mb-1">Data e Hora Registro</p>
                <p className="font-bold text-on-surface">{new Date(signature.timestamp).toLocaleString('pt-BR')}</p>
              </div>

              <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/50">
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mb-1">Código de Autenticidade</p>
                <p className="font-mono text-xs font-bold text-on-surface-variant break-all">{signature.id}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="bg-surface-container-low px-8 py-6 flex items-center justify-center text-center">
           <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider">Validado via ROTA 360 - Hub Cloud</p>
        </div>
      </motion.div>
    </div>
  );
}
