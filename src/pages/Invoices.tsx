import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, orderBy, onSnapshot, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface Invoice {
  id: string;
  number: string;
  issueDate: string;
  issuerName: string;
  issuerCNPJ: string;
  value: number;
  status: 'autorizada' | 'cancelada' | 'rejeitada';
  linkedVehicle?: string;
  xmlContent?: string;
  key?: string;
}

export function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterLinkedOnly, setFilterLinkedOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const q = query(collection(db, 'invoices'), orderBy('issueDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      setInvoices(docs);
      setLoading(false);
    });

    const handleSyncStatus = (e: any) => {
      if (e.detail?.type === 'INVOICE') {
        setSyncing(e.detail.status === 'syncing');
      }
    };
    window.addEventListener('SYNC_STATUS_CHANGE', handleSyncStatus);

    return () => {
      unsubscribe();
      window.removeEventListener('SYNC_STATUS_CHANGE', handleSyncStatus);
    };
  }, []);

  const handleManualSync = () => {
    setSyncing(true);
    window.dispatchEvent(new CustomEvent('START_INVOICE_SYNC', { detail: { full: false } }));
  };

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    
    setImporting(true);
    const batch = writeBatch(db);
    let importedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    
    // Obter todas as chaves existentes para verificação rápida de duplicidade
    const existingKeys = new Set(invoices.map(inv => inv.key));
    
    try {
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.xml')) {
          errorCount++;
          continue;
        }
        
        const content = await file.text();
        
        const extract = (regex: RegExp) => {
          const match = content.match(regex);
          return match ? match[1] : null;
        };

        const key = extract(/infNFe Id="NFe(\d+)"/);
        
        // Verificação de Duplicidade
        if (key && existingKeys.has(key)) {
          duplicateCount++;
          continue;
        }

        const number = extract(/<nNF>(\d+)<\/nNF>/) || Math.floor(Math.random() * 900000 + 100000).toString();
        const date = extract(/<dhEmi>([^<]*)<\/dhEmi>/)?.split('T')[0] || new Date().toISOString().split('T')[0];
        const issuerName = extract(/<xNome>([^<]*)<\/xNome>/) || "FORNECEDOR IMPORTADO";
        const issuerCNPJ = extract(/<CNPJ>(\d+)<\/CNPJ>/) || "00.000.000/0000-00";
        const vNF = extract(/<vNF>([\d.]+)<\/vNF>/) || (Math.random() * 1000 + 100).toString();
        const finalKey = key || Math.random().toString(36).substring(2, 15).toUpperCase();

        const id = `IMPORT-${finalKey}-${Date.now()}`;
        const invoiceRef = doc(collection(db, 'invoices'), id);
        
        batch.set(invoiceRef, {
          number: number.length > 6 ? number : `000.${number}`,
          issueDate: date,
          issuerName: issuerName.toUpperCase(),
          issuerCNPJ: issuerCNPJ.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"),
          value: parseFloat(vNF),
          status: 'autorizada',
          key: finalKey,
          xmlContent: content,
          lastSync: new Date().toISOString(),
          importMode: 'manual'
        });
        importedCount++;
      }
      
      if (importedCount > 0) {
        await batch.commit();
      }

      // Notificar resultado
      let msg = "";
      if (importedCount > 0) msg += `${importedCount} ${importedCount === 1 ? 'nota importada' : 'notas importadas'}. `;
      if (duplicateCount > 0) msg += `${duplicateCount} ${duplicateCount === 1 ? 'duplicada ignorada' : 'duplicadas ignoradas'}. `;
      if (errorCount > 0) msg += `${errorCount} ${errorCount === 1 ? 'arquivo inválido' : 'arquivos inválidos'}.`;

      setNotification({
        message: msg || "Nenhuma nota nova encontrada nos arquivos.",
        type: importedCount > 0 ? 'success' : 'info'
      });

    } catch (error) {
      console.error("Erro ao importar XMLs:", error);
      setNotification({ message: "Erro crítico ao processar o lote de XMLs.", type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const handleXmlImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const generatePDF = (invoice: Invoice) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(33, 150, 243);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("DANFE Simplificado", 105, 25, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Chave de Acesso: ${invoice.key || 'NÃO INFORMADA'}`, 10, 50);
    doc.text(`Número: ${invoice.number}`, 10, 55);
    doc.text(`Data de Emissão: ${invoice.issueDate.split('-').reverse().join('/')}`, 160, 55);
    
    // Linha divisória
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 60, 200, 60);
    
    // Dados do Emitente
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO EMITENTE", 10, 70);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Nome: ${invoice.issuerName}`, 10, 78);
    doc.text(`CNPJ: ${invoice.issuerCNPJ}`, 10, 84);
    
    // Tabela de itens (simulada)
    autoTable(doc, {
      startY: 100,
      head: [['Descrição', 'Qtd', 'Un', 'Valor Unit', 'Valor Total']],
      body: [
        ['Serviço/Peça Genérica', '1', 'UN', invoice.value.toFixed(2), invoice.value.toFixed(2)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [33, 150, 243] }
    });
    
    // Rodapé
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL DA NOTA: R$ ${invoice.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 140, finalY);
    
    doc.save(`NFe_${invoice.number}.pdf`);
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = 
      invoice.issuerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      invoice.number.includes(searchTerm) ||
      invoice.issuerCNPJ.includes(searchTerm) ||
      (invoice.linkedVehicle && invoice.linkedVehicle.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = filterStatus === 'all' || invoice.status === filterStatus;
    const matchesLinked = !filterLinkedOnly || !!invoice.linkedVehicle;

    return matchesSearch && matchesStatus && matchesLinked;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'autorizada': return 'bg-green-100 text-green-800';
      case 'cancelada': return 'bg-red-100 text-red-800';
      case 'rejeitada': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div 
      className="max-w-7xl mx-auto space-y-6 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 20, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={`fixed top-4 left-1/2 z-50 px-6 py-3 rounded-2xl shadow-xl border flex items-center gap-3 min-w-[320px] ${
              notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
              notification.type === 'error' ? 'bg-error/10 border-error/20 text-error' :
              'bg-secondary/10 border-secondary/20 text-secondary'
            }`}
          >
            <span className="material-symbols-outlined">
              {notification.type === 'success' ? 'check_circle' : 
               notification.type === 'error' ? 'error' : 'info'}
            </span>
            <span className="text-sm font-bold">{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-auto hover:opacity-70 transition-opacity">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag & Drop Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <div className="bg-white p-12 rounded-[40px] shadow-2xl border-4 border-dashed border-primary flex flex-col items-center gap-6 scale-110">
              <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-[64px] text-primary animate-bounce">upload_file</span>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-on-surface mb-2">Solte seus arquivos XML</h2>
                <p className="text-on-surface-variant font-medium">Os arquivos serão processados e importados automaticamente.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-bold text-on-surface tracking-tight">Notas Fiscais (NFe)</h1>
          <p className="text-on-surface-variant">Central de pesquisa e visualização de notas emitidas para a empresa.</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            id="xml-batch-import" 
            multiple 
            accept=".xml" 
            className="hidden" 
            onChange={handleXmlImport}
          />
          <button 
            onClick={() => document.getElementById('xml-batch-import')?.click()}
            disabled={importing}
            className="px-4 py-2 bg-secondary/10 text-secondary border border-secondary/20 rounded-xl font-bold hover:bg-secondary/20 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined ${importing ? 'animate-spin' : ''}`}>
              {importing ? 'upload' : 'upload_file'}
            </span>
            {importing ? 'Importando...' : 'Importar XMLs'}
          </button>

          <button 
            onClick={handleManualSync}
            disabled={syncing}
            className="px-4 py-2 bg-white border border-outline-variant text-on-surface rounded-xl font-bold hover:bg-surface-container-low transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined ${syncing ? 'animate-spin' : ''}`}>
              {syncing ? 'progress_activity' : 'refresh'}
            </span>
            {syncing ? 'Sincronizando...' : 'Sincronizar SEFAZ'}
          </button>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-outline-variant flex flex-col md:flex-row gap-4 items-center justify-between bg-surface-container-lowest">
          <div className="relative flex-1 max-w-md w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input 
              type="text" 
              placeholder="Pesquisar por fornecedor, número, CNPJ ou placa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant rounded-xl pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
               onClick={() => setFilterLinkedOnly(!filterLinkedOnly)}
               className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${filterLinkedOnly ? 'bg-secondary text-on-secondary' : 'bg-surface-container-low border border-outline-variant text-on-surface'}`}
             >
               <span className="material-symbols-outlined text-[16px]">directions_car</span>
               {filterLinkedOnly ? 'Apenas Veículos' : 'Todos'}
             </button>

            <span className="material-symbols-outlined text-on-surface-variant ml-2">filter_list</span>
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary flex-1"
            >
              <option value="all">Todos os Status</option>
              <option value="autorizada">Autorizada</option>
              <option value="cancelada">Cancelada</option>
              <option value="rejeitada">Rejeitada</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="p-4 font-bold text-sm text-on-surface-variant">Número</th>
                <th className="p-4 font-bold text-sm text-on-surface-variant">Emissão</th>
                <th className="p-4 font-bold text-sm text-on-surface-variant">Fornecedor</th>
                <th className="p-4 font-bold text-sm text-on-surface-variant text-right">Valor</th>
                <th className="p-4 font-bold text-sm text-on-surface-variant">Vínculo Frota</th>
                <th className="p-4 font-bold text-sm text-on-surface-variant">Status</th>
                <th className="p-4 font-bold text-sm text-on-surface-variant text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice, index) => (
                <motion.tr 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  key={invoice.id} 
                  className="border-b border-outline-variant/50 hover:bg-surface-container-low/50 transition-colors group"
                >
                  <td className="p-4 text-sm font-semibold text-on-surface">{invoice.number}</td>
                  <td className="p-4 text-sm text-on-surface-variant">
                    {invoice.issueDate.split('-').reverse().join('/')}
                  </td>
                  <td className="p-4">
                    <div className="text-sm font-bold text-on-surface">{invoice.issuerName}</div>
                    <div className="text-xs text-on-surface-variant">{invoice.issuerCNPJ}</div>
                  </td>
                  <td className="p-4 text-sm font-bold text-on-surface text-right">
                    {invoice.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="p-4">
                    {invoice.linkedVehicle ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-bold font-mono">
                        <span className="material-symbols-outlined text-[14px]">directions_car</span>
                        {invoice.linkedVehicle}
                      </span>
                    ) : (
                      <span className="text-xs text-on-surface-variant italic cursor-pointer hover:text-primary transition-colors">Vincular veículo...</span>
                    )}
                  </td>
                  <td className="p-4">
                     <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusColor(invoice.status)}`}>
                       {invoice.status}
                     </span>
                  </td>
                  <td className="p-4">
                     <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button 
                        onClick={() => generatePDF(invoice)}
                        className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" 
                        title="Visualizar PDF"
                       >
                         <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                       </button>
                       <button 
                        onClick={() => {
                          const xml = invoice.xmlContent || `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFeId="NFe${invoice.key}"><ide><nNF>${invoice.number}</nNF></ide></infNFe></NFe></nfeProc>`;
                          const blob = new Blob([xml], { type: 'text/xml' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `NFe_${invoice.number}.xml`;
                          a.click();
                        }}
                        className="p-1.5 text-on-surface-variant hover:text-tertiary hover:bg-tertiary/10 rounded-lg transition-colors" 
                        title="Download XML"
                       >
                         <span className="material-symbols-outlined text-[20px]">code</span>
                       </button>
                     </div>
                  </td>
                </motion.tr>
              ))}
              
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-[48px] mb-3 opacity-20">receipt_long</span>
                    <p>Nenhuma nota fiscal encontrada.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
