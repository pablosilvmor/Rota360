import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, orderBy, onSnapshot, where, writeBatch, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { auditDelete, logAudit } from '../lib/audit';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { useAuth } from '../contexts/AuthContext';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { useNavigate } from 'react-router';
import { createSignature, getQRCodeDataUrl, generateVerificationUrl } from '../utils/pdfSignature';
import { PrivateValue, usePrivacy } from '../contexts/PrivacyContext';

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
  importId?: string;
  importDate?: string;
}

const extractXmlTag = (xml: string, tag: string) => {
  const tagRegex = new RegExp(`<${tag}>((?:.|\\s)*?)</${tag}>`);
  const val = xml.match(tagRegex);
  return val ? val[1] : '';
};

const getInvoiceItems = (xmlContent?: string, defaultValue: number = 0) => {
  const defaultItems = [{
      xProd: 'Serviço/Peça Genérica',
      qCom: '1.0000',
      uCom: 'UN',
      vUnCom: defaultValue.toFixed(2),
      vProd: defaultValue.toFixed(2),
  }];

  if (!xmlContent) {
     return defaultItems;
  }
  
  const items = [];
  const regex = /<det nItem="\d+">([\s\S]*?)<\/det>/g;
  let match;
  while ((match = regex.exec(xmlContent)) !== null) {
    const detXml = match[1];
    items.push({
      xProd: extractXmlTag(detXml, 'xProd') || 'Serviço/Peça Genérica',
      qCom: extractXmlTag(detXml, 'qCom') || '1.0000',
      uCom: extractXmlTag(detXml, 'uCom') || 'UN',
      vUnCom: extractXmlTag(detXml, 'vUnCom') || '0.00',
      vProd: extractXmlTag(detXml, 'vProd') || '0.00',
    });
  }
  return items.length > 0 ? items : defaultItems;
};

export function Invoices() {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const { isPrivacyMode } = usePrivacy();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterLinkedOnly, setFilterLinkedOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [originalHadNoPlate, setOriginalHadNoPlate] = useState(false);
  const [activeTab, setActiveTab] = useState<'invoices' | 'history' | 'draft'>('invoices');
  const [importHistory, setImportHistory] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Invoice[]>([]);
  const [copyAnimationState, setCopyAnimationState] = useState<{ active: boolean, invoiceNumber?: string } | null>(null);
  const invoicePreviewRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isPanDragging, setIsPanDragging] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ left: 0, top: 0 });
  
  const handlePanMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsPanDragging(true);
    setPanStart({ x: e.pageX, y: e.pageY });
    setScrollStart({
      left: scrollContainerRef.current.scrollLeft,
      top: scrollContainerRef.current.scrollTop
    });
  };

  const handlePanMouseMove = (e: React.MouseEvent) => {
    if (!isPanDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - panStart.x;
    const y = e.pageY - panStart.y;
    scrollContainerRef.current.scrollLeft = scrollStart.left - x;
    scrollContainerRef.current.scrollTop = scrollStart.top - y;
  };

  const handlePanMouseUp = () => {
    setIsPanDragging(false);
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);
  const [filterMonth, setFilterMonth] = useLocalStorageState('invoice_filterMonth', 'Todos');
  const [filterYear, setFilterYear] = useLocalStorageState('invoice_filterYear', 'Todos');
  const [filterStartDate, setFilterStartDate] = useLocalStorageState('invoice_filterStartDate', '');
  const [filterEndDate, setFilterEndDate] = useLocalStorageState('invoice_filterEndDate', '');

  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [columnFilters, setColumnFilters] = useLocalStorageState('invoice_columnFilters', {} as Record<string, string[]>);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState('');

  const handleMassDelete = async () => {
    if (selectedInvoices.length === 0) return;
    const targetCollection = activeTab === 'draft' ? 'invoice_drafts' : 'invoices';
    
    setConfirmMassDelete(false);
    setSyncing(true);
    try {
      console.log(`Iniciando exclusão em massa de ${selectedInvoices.length} itens da coleção ${targetCollection}`);
      const batch = writeBatch(db);
      
      // Obter dados para auditoria antes de deletar
      const auditPromises = selectedInvoices.map(id => getDoc(doc(db, targetCollection, id)));
      const snapshots = await Promise.all(auditPromises);
      
      for (const snapshot of snapshots) {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const id = snapshot.id;
          batch.delete(doc(db, targetCollection, id));
          
          // Registrar auditoria em segundo plano (não bloqueante para o batch)
          logAudit('DELETE', 'Notas Fiscais (Massa)', targetCollection, id, data).catch(err => 
            console.warn(`Erro ao auditar exclusão de ${id}:`, err)
          );
        }
      }
      
      await batch.commit();
      console.log('Exclusão em massa concluída com sucesso');
      
      setNotification({ message: `${selectedInvoices.length} notas excluídas com sucesso!`, type: 'success' });
      setSelectedInvoices([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, targetCollection);
      console.error('Erro ao excluir em massa:', error);
      setNotification({ message: 'Erro de permissão ou conexão ao excluir notas.', type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const handleCopyToDraft = async (invoice: Invoice) => {
    try {
      const draftId = `DRAFT-${invoice.id}`;
      const draftRef = doc(db, 'invoice_drafts', draftId);
      
      const draftData = {
        ...invoice,
        id: draftId,
        originalId: invoice.id,
        isDraft: true,
        importDate: new Date().toISOString()
      };

      await writeBatch(db).set(draftRef, draftData).commit();
      
      setCopyAnimationState({ active: true, invoiceNumber: invoice.number });
      setTimeout(() => setCopyAnimationState(null), 1800);
      
      setNotification({ message: 'Nota copiada para o rascunho!', type: 'success' });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'invoice_drafts');
      console.error('Erro ao copiar para rascunho:', error);
      const errorMsg = error.code === 'permission-denied' 
        ? 'Erro de permissão ao salvar rascunho.' 
        : 'Erro ao copiar nota.';
      setNotification({ message: errorMsg, type: 'error' });
    }
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterLinkedOnly(false);
    setFilterMonth('Todos');
    setFilterYear('Todos');
    setFilterStartDate('');
    setFilterEndDate('');
    setColumnFilters({});
    setCurrentPage(1);
  };

  const handleTabChange = (tab: 'invoices' | 'history' | 'draft') => {
    setActiveTab(tab);
    setSelectedInvoices([]);
    setCurrentPage(1);
    setSearchTerm('');
  };

  const handleDeleteImport = async (importId: string) => {
    setConfirmDeleteImportId(null);
    setSyncing(true);
    try {
      const batch = writeBatch(db);
      const importedInvoices = invoices.filter(inv => inv.importId === importId);
      for (const inv of importedInvoices) {
        batch.delete(doc(db, 'invoices', inv.id));
      }
      batch.delete(doc(db, 'invoice_imports', importId));
      await batch.commit();
      setNotification({ message: 'Importação e notas associadas excluídas.', type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'invoice_imports');
      console.error('Erro ao excluir importação:', error);
      setNotification({ message: 'Erro ao excluir importação.', type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const ColumnFilter = ({ columnId, label }: { columnId: string, label: string }) => {
    const uniqueValues = React.useMemo(() => {
      const vals = new Set<string>();
      invoices.forEach(r => {
        let v = '';
        if (columnId === 'issueDate') v = r.issueDate ? new Date(r.issueDate).toLocaleDateString('pt-BR') : '';
        else if (columnId === 'value') v = r.value ? r.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00';
        else if (columnId === 'number') v = String(r.number || '');
        else if (columnId === 'issuerName') v = r.issuerName || '';
        else if (columnId === 'status') v = r.status || '';
        else if (columnId === 'linkedVehicle') v = r.linkedVehicle || 'Não vinculado';
        else v = String((r as any)[columnId] || '');
        if (v) vals.add(v);
      });
      return Array.from(vals).sort();
    }, [columnId, invoices]);

    const filteredValues = filterSearch 
      ? uniqueValues.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
      : uniqueValues;

    if (openFilter !== columnId) return (
      <button onClick={(e) => { e.stopPropagation(); setOpenFilter(columnId); setFilterSearch(''); }} className="ml-1 p-1 hover:bg-black/5 rounded-full transition-colors leading-none">
        <span className={`material-symbols-outlined text-[16px] ${columnFilters[columnId]?.length ? 'text-primary' : 'text-on-surface-variant/30'}`}>filter_alt</span>
      </button>
    );

    return (
      <div className={`absolute top-full ${(label === 'Status' || label === 'Vínculo' || label === 'Valor' || label === 'Fornecedor' || label === 'Ações') ? 'right-0' : 'left-0'} mt-2 z-[1000] w-72 bg-white rounded-2xl shadow-2xl border border-outline-variant p-4 animate-in fade-in zoom-in-95 duration-200 shadow-surface-variant/20`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold text-on-surface">Filtrar {label}</h4>
          <button onClick={() => setOpenFilter(null)} className="p-1 hover:bg-surface-container rounded-full leading-none">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        
        <div className="relative mb-4">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">search</span>
          <input 
            type="text"
            autoFocus
            placeholder="Buscar valor..."
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            className="w-full bg-white dark:bg-surface-container border border-outline-variant rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="max-h-48 overflow-y-auto mb-4 space-y-1 custom-scrollbar">
          {filteredValues.map(val => (
            <label key={val} className="flex items-center gap-3 p-2 hover:bg-surface-container rounded-lg cursor-pointer transition-colors group">
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                columnFilters[columnId]?.includes(val) ? 'bg-primary border-primary' : 'border-outline group-hover:border-primary/50'
              }`}>
                {columnFilters[columnId]?.includes(val) && (
                  <span className="material-symbols-outlined text-white text-[14px] font-bold">check</span>
                )}
              </div>
              <input 
                type="checkbox"
                className="hidden"
                checked={columnFilters[columnId]?.includes(val)}
                onChange={() => {
                  const current = columnFilters[columnId] || [];
                  const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
                  const newFilters = { ...columnFilters, [columnId]: next };
                  if (next.length === 0) delete newFilters[columnId];
                  setColumnFilters(newFilters);
                }}
              />
              <span className="text-sm text-on-surface font-medium truncate">{val}</span>
            </label>
          ))}
          {filteredValues.length === 0 && (
            <p className="text-xs text-center py-4 text-on-surface-variant font-medium">Nenhum valor encontrado.</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-outline-variant">
          <button 
            onClick={() => {
              const next = { ...columnFilters };
              delete next[columnId];
              setColumnFilters(next);
            }}
            className="text-xs font-bold text-primary hover:underline"
          >
            Limpar Filtro
          </button>
          <button 
            onClick={() => setOpenFilter(null)}
            className="px-4 py-1.5 bg-surface-container-highest text-on-surface rounded-lg text-sm font-bold hover:bg-surface-variant"
          >
            OK
          </button>
        </div>
      </div>
    );
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return 'swap_vert';
    return sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmMassDelete, setConfirmMassDelete] = useState(false);
  const [confirmDeleteImportId, setConfirmDeleteImportId] = useState<string | null>(null);

  const handleDeleteInvoice = async (id: string) => {
    try {
      const targetCollection = activeTab === 'draft' ? 'invoice_drafts' : 'invoices';
      await auditDelete(targetCollection, id, 'Geral');
      setNotification({ message: 'Nota fiscal excluída com sucesso!', type: 'success' });
      setConfirmDeleteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, activeTab === 'draft' ? 'invoice_drafts' : 'invoices');
      console.error('Erro ao excluir nota fiscal:', error);
      setNotification({ message: 'Erro ao excluir nota fiscal. Verifique sua conexão ou permissões.', type: 'error' });
    }
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [detailsModalVehicle, setDetailsModalVehicle] = useState<any>(null);

  const assignedDriversForModal = detailsModalVehicle
    ? drivers.filter((d) =>
        Array.isArray(d.vehicleAssigned)
          ? d.vehicleAssigned.includes(detailsModalVehicle.plate)
          : d.vehicleAssigned === detailsModalVehicle.plate,
      )
    : [];

  useEffect(() => {
    const q = query(collection(db, 'invoices'), orderBy('issueDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      setInvoices(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoices');
      setLoading(false);
    });

    const qDrafts = query(collection(db, 'invoice_drafts'), orderBy('issueDate', 'desc'));
    const unsubscribeDrafts = onSnapshot(qDrafts, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      setDrafts(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoice_drafts');
    });

    const qVehicles = query(collection(db, 'vehicles'));
    const unsubscribeVehicles = onSnapshot(qVehicles, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setVehicles(docs);
    });

    const qDrivers = query(collection(db, 'drivers'));
    const unsubscribeDrivers = onSnapshot(qDrivers, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setDrivers(docs);
    });

    const handleSyncStatus = (e: any) => {
      if (e.detail?.type === 'INVOICE') {
        setSyncing(e.detail.status === 'syncing');
      }
    };
    window.addEventListener('SYNC_STATUS_CHANGE', handleSyncStatus);

    return () => {
      unsubscribe();
      unsubscribeDrafts();
      unsubscribeVehicles();
      unsubscribeDrivers();
      window.removeEventListener('SYNC_STATUS_CHANGE', handleSyncStatus);
    };
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'invoice_imports'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setImportHistory(docs);
    });
    return unsubscribe;
  }, []);

  const handleManualSync = () => {
    setSyncing(true);
    window.dispatchEvent(new CustomEvent('START_INVOICE_SYNC', { detail: { full: false } }));
  };

  const [recalculatingLinks, setRecalculatingLinks] = useState(false);

  const handleRecalculateLinks = async () => {
    if (recalculatingLinks) return;
    setRecalculatingLinks(true);
    setNotification({ message: 'Sincronizando vínculos com a frota...', type: 'info' });
    try {
      const activeInvoices = activeTab === 'draft' ? drafts : invoices;
      if (activeInvoices.length === 0) {
        setNotification({ message: 'Nenhuma nota fiscal encontrada para vincular.', type: 'info' });
        setRecalculatingLinks(false);
        return;
      }

      if (vehicles.length === 0) {
        setNotification({ message: 'Nenhum veículo cadastrado na frota para cruzar dados.', type: 'error' });
        setRecalculatingLinks(false);
        return;
      }

      let updatedCount = 0;
      const batch = writeBatch(db);

      for (const invoice of activeInvoices) {
        if (!invoice.xmlContent) continue;

        const contentUpper = invoice.xmlContent.toUpperCase();
        
        const extractTag = (xml: string, tag: string) => {
          const tagRegex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
          const val = xml.match(tagRegex);
          return val ? val[1] : '';
        };

        const infAdic = (extractTag(invoice.xmlContent, 'infAdic') || extractTag(invoice.xmlContent, 'infCpl') || extractTag(invoice.xmlContent, 'infAdOrig') || "").toUpperCase();
        
        const searchScope = (infAdic + " " + contentUpper);
        const plateRegex = /([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})|([A-Z]{3}[- ]?[0-9]{4})/gi;
        const matchesInContent = searchScope.match(plateRegex) || [];

        const foundPlates = Array.from(new Set(matchesInContent
          .map(p => p.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
          .filter(plate => vehicles.some(v => v.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === plate))
        ));

        if (foundPlates.length > 0) {
          const newLinked = foundPlates.join(', ');
          if (invoice.linkedVehicle !== newLinked) {
            const invoiceRef = doc(db, activeTab === 'draft' ? 'invoice_drafts' : 'invoices', invoice.id);
            batch.update(invoiceRef, { linkedVehicle: newLinked });
            updatedCount++;
          }
        }
      }

      if (updatedCount > 0) {
        await batch.commit();
        setNotification({ message: `${updatedCount} nota(s) fiscal(is) vinculada(s) à frota com sucesso!`, type: 'success' });
      } else {
        setNotification({ message: 'Todos os vínculos já estão atualizados ou nenhuma placa correspondente foi encontrada.', type: 'info' });
      }
    } catch (error: any) {
      console.error("Erro ao recalcular vínculos:", error);
      setNotification({ message: 'Erro ao recalcular os vínculos de placas.', type: 'error' });
    } finally {
      setRecalculatingLinks(false);
    }
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
    
    const importId = `IMPORT-${Date.now()}`;
    const importDate = new Date().toISOString();

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

        let linkedVehicle = '';
        
        // Extração Inteligente de Placa
        const infAdicXml = (extract(/<infAdic>([\s\S]*?)<\/infAdic>/i) || extract(/<infCpl>([\s\S]*?)<\/infCpl>/i) || "").toUpperCase();
        
        // Procurar padrões de placa (Mercosul ou Padrão) em todo o conteúdo
        const plateRegex = /([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})|([A-Z]{3}[- ]?[0-9]{4})/gi;
        const matchesInContent = infAdicXml.match(plateRegex) || [];
        
        // Verificar contra placas cadastradas
        const foundPlates = matchesInContent
          .map(p => p.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
          .filter(plate => vehicles.some(v => v.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === plate));
          
        if (foundPlates.length > 0) {
            linkedVehicle = foundPlates.join(',');
        }

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
          linkedVehicle: linkedVehicle || undefined,
          xmlContent: content,
          lastSync: importDate,
          importMode: 'manual',
          importId: importId,
          importDate: importDate
        });
        importedCount++;
      }
      
      if (importedCount > 0) {
        // Record import history
        const importHistoryRef = doc(collection(db, 'invoice_imports'), importId);
        batch.set(importHistoryRef, {
          id: importId,
          date: importDate,
          count: importedCount,
          fileName: files.length === 1 ? files[0].name : `${files.length} arquivos`,
          userEmail: userData?.email || 'unknown'
        });
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

  const openPreviewModal = (invoice: Invoice) => {
    setPreviewInvoice(invoice);
    setInvoiceNotes("");
    setZoom(1);
    setOriginalHadNoPlate(!invoice.linkedVehicle);
  };

  // Helper para renderizar a modal de visualização
  const renderPreviewModal = () => {
    if (!previewInvoice) return null;
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50" onClick={() => setPreviewInvoice(null)}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
          {/* Conteúdo da Modal (respeitando estrutura original) */}
          {/* ... */}
        </div>
      </div>
    );
  };

  const getExportFilename = (invoice: Invoice) => {
    // dd.mm.aa_NOME FANTASIA_NF.NÚMERO DA NOTA_$VALOR DA NOTA
    const dateStr = invoice.issueDate.split('-').reverse().join('.');
    const nameStr = invoice.issuerName.replace(/[^a-zA-Z0-9]/g, ' ').trim().replace(/\s+/g, '-').toUpperCase();
    const valStr = invoice.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).replace(',', '.');
    return `${dateStr}_${nameStr}_NF.${invoice.number}_$${valStr}.pdf`;
  };

  const executePDFExport = async (invoice: Invoice, notesParam?: string) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const width = doc.internal.pageSize.getWidth();
    let currentY = 10;
    
    const drawBox = (x: number, y: number, w: number, h: number, title?: string, content?: string | string[], valueX?: number, valueY?: number, isBold: boolean = false) => {
       doc.setDrawColor(200, 200, 200);
       doc.setLineWidth(0.2);
       doc.rect(x, y, w, h);
       if (title) {
         doc.setFontSize(6);
         doc.setTextColor(100, 100, 100);
         doc.setFont("helvetica", "bold");
         doc.text(title.toUpperCase(), x + 1, y + 3);
       }
       if (content) {
         doc.setFontSize(8);
         doc.setTextColor(0, 0, 0);
         doc.setFont("helvetica", isBold ? "bold" : "normal");
         if (Array.isArray(content)) {
           doc.text(content, valueX || (x + 1), valueY || (y + 7.5));
         } else {
           doc.text(content, valueX || (x + 1), valueY || (y + 7.5));
         }
       }
    };

    // Main header box
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(10, currentY, 190, 30);
    
    // Left Box
    doc.line(90, currentY, 90, currentY + 30);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("DANFE", 15, currentY + 7);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text("Documento Auxiliar da Nota Fiscal Eletrônica", 15, currentY + 11);
    
    // Entrada/Saida box
    drawBox(15, currentY + 13, 15, 12);
    doc.setFontSize(6);
    doc.text("0 - ENTRADA", 16, currentY + 16);
    doc.text("1 - SAÍDA", 16, currentY + 19);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("1", 20, currentY + 23);
    
    // Number Box
    drawBox(32, currentY + 13, 30, 12);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text("Nº", 33, currentY + 16);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(invoice.number, 38, currentY + 20);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text("SÉRIE: 1", 33, currentY + 23);

    // Chave box
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text("CHAVE DE ACESSO", 95, currentY + 5);
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    const barcodeText = invoice.key || 'NÃO INFORMADA';
    doc.text(barcodeText.replace(/(\d{4})/g, '$1 ').trim(), 95, currentY + 12);
    
    doc.line(90, currentY + 20, 200, currentY + 20);
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    doc.text("Consulta de autenticidade no portal nacional da NF-e", 100, currentY + 24);
    doc.text("www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora", 95, currentY + 27);

    currentY += 32;
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "bold");
    doc.text("NATUREZA DA OPERAÇÃO", 10, currentY + 3);
    drawBox(10, currentY + 4, 190, 8, "", extractXmlTag(invoice.xmlContent || '', 'natOp') || 'VENDA DE MERCADORIA', 12, currentY + 9, true);

    currentY += 14;
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text("EMITENTE", 10, currentY);
    drawBox(10, currentY + 1, 130, 8, "NOME / RAZÃO SOCIAL", invoice.issuerName, 11, currentY + 7, true);
    drawBox(140, currentY + 1, 60, 8, "CNPJ", invoice.issuerCNPJ, 141, currentY + 7, true);
    
    drawBox(10, currentY + 9, 45, 8, "INSCRIÇÃO ESTADUAL", extractXmlTag(invoice.xmlContent || '', 'IE') || 'ISENTO', 11, currentY + 15, true);
    const endLine = `${extractXmlTag(invoice.xmlContent || '', 'xLgr')}, ${extractXmlTag(invoice.xmlContent || '', 'nro')} - ${extractXmlTag(invoice.xmlContent || '', 'xBairro')} - ${extractXmlTag(invoice.xmlContent || '', 'xMun')} / ${extractXmlTag(invoice.xmlContent || '', 'UF')}`.toUpperCase();
    drawBox(55, currentY + 9, 145, 8, "ENDEREÇO", endLine, 56, currentY + 15);

    currentY += 21;
    let destName = 'NÃO IDENTIFICADO';
    let destCNPJ = '---';
    const destMatch = (invoice.xmlContent || '').match(/<dest>([\s\S]*?)<\/dest>/);
    if (destMatch) {
       const nM = destMatch[1].match(/<xNome>([^<]*)<\/xNome>/);
       if (nM) destName = nM[1].toUpperCase();
       const cjM = destMatch[1].match(/<CNPJ>(\d+)<\/CNPJ>/);
       const cfM = destMatch[1].match(/<CPF>(\d+)<\/CPF>/);
       const v = cjM ? cjM[1] : (cfM ? cfM[1] : null);
       if (v) {
          destCNPJ = v.length === 14 ? v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
       }
    }
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text("DESTINATÁRIO / REMETENTE", 10, currentY);
    drawBox(10, currentY + 1, 130, 8, "NOME / RAZÃO SOCIAL", destName, 11, currentY + 7, true);
    drawBox(140, currentY + 1, 60, 8, "CNPJ / CPF", destCNPJ, 141, currentY + 7, true);

    currentY += 13;
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text("FATURA / DUPLICATA", 10, currentY);
    drawBox(10, currentY + 1, 63, 8, "NÚMERO", invoice.number, 11, currentY + 7, true);
    drawBox(73, currentY + 1, 63, 8, "VENCIMENTO", invoice.issueDate.split('-').reverse().join('/'), 74, currentY + 7, true);
    drawBox(136, currentY + 1, 64, 8, "VALOR (R$)", invoice.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 137, currentY + 7, true);

    currentY += 13;
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text("CÁLCULO DO IMPOSTO", 10, currentY);
    drawBox(10, currentY + 1, 47, 8, "BASE DE CÁLCULO ICMS", "R$ " + (extractXmlTag(invoice.xmlContent || '', 'vBC') || '0,00'), 11, currentY + 7, true);
    drawBox(57, currentY + 1, 47, 8, "VALOR DO ICMS", "R$ " + (extractXmlTag(invoice.xmlContent || '', 'vICMS') || '0,00'), 58, currentY + 7, true);
    drawBox(104, currentY + 1, 47, 8, "VALOR FRETE", "R$ " + (extractXmlTag(invoice.xmlContent || '', 'vFrete') || '0,00'), 105, currentY + 7, true);
    drawBox(151, currentY + 1, 49, 8, "VALOR TOTAL DA NOTA", "R$ " + invoice.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 152, currentY + 7, true);

    currentY += 13;
    doc.setFontSize(6);
    doc.text("DADOS DOS PRODUTOS / SERVIÇOS", 10, currentY);
    
    const items = getInvoiceItems(invoice.xmlContent, invoice.value);
    const tableBody = items.map(item => [
      item.xProd.toUpperCase(),
      parseFloat(item.qCom).toLocaleString('pt-BR'),
      item.uCom,
      parseFloat(item.vUnCom).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      parseFloat(item.vProd).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    ]);

    autoTable(doc, {
      startY: currentY + 2,
      head: [['DESCRIÇÃO COMPLETA', 'QTD', 'UN', 'VALOR UNIT', 'VALOR TOTAL']],
      body: tableBody,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1, textColor: [0, 0, 0] },
      headStyles: { fillColor: [240, 240, 240], textColor: [100, 100, 100], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' }
      }
    });
    
    let finalY = ((doc as any).lastAutoTable?.finalY || 100) + 10;
    
    // 1. Original SEFAZ Notes (Preserving original data)
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "bold");
    doc.text("DADOS ADICIONAIS / ANOTAÇÕES ORIGINAIS (SEFAZ)", 10, finalY);
    
    const originalNotesRaw = extractXmlTag(invoice.xmlContent || '', 'infAdic') || 
                            extractXmlTag(invoice.xmlContent || '', 'infCpl') || 
                            "Nenhuma anotação adicional constante no documento original.";
    
    // Clean up XML tags if they somehow leaked into the extraction
    const originalNotes = originalNotesRaw.replace(/<[^>]*>/g, '').trim();
    
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    
    const splitOriginalNotes = doc.splitTextToSize(originalNotes.toUpperCase(), 180);
    const lineHeight = 3.5;
    const originalBoxHeight = Math.max(15, (splitOriginalNotes.length * lineHeight) + 6);
    
    // Page overflow check for SEFAZ notes
    if (finalY + originalBoxHeight + 5 > 285) {
      doc.addPage();
      finalY = 20;
      doc.setFontSize(6);
      doc.setTextColor(100, 100, 100);
      doc.setFont("helvetica", "bold");
      doc.text("DADOS ADICIONAIS / ANOTAÇÕES ORIGINAIS (SEFAZ) - CONTINUAÇÃO", 10, finalY - 5);
    }

    // Manual box drawing for better control
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.rect(10, finalY + 1, 190, originalBoxHeight);
    
    // Render the wrapped text array directly
    doc.text(splitOriginalNotes, 13, finalY + 7);
    
    finalY += originalBoxHeight + 8;

    // 2. Stylized User Comments Section (Only if notesParam exists)
    if (notesParam) {
      const notesTitle = "COMENTÁRIOS E ANOTAÇÕES DO USUÁRIO";
      const notesText = notesParam;
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const splitNotes = doc.splitTextToSize(notesText, 170);
      const lineHeight = 4;
      const userNotesHeight = (splitNotes.length * lineHeight) + 12;
      
      // Page overflow check
      if (finalY + userNotesHeight + 10 > 285) {
        doc.addPage();
        finalY = 20;
      }

      // Creative Container for User Comments
      doc.setFillColor(249, 250, 251); 
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(10, finalY, 190, userNotesHeight, 2, 2, "FD");
      doc.setFillColor(37, 99, 235);
      doc.rect(10, finalY, 1.5, userNotesHeight, "F");
      
      // Icon
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.3);
      doc.rect(14, finalY + 3.5, 3.5, 4.5);
      doc.line(15, finalY + 5, 16.5, finalY + 5);
      doc.line(15, finalY + 6.5, 16.5, finalY + 6.5);

      doc.setFontSize(7);
      doc.setTextColor(37, 99, 235);
      doc.setFont("helvetica", "bold");
      doc.text(notesTitle, 20, finalY + 7);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(31, 41, 55);
      doc.text(splitNotes, 14, finalY + 13);
      
      finalY += userNotesHeight + 10;
    }

    // Assinatura (only logic without UI)
    if (notesParam) {
       if (finalY > 250) {
          doc.addPage();
          finalY = 20;
       }
       const signatureId = await createSignature({
         documentType: 'Edição de Nota Fiscal / DANFE',
         documentTitle: `NF ${invoice.number} - ${invoice.issuerName}`
       });

       if (signatureId) {
          let logoImgData: string | null = null;
          try {
             const img = new Image();
             img.crossOrigin = 'anonymous';
             img.src = 'https://i.imgur.com/1DaE4Bm.png';
             await new Promise((resolve) => {
               img.onload = () => {
                 const canvas = document.createElement('canvas');
                 canvas.width = img.width;
                 canvas.height = img.height;
                 const ctx = canvas.getContext('2d');
                 if (ctx) {
                   ctx.drawImage(img, 0, 0);
                   logoImgData = canvas.toDataURL('image/png');
                 }
                 resolve(true);
               };
               img.onerror = () => resolve(false);
             });
          } catch (err) {
             console.warn("Could not load signature logo", err);
          }

          const verifyUrl = generateVerificationUrl(signatureId);
          const qrCodeDataUrl = await getQRCodeDataUrl(verifyUrl);
          
          const pageWidth = doc.internal.pageSize.getWidth();
          const signatureHeight = 40;
          
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(14, finalY, pageWidth - 28, signatureHeight, 3, 3, "F");
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.1);
          doc.roundedRect(14, finalY, pageWidth - 28, signatureHeight, 3, 3, "S");
          
          if (qrCodeDataUrl) {
             doc.addImage(qrCodeDataUrl, "JPEG", 20, finalY + 5, 30, 30);
          }
          if (logoImgData) {
            doc.addImage(logoImgData, "PNG", 14 + pageWidth - 28 - 20, finalY + 5, 15, 15);
          }
          
          doc.setFontSize(10);
          doc.setTextColor(30, 41, 59);
          doc.setFont("helvetica", "bold");
          doc.text("DOCUMENTO EDITADO E ASSINADO DIGITALMENTE", 56, finalY + 8);
          
          const userName = userData?.signatureInfo?.fullName || userData?.name || 'USUÁRIO DO SISTEMA';
          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          doc.text(`por ${userName.toUpperCase()}`, 56, finalY + 14);
          
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 116, 139);
          doc.text(`Para verificar a autenticidade das edições, aponte a câmera para o QR Code\nou acesse a URL abaixo:`, 56, finalY + 20);
          
          doc.setTextColor(37, 99, 235);
          doc.text(verifyUrl, 56, finalY + 28);
          
          doc.setTextColor(100, 116, 139);
          doc.setFontSize(7);
          doc.text(`Código de Validação: ${signatureId}`, 56, finalY + 36);
       }
    }
    
    const arrayBuffer = doc.output('arraybuffer');
    return new Blob([arrayBuffer], { type: 'application/pdf' });
  };

  const handleCloseModal = async () => {
    if (previewInvoice) {
      const originalInvoice = currentDataSource.find(inv => inv.id === previewInvoice.id);
      if (originalInvoice && originalInvoice.linkedVehicle !== previewInvoice.linkedVehicle) {
        try {
          const batch = writeBatch(db);
          const invoiceRef = doc(db, activeTab === 'draft' ? 'invoice_drafts' : 'invoices', previewInvoice.id);
          batch.update(invoiceRef, { linkedVehicle: previewInvoice.linkedVehicle || null });
          await batch.commit();
        } catch (error) {
          console.error("Error saving linkedVehicle on close:", error);
        }
      }
    }
    setPreviewInvoice(null);
  };

  const handleExportSingle = async () => {
    if (!previewInvoice) return;
    setIsExporting(true);
    
    try {
      const blob = await executePDFExport(previewInvoice, invoiceNotes);
      
      // Update linkedVehicle in Firestore if it changed
      const originalInvoice = currentDataSource.find(inv => inv.id === previewInvoice.id);
      if (originalInvoice && originalInvoice.linkedVehicle !== previewInvoice.linkedVehicle) {
        const batch = writeBatch(db);
        const invoiceRef = doc(db, activeTab === 'draft' ? 'invoice_drafts' : 'invoices', previewInvoice.id);
        batch.update(invoiceRef, { linkedVehicle: previewInvoice.linkedVehicle || null });
        await batch.commit();
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getExportFilename(previewInvoice);
      a.click();
      
      setNotification({ message: 'Download concluído com sucesso!', type: 'success' });
    } catch (e: any) {
      console.error("Critical export error", e);
      setNotification({ message: 'Erro ao exportar PDF', type: 'error' });
    }
    
    setIsExporting(false);
    setPreviewInvoice(null);
  };

  const handleMassExport = async () => {
     if (selectedInvoices.length === 0) {
        setNotification({ message: 'Selecione pelo menos uma nota fiscal.', type: 'info' });
        return;
     }
     setIsExporting(true);
     try {
       const zip = new JSZip();
       const dataPool = activeTab === 'draft' ? drafts : invoices;
       for (const id of selectedInvoices) {
          const invoice = dataPool.find(i => i.id === id);
          if (invoice) {
             const blob = await executePDFExport(invoice);
             zip.file(getExportFilename(invoice), blob);
          }
       }
       const zipBlob = await zip.generateAsync({ type: 'blob' });
       const url = URL.createObjectURL(zipBlob);
       const a = document.createElement('a');
       a.href = url;
       a.download = `Notas_Fiscais_Lote_${new Date().getTime()}.zip`;
       a.click();
       setNotification({ message: `${selectedInvoices.length} notas fiscais exportadas!`, type: 'success' });
       setSelectedInvoices([]);
     } catch(e) {
       setNotification({ message: 'Erro ao gerar lote de PDFs', type: 'error' });
     }
     setIsExporting(false);
  };

  const currentDataSource = activeTab === 'draft' ? drafts : invoices;

  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const filteredInvoices = currentDataSource.filter(invoice => {
    const searchLower = searchTerm.toLowerCase();
    const cleanSearchTerm = searchLower.replace(/[^a-z0-9]/g, '');
    const cleanSearchValue = searchTerm.replace(/[^\d.,]/g, '');
    
    const valString = invoice.value.toString();
    const valBRL = invoice.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const cleanLinkedVehicle = invoice.linkedVehicle ? invoice.linkedVehicle.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
    const cleanCNPJ = invoice.issuerCNPJ.replace(/\D/g, '');
    const cleanSearchCNPJ = searchTerm.replace(/\D/g, '');
    
    // Extração para busca profunda
    const fullXmlContent = (invoice.xmlContent || '').toLowerCase();
    
    // Extração para busca profunda nos dados adicionais da SEFAZ
    const sefazInfo = (extractXmlTag(invoice.xmlContent || '', 'infAdic') || '') + ' ' + (extractXmlTag(invoice.xmlContent || '', 'infCpl') || '');
    
    const matchesSearch = 
      searchTerm === '' ||
      invoice.issuerName.toLowerCase().includes(searchLower) || 
      invoice.number.includes(searchTerm) ||
      (cleanSearchCNPJ && cleanCNPJ.includes(cleanSearchCNPJ)) ||
      (invoice.key && invoice.key.includes(searchTerm)) ||
      valString.includes(searchTerm) ||
      valBRL.includes(searchTerm) ||
      (cleanSearchValue && valString.includes(cleanSearchValue)) ||
      (cleanLinkedVehicle !== '' && cleanSearchTerm !== '' && cleanLinkedVehicle.includes(cleanSearchTerm)) ||
      (invoice.linkedVehicle && invoice.linkedVehicle.toLowerCase().includes(searchLower)) ||
      sefazInfo.toLowerCase().includes(searchLower) ||
      fullXmlContent.includes(searchLower) ||
      (cleanSearchTerm !== '' && fullXmlContent.replace(/[^a-z0-9]/g, '').includes(cleanSearchTerm));
    
    if (activeTab === 'history') return true; // History uses different rendering
    
    const matchesStatus = filterStatus === 'all' || invoice.status === filterStatus;
    const matchesLinked = !filterLinkedOnly || !!invoice.linkedVehicle;

    const recordDate = invoice.issueDate ? new Date(invoice.issueDate + 'T12:00:00') : new Date(0);
    const matchesMonth = filterMonth === 'Todos' || (recordDate.getUTCMonth() + 1).toString() === filterMonth;
    const matchesYear = filterYear === 'Todos' || recordDate.getUTCFullYear().toString() === filterYear;

    let inRange = true;
    if (filterStartDate) {
      const start = new Date(filterStartDate + 'T00:00:00');
      if (recordDate < start) inRange = false;
    }
    if (filterEndDate) {
      const end = new Date(filterEndDate + 'T23:59:59');
      if (recordDate > end) inRange = false;
    }

    const matchesPeriod = (filterStartDate || filterEndDate) ? inRange : (matchesMonth && matchesYear);

    const matchesColumnFilters = Object.entries(columnFilters).every(([key, values]) => {
      if (!values || values.length === 0) return true;
      let val = '';
      if (key === 'issueDate') val = invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('pt-BR') : '';
      else if (key === 'value') val = invoice.value ? invoice.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00';
      else if (key === 'number') val = String(invoice.number || '');
      else if (key === 'issuerName') val = invoice.issuerName || '';
      else if (key === 'status') val = invoice.status || '';
      else if (key === 'linkedVehicle') val = invoice.linkedVehicle || 'Não vinculado';
      else val = String((invoice as any)[key] || '');
      return values.includes(val);
    });

    return matchesSearch && matchesStatus && matchesLinked && matchesColumnFilters && matchesPeriod;
  });

  // Calculate available parameters for filters
  const availableYears = React.useMemo(() => {
    const years = new Set<string>();
    invoices.forEach(inv => {
      if (inv.issueDate) {
        years.add(new Date(inv.issueDate + 'T12:00:00').getUTCFullYear().toString());
      }
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [invoices]);

  const monthsNominal = [
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' }
  ];

  const sortedInvoices = [...filteredInvoices].sort((a: any, b: any) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    let valA = a[key as keyof Invoice];
    let valB = b[key as keyof Invoice];

    if (key === 'issueDate') {
      valA = new Date(valA).getTime();
      valB = new Date(valB).getTime();
    }
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination Logic
  const totalPages = Math.ceil(sortedInvoices.length / itemsPerPage);
  const paginatedInvoices = sortedInvoices.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Period stats
  const dateRangeLabel = React.useMemo(() => {
    if (filteredInvoices.length === 0) return 'Período não definido';
    const dates = filteredInvoices.map(i => new Date(i.issueDate).getTime());
    const start = new Date(Math.min(...dates)).toLocaleDateString('pt-BR');
    const end = new Date(Math.max(...dates)).toLocaleDateString('pt-BR');
    return `De ${start} até ${end}`;
  }, [filteredInvoices]);

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

      {/* Import Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteImportId && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-outline-variant"
            >
              <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mb-6 mx-auto">
                <span className="material-symbols-outlined text-error text-[32px]">folder_delete</span>
              </div>
              <h3 className="text-xl font-bold text-on-surface text-center mb-2">Excluir Lote Inteiro</h3>
              <p className="text-on-surface-variant text-center mb-8 font-medium">
                Deseja realmente excluir toda esta importação? Todas as notas associadas serão removidas permanentemente.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDeleteImportId(null)}
                  className="flex-1 px-6 py-3 border border-outline-variant text-on-surface font-bold rounded-2xl hover:bg-surface-container transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteImport(confirmDeleteImportId)}
                  className="flex-1 px-6 py-3 bg-error text-white font-bold rounded-2xl hover:bg-error/90 shadow-lg shadow-error/20 transition-all font-bold"
                >
                  Excluir Lote
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mass Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmMassDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-outline-variant"
            >
              <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mb-6 mx-auto">
                <span className="material-symbols-outlined text-error text-[32px]">delete_sweep</span>
              </div>
              <h3 className="text-xl font-bold text-on-surface text-center mb-2">Confirmar Exclusão em Massa</h3>
              <p className="text-on-surface-variant text-center mb-8 font-medium">
                Deseja realmente excluir {selectedInvoices.length} notas da aba {activeTab === 'draft' ? 'Rascunho' : 'Notas Fiscais'}? Esta ação é irreversível.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmMassDelete(false)}
                  className="flex-1 px-6 py-3 border border-outline-variant text-on-surface font-bold rounded-2xl hover:bg-surface-container transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleMassDelete}
                  className="flex-1 px-6 py-3 bg-error text-white font-bold rounded-2xl hover:bg-error/90 shadow-lg shadow-error/20 transition-all font-bold"
                >
                  Excluir Tudo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteId && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-outline-variant"
            >
              <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mb-6 mx-auto">
                <span className="material-symbols-outlined text-error text-[32px]">delete_forever</span>
              </div>
              <h3 className="text-xl font-bold text-on-surface text-center mb-2">Confirmar Exclusão</h3>
              <p className="text-on-surface-variant text-center mb-8 font-medium">
                Deseja realmente excluir esta nota fiscal? Esta ação é irreversível e removerá todos os vínculos permanentemente.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 px-6 py-3 border border-outline-variant text-on-surface font-bold rounded-2xl hover:bg-surface-container transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteInvoice(confirmDeleteId)}
                  className="flex-1 px-6 py-3 bg-error text-white font-bold rounded-2xl hover:bg-error/90 shadow-lg shadow-error/20 transition-all"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
             <span className="material-symbols-outlined text-[32px] text-primary">description</span>
          </div>
          <div>
            <h1 className="text-[28px] font-bold text-on-surface tracking-tight leading-none mb-1">
              {activeTab === 'invoices' ? 'Notas Fiscais (NFe)' : activeTab === 'draft' ? 'Rascunho de Notas' : 'Histórico de Importação'}
            </h1>
            <div className="flex items-center gap-3 text-on-surface-variant font-medium text-xs">
               {(activeTab === 'invoices' || activeTab === 'draft') ? (
                 <>
                   <span className="bg-surface-container px-2 py-0.5 rounded flex items-center gap-1">
                     <span className="text-primary font-black">{filteredInvoices.length}</span> notas
                   </span>
                   <span className="bg-surface-container px-2 py-0.5 rounded flex items-center gap-1">
                     Total <span className="text-primary font-black"><PrivateValue>{filteredInvoices.reduce((acc, inv) => acc + inv.value, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</PrivateValue></span>
                   </span>
                 </>
               ) : (
                 <span className="bg-surface-container px-2 py-0.5 rounded flex items-center gap-1">
                   <span className="text-primary font-black">{importHistory.length}</span> importações no total
                 </span>
               )}
               <span className="text-outline-variant">|</span>
               <span className="flex items-center gap-1">
                 <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                 {dateRangeLabel}
               </span>
            </div>
          </div>
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
            onClick={handleRecalculateLinks}
            disabled={recalculatingLinks || importing}
            className="px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl font-bold hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50"
            title="Procura placas registradas na frota dentro das observações/SEFAZ e vincula notas elegíveis de forma retroativa"
          >
            <span className={`material-symbols-outlined ${recalculatingLinks ? 'animate-spin' : 'keyboard_double_arrow_right'}`}>
              {recalculatingLinks ? 'progress_activity' : 'directions_car'}
            </span>
            {recalculatingLinks ? 'Buscando...' : 'Vincular Placas'}
          </button>
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
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-visible">
        <div className="p-4 border-b border-outline-variant bg-surface-container-lowest rounded-t-2xl">
          <div className="w-full relative group">
            <span className={`material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-[28px] transition-colors ${isSearchFocused ? 'text-primary' : 'text-on-surface-variant/60'}`}>search</span>
            <input 
              type="text" 
              placeholder="Pesquisa global: fornecedores, valores, placas, CNPJ, produtos ou SEFAZ..."
              value={searchTerm}
              onFocus={(e) => {
                setIsSearchFocused(true);
                e.target.select();
              }}
              onBlur={() => setIsSearchFocused(false)}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#F8FAFC] dark:bg-[#F8FAFC] border-2 border-transparent focus:border-primary/30 focus:bg-[#F8FAFC] rounded-[20px] pl-16 pr-6 py-4 text-base font-medium shadow-sm focus:shadow-md outline-none transition-all placeholder:text-on-surface-variant/60 text-on-surface hover:bg-[#F8FAFC]/90"
            />
          </div>
        </div>

        <div className="p-4 flex flex-col xl:flex-row gap-4 items-center justify-between">
          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            {/* New Filter Controls (matching Fuel page) */}
            <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-2xl p-1 shadow-sm">
               <div className="pl-3 pr-2 py-2 flex items-center gap-3">
                 <span className="material-symbols-outlined text-[20px] text-primary">calendar_month</span>
                 <div className="flex items-center gap-2">
                   <span className="text-[13px] font-bold text-on-surface-variant">Mês:</span>
                   <select 
                     value={filterMonth}
                     onChange={(e) => {
                       setFilterMonth(e.target.value);
                       setCurrentPage(1);
                     }}
                     className="bg-transparent text-[13px] font-bold text-on-surface outline-none cursor-pointer hover:text-primary transition-colors pr-1"
                   >
                     <option value="Todos">Todos</option>
                     {monthsNominal.map(m => (
                       <option key={m.value} value={m.value}>{m.label}</option>
                     ))}
                   </select>
                   <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">expand_more</span>
                 </div>
                 <div className="w-[1px] h-4 bg-outline-variant"></div>
                 <div className="flex items-center gap-2">
                   <span className="text-[13px] font-bold text-on-surface-variant">Ano:</span>
                   <select 
                     value={filterYear}
                     onChange={(e) => {
                       setFilterYear(e.target.value);
                       setCurrentPage(1);
                     }}
                     className="bg-transparent text-[13px] font-bold text-on-surface outline-none cursor-pointer hover:text-primary transition-colors pr-1"
                   >
                     <option value="Todos">Todos</option>
                     {availableYears.map(y => (
                       <option key={y} value={y}>{y}</option>
                     ))}
                   </select>
                   <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">expand_more</span>
                 </div>
               </div>
            </div>

            <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-2xl p-1 shadow-sm">
               <div className="flex items-center gap-3 px-3">
                 <div className="flex flex-col">
                    <span className="text-[8px] font-black text-primary uppercase leading-tight">Início</span>
                    <input 
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => {
                        setFilterStartDate(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="bg-transparent text-[13px] font-bold text-on-surface outline-none cursor-pointer w-28"
                    />
                 </div>
                 <div className="w-[1px] h-6 bg-outline-variant"></div>
                 <div className="flex flex-col">
                    <span className="text-[8px] font-black text-primary uppercase leading-tight">Fim</span>
                    <input 
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => {
                        setFilterEndDate(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="bg-transparent text-[13px] font-bold text-on-surface outline-none cursor-pointer w-28"
                    />
                 </div>
                 {(filterStartDate || filterEndDate) && (
                   <button 
                    onClick={() => { setFilterStartDate(''); setFilterEndDate(''); setCurrentPage(1); }}
                    className="p-1 hover:bg-error/10 hover:text-error text-on-surface-variant/50 rounded-lg transition-all"
                    title="Limpar Datas"
                   >
                      <span className="material-symbols-outlined text-[20px] fill-1">cancel</span>
                   </button>
                 )}
               </div>
            </div>

            <button
               onClick={() => {
                 setFilterLinkedOnly(!filterLinkedOnly);
                 setCurrentPage(1);
               }}
               className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 border ${filterLinkedOnly ? 'bg-secondary text-on-secondary border-secondary' : 'bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-container'}`}
             >
               <span className="material-symbols-outlined text-[16px]">directions_car</span>
               {filterLinkedOnly ? 'Apenas Veículos' : 'Todos'}
             </button>

            <select 
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white dark:bg-surface-container border border-outline-variant rounded-xl pl-4 pr-8 outline-none appearance-none font-bold text-xs cursor-pointer truncate custom-select flex items-center h-[36px]"
              style={{
                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.5rem center',
                backgroundSize: '1em'
              }}
            >
              <option value="all">SITUAÇÃO: TODOS</option>
              <option value="autorizada">AUTORIZADA</option>
              <option value="cancelada">CANCELADA</option>
              <option value="rejeitada">REJEITADA</option>
            </select>

            <button
              onClick={handleClearFilters}
              className="px-3 py-1.5 flex items-center gap-1.5 text-on-surface-variant hover:text-primary transition-all text-[10px] font-black uppercase tracking-tighter bg-surface-container-low border border-outline-variant/50 rounded-lg hover:border-primary/30"
              title="Limpar Filtros"
            >
              <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>
              LIMPAR FILTROS
            </button>

          </div>
        </div>
        <div className="flex items-end justify-between px-6 bg-surface-container-low/50 border-b border-outline-variant pt-2">
          <div className="flex items-center gap-1 -mb-[1px]">
            <button
               onClick={() => handleTabChange('invoices')}
               className={`px-6 py-4 rounded-t-xl text-sm font-bold transition-all border-t border-x ${activeTab === 'invoices' ? 'bg-surface-container-lowest text-primary border-outline-variant shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.05)] relative z-10' : 'bg-transparent text-on-surface-variant hover:bg-surface-container-high/60 border-transparent opacity-70 hover:opacity-100'}`}
            >
               Notas Fiscais
            </button>
            <button
               onClick={() => handleTabChange('draft')}
               className={`px-6 py-4 rounded-t-xl text-sm font-bold transition-all border-t border-x ${activeTab === 'draft' ? 'bg-surface-container-lowest text-primary border-outline-variant shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.05)] relative z-10' : 'bg-transparent text-on-surface-variant hover:bg-surface-container-high/60 border-transparent opacity-70 hover:opacity-100'}`}
            >
               Rascunho
            </button>
            <button
               onClick={() => handleTabChange('history')}
               className={`px-6 py-4 rounded-t-xl text-sm font-bold transition-all border-t border-x ${activeTab === 'history' ? 'bg-surface-container-lowest text-primary border-outline-variant shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.05)] relative z-10' : 'bg-transparent text-on-surface-variant hover:bg-surface-container-high/60 border-transparent opacity-70 hover:opacity-100'}`}
            >
               Histórico de Importação
            </button>
          </div>
          {(activeTab === 'invoices' || activeTab === 'draft') && selectedInvoices.length > 0 && (
            <div className="flex items-center gap-2 pb-3">
              <button
                onClick={handleMassExport}
                disabled={isExporting}
                className="px-4 py-2 bg-primary text-white font-bold rounded-xl flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md"
              >
                <span className={`material-symbols-outlined text-[18px] ${isExporting ? 'animate-spin' : ''}`}>
                  {isExporting ? 'progress_activity' : 'file_download'}
                </span>
                Exportar ({selectedInvoices.length})
              </button>
              <button
                onClick={() => setConfirmMassDelete(true)}
                className="px-4 py-2 bg-error text-white font-bold rounded-xl flex items-center gap-2 hover:bg-error/90 transition-colors shadow-md"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                Excluir ({selectedInvoices.length})
              </button>
            </div>
          )}
        </div>
        {(activeTab === 'invoices' || activeTab === 'draft') ? (
          <div className="w-full overflow-auto max-h-[calc(100vh-320px)]">
            <table className="w-full text-left border-collapse table-auto min-w-[1000px]">
              <thead className="sticky top-0 z-[40] bg-surface-container-low">
              <tr className="border-b border-outline-variant">
                <th className="p-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={selectedInvoices.length === paginatedInvoices.length && paginatedInvoices.length > 0}
                    onChange={(e) => setSelectedInvoices(e.target.checked ? paginatedInvoices.map(i => i.id) : [])}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                </th>
                <th className="p-0 relative group">
                  <div className="flex items-center">
                    <button onClick={() => handleSort('number')} className="flex-1 p-4 text-left font-bold text-[11px] uppercase tracking-wider text-on-surface-variant flex items-center gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer">
                      Número
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant/30 group-hover:text-primary transition-colors">{getSortIcon('number')}</span>
                    </button>
                    <ColumnFilter columnId="number" label="Número" />
                  </div>
                </th>
                <th className="p-0 relative group">
                  <div className="flex items-center">
                    <button onClick={() => handleSort('issueDate')} className="flex-1 p-4 text-left font-bold text-[11px] uppercase tracking-wider text-on-surface-variant flex items-center gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer">
                      Emissão
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant/30 group-hover:text-primary transition-colors">{getSortIcon('issueDate')}</span>
                    </button>
                    <ColumnFilter columnId="issueDate" label="Emissão" />
                  </div>
                </th>
                <th className="p-0 relative group">
                  <div className="flex items-center">
                    <button onClick={() => handleSort('issuerName')} className="flex-1 p-4 text-left font-bold text-[11px] uppercase tracking-wider text-on-surface-variant flex items-center gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer">
                      Fornecedor
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant/30 group-hover:text-primary transition-colors">{getSortIcon('issuerName')}</span>
                    </button>
                    <ColumnFilter columnId="issuerName" label="Fornecedor" />
                  </div>
                </th>
                <th className="p-0 relative group">
                  <div className="flex items-center justify-end">
                    <button onClick={() => handleSort('value')} className="p-4 text-right font-bold text-[11px] uppercase tracking-wider text-on-surface-variant flex items-center justify-end gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer">
                      Valor
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant/30 group-hover:text-primary transition-colors">{getSortIcon('value')}</span>
                    </button>
                    <ColumnFilter columnId="value" label="Valor" />
                  </div>
                </th>
                <th className="p-0 relative group">
                  <div className="flex items-center">
                    <button onClick={() => handleSort('linkedVehicle')} className="flex-1 p-4 text-left font-bold text-[11px] uppercase tracking-wider text-on-surface-variant flex items-center gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer">
                      Vínculo
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant/30 group-hover:text-primary transition-colors">{getSortIcon('linkedVehicle')}</span>
                    </button>
                    <ColumnFilter columnId="linkedVehicle" label="Vínculo" />
                  </div>
                </th>
                <th className="p-0 relative group">
                  <div className="flex items-center">
                    <button onClick={() => handleSort('status')} className="flex-1 p-4 text-left font-bold text-[11px] uppercase tracking-wider text-on-surface-variant flex items-center gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer">
                      Status
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant/30 group-hover:text-primary transition-colors">{getSortIcon('status')}</span>
                    </button>
                    <ColumnFilter columnId="status" label="Status" />
                  </div>
                </th>
                <th className="p-0 text-center font-bold text-[11px] uppercase tracking-wider text-on-surface-variant">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInvoices.map((invoice, index) => (
                <tr key={invoice.id} className="border-b border-outline-variant/30 hover:bg-surface-container-low transition-colors group">
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedInvoices.includes(invoice.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedInvoices(prev => [...prev, invoice.id]);
                        else setSelectedInvoices(prev => prev.filter(id => id !== invoice.id));
                      }}
                      className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                    />
                  </td>
                  <td className="p-4 text-sm font-semibold text-on-surface">{invoice.number}</td>
                  <td className="p-4 text-sm text-on-surface-variant">
                    {invoice.issueDate.split('-').reverse().join('/')}
                  </td>
                  <td className="p-4">
                    <div className="text-sm font-bold text-on-surface">{invoice.issuerName}</div>
                    <div className="text-xs text-on-surface-variant"><PrivateValue>{invoice.issuerCNPJ}</PrivateValue></div>
                  </td>
                  <td className="p-4 text-sm font-bold text-on-surface text-right">
                    <PrivateValue>{invoice.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</PrivateValue>
                  </td>
                  <td className="p-4">
                    {invoice.linkedVehicle ? (
                      <div className="flex flex-wrap gap-1">
                        {invoice.linkedVehicle.split(/[\s,;/]+/).filter(Boolean).map((plate, pIdx) => (
                          <button 
                            key={`${plate}-${pIdx}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const matchingVehicle = vehicles.find(v => 
                                v.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
                              );
                              if (matchingVehicle) {
                                setDetailsModalVehicle(matchingVehicle);
                              } else {
                                navigate(`/fleet?search=${plate}`);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-bold font-mono group/plate"
                            title={`Ver veículo ${plate} na Frota`}
                          >
                            <span className="material-symbols-outlined text-[12px]">directions_car</span>
                            <PrivateValue>{plate}</PrivateValue>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span 
                        onClick={() => openPreviewModal(invoice)}
                        className="text-xs text-on-surface-variant italic cursor-pointer hover:text-primary transition-colors hover:underline"
                      >
                        Vincular veículo...
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                     <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusColor(invoice.status)}`}>
                       {invoice.status}
                     </span>
                  </td>
                  <td className="p-4">
                     <div className="flex items-center justify-center gap-2">
                       {activeTab === 'invoices' && (
                         <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCopyToDraft(invoice);
                          }}
                          className="p-1.5 text-on-surface-variant hover:text-secondary hover:bg-secondary/10 rounded-lg transition-colors" 
                          title="Copiar para Rascunho"
                         >
                           <span className="material-symbols-outlined text-[20px] pointer-events-none">content_copy</span>
                         </button>
                       )}
                       <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openPreviewModal(invoice);
                        }}
                        className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" 
                        title="Visualizar PDF"
                       >
                         <span className="material-symbols-outlined text-[20px] pointer-events-none">picture_as_pdf</span>
                       </button>
                       <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
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
                         <span className="material-symbols-outlined text-[20px] pointer-events-none">code</span>
                       </button>
                       <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setConfirmDeleteId(invoice.id);
                        }}
                        className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg transition-colors relative z-[100]" 
                        title="Excluir Nota"
                       >
                         <span className="material-symbols-outlined text-[20px] pointer-events-none text-error">delete</span>
                       </button>
                     </div>
                  </td>
                </tr>
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

          {totalPages > 1 && (
            <div className="p-4 border-t border-outline-variant flex items-center justify-between bg-surface-container-low/50 sticky bottom-0 z-20 backdrop-blur-md">
              <div className="text-xs text-on-surface-variant font-medium">
                Página <span className="text-on-surface font-black">{currentPage}</span> de <span className="text-on-surface font-black">{totalPages}</span>
                <span className="mx-2">•</span>
                Mostrando <span className="text-on-surface font-black">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, sortedInvoices.length)}</span> de <span className="text-on-surface font-black">{sortedInvoices.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                  className="w-10 h-10 rounded-xl bg-white border border-outline-variant flex items-center justify-center hover:bg-surface-container transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm font-bold"
                >
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = 1;
                    if (totalPages <= 5) pageNum = i + 1;
                    else if (currentPage <= 3) pageNum = i + 1;
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = currentPage - 2 + i;
                    
                    if (pageNum <= 0 || pageNum > totalPages) return null;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-10 h-10 rounded-xl font-bold text-xs transition-all ${currentPage === pageNum ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white dark:bg-surface-container border border-outline-variant text-on-surface dark:text-on-surface hover:bg-surface-container dark:hover:bg-surface-container-high'}`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="w-10 h-10 rounded-xl bg-white border border-outline-variant flex items-center justify-center hover:bg-surface-container transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm font-bold"
                >
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            </div>
          )}

          {paginatedInvoices.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant font-medium">
              <div className="w-20 h-20 bg-surface-container rounded-full flex items-center justify-center mb-4 border border-outline-variant">
                <span className="material-symbols-outlined text-[40px] opacity-20">search_off</span>
              </div>
              <p className="text-lg font-bold text-on-surface">Nenhum resultado encontrado</p>
              <p className="text-sm">Tente ajustar seus filtros ou termos de pesquisa.</p>
              <button 
                onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('all');
                  setFilterLinkedOnly(false);
                  setColumnFilters({});
                  setFilterMonth('Todos');
                  setFilterYear('Todos');
                  setFilterStartDate('');
                  setFilterEndDate('');
                  setCurrentPage(1);
                }}
                className="mt-6 text-primary font-bold hover:underline"
              >
                Limpar todos os filtros
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full overflow-auto max-h-[calc(100vh-320px)]">
           {/* History Table */}
           <table className="w-full text-left border-collapse table-auto min-w-[800px]">
             <thead className="sticky top-0 z-[40] bg-surface-container-low">
               <tr className="border-b border-outline-variant">
                 <th className="p-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Lote / ID</th>
                 <th className="p-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Data da Importação</th>
                 <th className="p-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant text-center">Qtde</th>
                 <th className="p-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Arquivos / Origem</th>
                 <th className="p-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Usuário</th>
                 <th className="p-4 text-center font-bold text-[11px] uppercase tracking-wider text-on-surface-variant">Ações</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-outline-variant/30">
               {importHistory.filter(imp => {
                 const searchLower = searchTerm.toLowerCase();
                 return !searchTerm || 
                   imp.id.toLowerCase().includes(searchLower) || 
                   imp.fileName.toLowerCase().includes(searchLower) ||
                   imp.userEmail.toLowerCase().includes(searchLower);
               }).map((imp) => (
                 <tr key={imp.id} className="hover:bg-surface-container-low transition-colors group">
                   <td className="p-4">
                     <div className="text-sm font-bold text-on-surface">{imp.id}</div>
                   </td>
                   <td className="p-4 text-sm text-on-surface-variant">
                     {new Date(imp.date).toLocaleString('pt-BR')}
                   </td>
                   <td className="p-4 text-center">
                     <span className="px-2 py-1 rounded-md bg-secondary/10 text-secondary text-xs font-bold font-mono">
                       {imp.count} notas
                     </span>
                   </td>
                   <td className="p-4 text-sm font-medium text-on-surface break-all max-w-[200px]">
                     {imp.fileName}
                   </td>
                   <td className="p-4 text-xs font-semibold text-on-surface-variant italic">
                     {imp.userEmail}
                   </td>
                   <td className="p-4 text-center">
                     <button 
                       onClick={() => handleDeleteImport(imp.id)}
                       className="p-2 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                       title="Excluir Lote Inteiro"
                     >
                       <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
                     </button>
                   </td>
                 </tr>
               ))}
               {importHistory.length === 0 && (
                 <tr>
                   <td colSpan={6} className="p-12 text-center text-on-surface-variant italic">
                     Nenhum histórico de importação encontrado.
                   </td>
                 </tr>
               )}
             </tbody>
           </table>
        </div>
      )}
    </div>

      {previewInvoice && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 lg:py-8 lg:pr-8 lg:pl-[312px]" onClick={handleCloseModal}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-surface border border-outline-variant rounded-2xl shadow-2xl flex flex-col w-full max-w-7xl h-full max-h-[95vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-outline-variant bg-white dark:bg-surface-container flex justify-between items-center">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                     <span className="material-symbols-outlined text-primary dark:text-blue-400">picture_as_pdf</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-on-surface">Visualização de DANFE / Edição</h2>
                    <p className="text-xs text-on-surface-variant font-medium uppercase tracking-tighter italic">NF {previewInvoice.number} • {previewInvoice.issuerName}</p>
                  </div>
               </div>
               <div className="flex items-center gap-3">
                  <button 
                   onClick={handleExportSingle}
                   disabled={isExporting}
                   className="px-6 py-2 bg-primary text-white text-sm font-bold rounded-full hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                  >
                    <span className={`material-symbols-outlined text-[18px] ${isExporting ? 'animate-spin' : ''}`}>
                      {isExporting ? 'progress_activity' : 'save'}
                    </span>
                    {isExporting ? 'Salvando...' : 'Salvar com Edições / Exportar PDF'}
                  </button>
                  <button onClick={handleCloseModal} className="w-8 h-8 rounded-full bg-surface-container-low dark:bg-surface-container-high hover:bg-surface-container-high dark:hover:bg-surface-container-highest text-on-surface-variant flex items-center justify-center transition-colors">
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
               </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
               {/* Left sidebar: Editor */}
               <div className="w-[300px] border-r border-outline-variant bg-white dark:bg-surface-container p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                  <div>
                    <h3 className="text-sm font-bold text-on-surface mb-2 flex items-center gap-2"><span className="material-symbols-outlined text-[18px] text-primary dark:text-blue-400">edit_note</span> Anotações</h3>
                    <p className="text-[10px] text-on-surface-variant mb-4 font-bold uppercase tracking-wider mb-3 italic">Estes comentários serão anexados ao final do PDF exportado.</p>
                    <textarea 
                      value={invoiceNotes}
                      onChange={e => setInvoiceNotes(e.target.value)}
                      placeholder="Adicione observações, motivo da recusa, centro de custo, etc..."
                      className="w-full h-40 resize-none rounded-xl border border-outline-variant bg-[#F8FAFC] dark:bg-[#F8FAFC] p-3 text-sm focus:outline-none focus:border-primary transition-colors font-medium text-slate-900 dark:text-slate-950"
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface mb-2 flex items-center gap-2"><span className="material-symbols-outlined text-[18px] text-primary dark:text-blue-400">info</span> Infos Adicionais</h3>
                    
                    <div className="bg-[#F8FAFC] dark:bg-primary/10 rounded-xl border border-outline-variant dark:border-primary/20 p-4 shadow-sm mb-6">
                       <p className="text-[10px] font-bold text-primary dark:text-blue-400 uppercase tracking-wider mb-2 opacity-70">Dados da Nota</p>
                       <ul className="space-y-2 text-xs font-semibold text-on-surface">
                         <li className="flex flex-col gap-0.5 border-b border-primary/10 dark:border-primary/20 pb-2 mb-2">
                            <span className="text-[10px] text-primary dark:text-blue-400 uppercase font-black opacity-60">Fornecedor:</span> 
                            <span className="text-[11px] leading-tight break-words">{previewInvoice.issuerName}</span>
                         </li>
                         <li className="flex justify-between items-center"><span>VALOR:</span> <span className="font-bold text-primary dark:text-blue-400"><PrivateValue>{previewInvoice.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</PrivateValue></span></li>
                         <li className="flex justify-between"><span>EMISSÃO:</span> <span className="opacity-80">{previewInvoice.issueDate.split('-').reverse().join('/')}</span></li>
                         <li className="flex justify-between items-center"><span>VÍNCULO:</span> 
                           <div className="flex items-center gap-1">
                              <input 
                                type="text" 
                                placeholder="PLACA(S)"
                                value={previewInvoice.linkedVehicle || ''}
                                onChange={(e) => {
                                  const newVal = e.target.value.toUpperCase();
                                  setPreviewInvoice({ ...previewInvoice, linkedVehicle: newVal });
                                  if (originalHadNoPlate) {
                                    setInvoiceNotes(newVal);
                                  }
                                }}
                                className="w-32 font-mono text-[10px] bg-[#F8FAFC] dark:bg-[#F8FAFC] border border-outline-variant px-1.5 py-0.5 rounded text-slate-800 dark:text-slate-800 focus:outline-none focus:border-primary"
                              />
                              {previewInvoice.linkedVehicle && (
                                <button onClick={() => {
                                  setPreviewInvoice({ ...previewInvoice, linkedVehicle: '' });
                                  if (originalHadNoPlate) {
                                    setInvoiceNotes('');
                                  }
                                }} className="text-on-surface-variant hover:text-error leading-none">
                                  <span className="material-symbols-outlined text-[14px]">close</span>
                                </button>
                              )}
                           </div>
                         </li>
                       </ul>
                    </div>

                    <div>
                       <h3 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-[18px] text-primary dark:text-blue-400">zoom_in</span> Zoom</h3>
                       <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                             <button 
                               onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))}
                               className="flex-1 flex items-center justify-center py-2 bg-surface-container-low hover:bg-surface-container-high rounded-lg border border-outline-variant transition-colors"
                               title="Zoom Out"
                             >
                               <span className="material-symbols-outlined">zoom_out</span>
                             </button>
                             <button 
                               onClick={() => setZoom(1)}
                               className="px-4 py-2 bg-surface-container-low hover:bg-surface-container-high rounded-lg border border-outline-variant transition-colors text-xs font-bold"
                               title="Reset Zoom"
                             >
                               100%
                             </button>
                             <button 
                               onClick={() => setZoom(prev => Math.min(2, prev + 0.1))}
                               className="flex-1 flex items-center justify-center py-2 bg-surface-container-low hover:bg-surface-container-high rounded-lg border border-outline-variant transition-colors"
                               title="Zoom In"
                             >
                               <span className="material-symbols-outlined">zoom_in</span>
                             </button>
                          </div>
                          <input 
                            type="range" 
                            min="0.5" 
                            max="2" 
                            step="0.1" 
                            value={zoom} 
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="w-full h-1.5 rounded-lg appearance-none bg-outline-variant cursor-pointer accent-primary"
                          />
                          <div className="flex justify-between text-[10px] text-on-surface-variant font-bold">
                            <span>50%</span>
                            <span>200%</span>
                          </div>
                       </div>
                    </div>
                  </div>
               </div>

               {/* Right side: Interactive PDF Preview Canvas */}
               <div 
                 ref={scrollContainerRef}
                 onMouseDown={handlePanMouseDown}
                 onMouseMove={handlePanMouseMove}
                 onMouseUp={handlePanMouseUp}
                 onMouseLeave={handlePanMouseUp}
                 className={`flex-1 bg-surface-container dark:bg-black/20 overflow-auto p-4 md:p-8 flex items-start justify-center custom-scrollbar scroll-smooth whitespace-nowrap select-none ${isPanDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
               >
                  <div className="transition-transform duration-200 ease-out origin-top" style={{ transform: `scale(${zoom})` }}>
                    <div 
                      ref={invoicePreviewRef} 
                      id="invoice-preview-capture"
                      className="bg-white shadow-2xl p-8 md:p-12 border border-outline-variant pointer-events-auto"
                      style={{ minHeight: '1122px', width: '794px', backgroundColor: '#ffffff' }}
                    >
                    {/* DANFE HTML Representation - Forced Dark Text for Mockup */}
                    <div className="border border-slate-950 mb-4 overflow-hidden rounded-sm">
                      <div className="flex">
                        <div className="w-1/2 p-4 border-r border-slate-950 text-[10px]">
                           <h1 className="text-xl font-black uppercase text-slate-950 mb-1">DANFE</h1>
                           <h2 className="text-[9px] font-bold text-slate-700 uppercase mb-4 leading-tight">Documento Auxiliar da Nota Fiscal Eletrônica</h2>
                           
                           <div className="grid grid-cols-2 gap-1 mb-2">
                              <div className="border border-slate-950 p-1 text-[9px] flex flex-col justify-center items-center text-slate-950">
                                <span className="font-bold uppercase tracking-tighter">0 - ENTRADA</span>
                                <span className="font-bold uppercase tracking-tighter">1 - SAÍDA</span>
                                <span className="text-sm font-black mt-1">1</span>
                              </div>
                              <div className="border border-slate-950 p-1 text-[9px] flex flex-col justify-center text-slate-950">
                                <span className="font-bold">Nº: <span className="text-sm font-black">{previewInvoice.number}</span></span>
                                <span className="font-bold">SÉRIE: 1</span>
                              </div>
                           </div>
                           <div className="border border-slate-950 p-1 text-[9px] text-slate-950">
                              <p className="font-bold uppercase text-[8px] text-slate-600">Protocolo de Autorização</p>
                              <p className="font-mono font-bold">{extractXmlTag(previewInvoice.xmlContent || '', 'nProt') || '---'}</p>
                           </div>
                        </div>
                        <div className="w-1/2 p-4 flex flex-col justify-center">
                           <div className="mb-4">
                             <p className="text-[9px] uppercase font-bold text-slate-600 mb-1">Chave de Accesso</p>
                             <p className="text-[12px] font-mono tracking-widest font-black border border-transparent py-1 leading-none break-all text-slate-950">{previewInvoice.key || 'NÃO INFORMADA'}</p>
                           </div>
                           <div className="text-center mt-auto border-t border-slate-300 pt-2">
                             <p className="text-[9px] uppercase font-bold text-slate-600 mb-1">Consulta de Autenticidade</p>
                             <a href="#" className="text-xs text-blue-800 font-bold hover:underline">www.nfe.fazenda.gov.br/portal</a>
                           </div>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                       <p className="font-bold text-[10px] bg-white px-2 py-1 uppercase tracking-widest text-slate-700 border-b border-slate-950">Natureza da Operação</p>
                       <div className="border border-slate-950 mt-1 p-2 bg-white">
                          <p className="text-xs font-black text-slate-950 uppercase">{extractXmlTag(previewInvoice.xmlContent || '', 'natOp') || 'VENDA DE MERCADORIA'}</p>
                       </div>
                    </div>

                    <div className="mb-4">
                       <p className="font-bold text-[10px] bg-white px-2 py-1 uppercase tracking-widest text-slate-700 border-b border-slate-950">Emitente</p>
                       <div className="flex flex-col border border-slate-950 mt-1 divide-y divide-slate-400">
                          <div className="flex divide-x divide-slate-400">
                             <div className="w-2/3 p-2">
                               <p className="text-[8px] uppercase text-slate-600 font-bold">NOME / RAZÃO SOCIAL</p>
                               <p className="text-sm font-black text-slate-950 leading-snug">{previewInvoice.issuerName}</p>
                             </div>
                             <div className="w-1/3 p-2">
                               <p className="text-[8px] uppercase text-slate-600 font-bold">CNPJ</p>
                               <p className="text-sm font-black text-slate-950 leading-snug">{previewInvoice.issuerCNPJ}</p>
                             </div>
                          </div>
                          <div className="p-2 flex gap-4">
                             <div>
                               <p className="text-[8px] uppercase text-slate-600 font-bold">Inscrição Estadual</p>
                               <p className="text-xs font-bold text-slate-950">{extractXmlTag(previewInvoice.xmlContent || '', 'IE') || 'ISENTO'}</p>
                             </div>
                             <div className="flex-1">
                               <p className="text-[8px] uppercase text-slate-600 font-bold">Endereço</p>
                               <p className="text-[10px] text-slate-950 truncate uppercase font-bold">
                                 {extractXmlTag(previewInvoice.xmlContent || '', 'xLgr')}, {extractXmlTag(previewInvoice.xmlContent || '', 'nro')} - {extractXmlTag(previewInvoice.xmlContent || '', 'xBairro')} - {extractXmlTag(previewInvoice.xmlContent || '', 'xMun')}/{extractXmlTag(previewInvoice.xmlContent || '', 'UF')}
                               </p>
                             </div>
                          </div>
                       </div>
                    </div>

                    <div className="mb-4">
                       <p className="font-bold text-[10px] bg-white px-2 py-1 uppercase tracking-widest text-slate-700 border-b border-slate-950">Destinatário / Remetente</p>
                       <div className="flex flex-col border border-slate-950 mt-1 divide-y divide-slate-400">
                          <div className="flex divide-x divide-slate-400">
                             <div className="w-2/3 p-2">
                               <p className="text-[8px] uppercase text-slate-600 font-bold">NOME / RAZÃO SOCIAL</p>
                               <p className="text-sm font-black text-slate-950 leading-snug uppercase">
                                 {(() => {
                                   const destMatch = (previewInvoice.xmlContent || '').match(/<dest>([\s\S]*?)<\/dest>/);
                                   if (!destMatch) return 'DESTINATÁRIO NÃO IDENTIFICADO';
                                   const nameMatch = destMatch[1].match(/<xNome>([^<]*)<\/xNome>/);
                                   return nameMatch ? nameMatch[1].toUpperCase() : 'DESTINATÁRIO NÃO IDENTIFICADO';
                                 })()}
                               </p>
                             </div>
                             <div className="w-1/3 p-2">
                               <p className="text-[8px] uppercase text-slate-600 font-bold">CNPJ / CPF</p>
                               <p className="text-sm font-black text-slate-950 leading-snug">
                                 {(() => {
                                   const destMatch = (previewInvoice.xmlContent || '').match(/<dest>([\s\S]*?)<\/dest>/);
                                   if (!destMatch) return '---';
                                   const cnpjMatch = destMatch[1].match(/<CNPJ>(\d+)<\/CNPJ>/);
                                   const cpfMatch = destMatch[1].match(/<CPF>(\d+)<\/CPF>/);
                                   const val = cnpjMatch ? cnpjMatch[1] : (cpfMatch ? cpfMatch[1] : null);
                                   if (!val) return '---';
                                   return val.length === 14 
                                     ? val.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                                     : val.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
                                 })()}
                               </p>
                             </div>
                          </div>
                       </div>
                    </div>

                    <div className="mb-4">
                       <p className="font-bold text-[10px] bg-white px-2 py-1 uppercase tracking-widest text-slate-700 border-b border-slate-950">Fatura / Duplicata</p>
                       <div className="flex border border-slate-950 mt-1">
                           <div className="w-1/3 p-2 border-r border-slate-950 text-slate-950">
                             <p className="text-[8px] uppercase text-slate-600 font-bold">NÚMERO</p>
                             <p className="text-sm font-black uppercase leading-snug">{previewInvoice.number}</p>
                           </div>
                           <div className="w-1/3 p-2 border-r border-slate-950 text-slate-950">
                             <p className="text-[8px] uppercase text-slate-600 font-bold">VENCIMENTO</p>
                             <p className="text-sm font-black uppercase leading-snug">{previewInvoice.issueDate.split('-').reverse().join('/')}</p>
                           </div>
                           <div className="w-1/3 p-2 text-slate-950">
                             <p className="text-[8px] uppercase text-slate-600 font-bold">VALOR (R$)</p>
                             <p className="text-sm font-black leading-snug"><PrivateValue>{previewInvoice.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</PrivateValue></p>
                           </div>
                        </div>
                     </div>

                    <div className="mb-4 mt-8">
                       <p className="font-bold text-[10px] bg-white px-2 py-1 uppercase tracking-widest text-slate-700 border-b border-slate-950">Cálculo do Imposto (Demonstrativo)</p>
                       <div className="flex border border-slate-950 mt-1 bg-slate-50">
                           <div className="w-full p-2 grid grid-cols-4 gap-2 text-slate-950">
                             <div>
                               <p className="text-[8px] uppercase text-slate-600 font-bold">BASE DE CÁLCULO ICMS</p>
                               <p className="text-xs font-bold">R$ {extractXmlTag(previewInvoice.xmlContent || '', 'vBC') || '0,00'}</p>
                             </div>
                             <div>
                               <p className="text-[8px] uppercase text-slate-600 font-bold">VALOR DO ICMS</p>
                               <p className="text-xs font-bold">R$ {extractXmlTag(previewInvoice.xmlContent || '', 'vICMS') || '0,00'}</p>
                             </div>
                             <div>
                               <p className="text-[8px] uppercase text-slate-600 font-bold">VALOR FRETE</p>
                               <p className="text-xs font-bold">R$ {extractXmlTag(previewInvoice.xmlContent || '', 'vFrete') || '0,00'}</p>
                             </div>
                             <div>
                               <p className="text-[8px] uppercase text-slate-600 font-bold">VALOR TOTAL DA NOTA</p>
                               <p className="text-sm font-black text-slate-950"><PrivateValue>R$ {previewInvoice.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</PrivateValue></p>
                             </div>
                           </div>
                        </div>
                     </div>

                    <div className="mb-4 mt-8">
                       <p className="font-bold text-[10px] bg-white px-2 py-1 uppercase tracking-widest text-slate-700 border-b border-slate-950">Dados dos Produtos / Serviços</p>
                       <div className="border border-slate-950 mt-1 overflow-hidden">
                         <table className="w-full text-left text-[9px]">
                           <thead>
                             <tr className="bg-slate-100 border-b border-slate-950 text-slate-950">
                               <th className="p-2 font-bold uppercase text-slate-600">Descrição Completa</th>
                               <th className="p-2 font-bold uppercase text-slate-600 w-16 text-center text-on">Qtd</th>
                               <th className="p-2 font-bold uppercase text-slate-600 w-16 text-center">Un</th>
                               <th className="p-2 font-bold uppercase text-slate-600 w-24 text-right">Valor Unit</th>
                               <th className="p-2 font-bold uppercase text-slate-600 w-24 text-right">Valor Total</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-300">
                             {getInvoiceItems(previewInvoice.xmlContent, previewInvoice.value).map((item, idx) => (
                               <tr key={idx} className="bg-white">
                                 <td className="p-2 font-black text-slate-950 whitespace-normal leading-tight max-w-[400px] uppercase">{item.xProd}</td>
                                 <td className="p-2 text-center text-slate-700 font-bold">{parseFloat(item.qCom).toLocaleString('pt-BR')}</td>
                                 <td className="p-2 text-center text-slate-700 font-bold">{item.uCom}</td>
                                 <td className="p-2 text-right text-slate-700 font-bold">{parseFloat(item.vUnCom).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                 <td className="p-2 text-right font-black text-slate-950">{parseFloat(item.vProd).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                               </tr>
                             ))}
                           </tbody>
                         </table>
                       </div>
                    </div>

                     <div className="mt-8">
                        <p className="font-bold text-[10px] bg-white px-2 py-1 uppercase tracking-widest text-slate-700 font-mono border-b border-slate-950">DADOS ADICIONAIS / ANOTAÇÕES ORIGINAIS (SEFAZ)</p>
                        <div className="border border-slate-950 mt-1 p-4 min-h-[120px] text-[10px] text-slate-800 whitespace-pre-wrap font-bold font-sans leading-relaxed uppercase bg-white">
                          {(extractXmlTag(previewInvoice.xmlContent || '', 'infAdic') || extractXmlTag(previewInvoice.xmlContent || '', 'infCpl') || 'NENHUMA ANOTAÇÃO ADICIONAL CONSTANTE NO DOCUMENTO ORIGINAL EMITIDO PELA SEFAZ.').replace(/<[^>]*>/g, '').trim()}
                        </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </motion.div>
        </div>
      )}

      <AnimatePresence>
        {copyAnimationState?.active && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, y: 50 }}
              className="bg-white dark:bg-surface-container rounded-[32px] p-8 shadow-2xl flex flex-col items-center justify-center max-w-sm border border-outline-variant/30 text-center relative overflow-hidden"
            >
              {/* Decorative background glow */}
              <div className="absolute -inset-10 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="relative flex items-center justify-center w-40 h-28 mb-4 pointer-events-none">
                {/* Folder Icon */}
                <motion.span 
                  initial={{ x: 30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                  className="material-symbols-outlined text-[64px] text-secondary absolute right-6"
                >
                  folder_open
                </motion.span>

                {/* Flying Document Icon */}
                <motion.span 
                  initial={{ x: -60, y: -20, rotate: -25, scale: 0.4, opacity: 0 }}
                  animate={{ x: 18, y: 0, rotate: 0, scale: 1, opacity: [0, 1, 1, 0.4, 0] }}
                  transition={{ 
                    duration: 1.0, 
                    times: [0, 0.2, 0.5, 0.8, 1],
                    ease: "easeInOut" 
                  }}
                  className="material-symbols-outlined text-[48px] text-primary absolute left-6"
                >
                  description
                </motion.span>

                {/* Explosion Sparkles on contact */}
                <motion.div 
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 0.2, 1.2, 1], opacity: [0, 0, 1, 0] }}
                  transition={{ delay: 0.6, duration: 0.6 }}
                  className="absolute right-12 top-6 flex items-center justify-center"
                >
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, idx) => (
                    <motion.div 
                      key={idx}
                      className="absolute w-2 h-2 rounded-full bg-emerald-500"
                      animate={{ 
                        x: Math.cos(angle * Math.PI / 180) * 45,
                        y: Math.sin(angle * Math.PI / 180) * 45,
                        scale: [1, 0.4]
                      }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  ))}
                </motion.div>

                {/* Inflow checkmark inside the folder after doc enters */}
                <motion.span 
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.3, 1], opacity: 1 }}
                  transition={{ delay: 0.7, duration: 0.4, type: "spring" }}
                  className="material-symbols-outlined text-[28px] text-emerald-500 absolute right-11 top-10 bg-white dark:bg-surface-container rounded-full shadow-sm p-0.5 border border-emerald-500/20"
                >
                  check_circle
                </motion.span>
              </div>

              <motion.h4 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-lg font-bold text-on-surface mb-1 relative z-10"
              >
                Copiado com Sucesso!
              </motion.h4>
              
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                transition={{ delay: 0.6 }}
                className="text-xs text-on-surface-variant font-medium font-mono uppercase relative z-10"
              >
                NF {copyAnimationState?.invoiceNumber || ""} → RASCUNHOS
              </motion.p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Vehicle Details Modal */}
      <AnimatePresence>
        {detailsModalVehicle && (
          <div 
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 overflow-y-auto" 
            onClick={() => setDetailsModalVehicle(null)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#f8fafc] dark:bg-[#f8fafc] rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col relative my-8" 
              onClick={e => e.stopPropagation()}
            >
              {/* Header / Top Bar */}
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white dark:bg-white shadow-sm">
                <h3 className="text-xl font-bold text-primary dark:text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined">info</span>
                  Detalhes do Veículo: {detailsModalVehicle.plate}
                </h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => navigate(`/fleet?editId=${detailsModalVehicle.id}`)}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white dark:bg-white text-slate-700 dark:text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                    Editar
                  </button>
                  <button 
                    onClick={() => setDetailsModalVehicle(null)}
                    className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-100 flex items-center justify-center text-slate-500 dark:text-slate-500 hover:text-error transition-all"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>

              <div className="p-8 overflow-y-auto max-h-[80vh] custom-scrollbar">
                <div className="grid grid-cols-12 gap-6">
                  {/* Hero Card */}
                  <div className="col-span-12 lg:col-span-8 h-[380px] rounded-2xl overflow-hidden relative shadow-sm border border-slate-200 dark:border-slate-200 group bg-white dark:bg-white">
                    <img 
                      className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105" 
                      src={detailsModalVehicle.imageUrl || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=1200"} 
                      alt={detailsModalVehicle.model} 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-blue-600/80 via-blue-400/20 to-transparent pointer-events-none"></div>
                    <div className="absolute bottom-8 left-8 text-on-primary">
                      <div className="flex items-center gap-3 mb-4">
                        <span className={`px-3 py-1 rounded font-bold text-[10px] uppercase tracking-wider ${detailsModalVehicle.status === 'Ativo' ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-red-100 dark:bg-red-100 text-red-700 dark:text-red-700 font-bold'}`}>
                          {detailsModalVehicle.status}
                        </span>
                        <span className="px-3 py-1 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded font-bold text-[10px] tracking-wider">
                          RENAVAM: <PrivateValue value={detailsModalVehicle.renavam || '01291533734'} />
                        </span>
                      </div>
                      <h2 className="text-[48px] font-black leading-none mb-2 tracking-tighter"><PrivateValue value={detailsModalVehicle.plate} /></h2>
                      <p className="text-lg opacity-90 font-medium">{detailsModalVehicle.brand} {detailsModalVehicle.model} • {detailsModalVehicle.bodywork || 'ABERTA/MECANISMO OPERACIONAL'}</p>
                    </div>
                  </div>

                  <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                    {/* Status Documentation */}
                    <div className={`p-6 rounded-2xl border-l-4 flex items-start gap-4 shadow-sm h-full ${detailsModalVehicle.exerciceStatus === 'Vencido' ? 'bg-red-50 border-red-500' : 'bg-blue-50 border-blue-500'}`}>
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 ${detailsModalVehicle.exerciceStatus === 'Vencido' ? 'bg-red-100' : 'bg-blue-100'}`}>
                        <span className={`material-symbols-outlined ${detailsModalVehicle.exerciceStatus === 'Vencido' ? 'text-red-500' : 'text-blue-600'}`}>
                          {detailsModalVehicle.exerciceStatus === 'Vencido' ? 'warning' : 'verified'}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-widest mb-1">Status Documentação</h3>
                        <p className="text-[20px] font-bold mb-1 text-slate-800 dark:text-slate-800">Exercício {detailsModalVehicle.exerciceYear || '2026'}</p>
                        <p className={`text-sm font-medium ${detailsModalVehicle.exerciceStatus === 'Vencido' ? 'text-red-600' : 'text-slate-500 dark:text-slate-500 opacity-70'}`}>
                          {detailsModalVehicle.exerciceStatus === 'Vencido' ? 'O licenciamento está atrasado.' : 'Documentação em dia e verificada.'}
                        </p>
                      </div>
                    </div>

                    {/* Odometer Card */}
                    <div className="bg-white dark:bg-white border border-slate-100 dark:border-slate-100 p-6 rounded-2xl shadow-sm flex flex-col justify-between h-full">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-widest">Status do Odômetro</h3>
                          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                            detailsModalVehicle.lastSyncStatus === 'success' || !detailsModalVehicle.lastSyncStatus
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-50 dark:text-emerald-600 dark:border-emerald-200' 
                              : 'bg-red-50 text-red-600 border-red-200 dark:bg-red-50 dark:text-red-600 dark:border-red-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                              detailsModalVehicle.lastSyncStatus === 'failed' ? 'bg-red-600' : 'bg-emerald-600'
                            }`}></span>
                            {detailsModalVehicle.lastSyncStatus === 'failed' ? 'ERRO SYNC' : 'CONECTADO'}
                          </div>
                        </div>
                        <div className="flex justify-between items-baseline mb-2">
                          <span className="text-[48px] font-bold text-blue-600 dark:text-blue-600 leading-none tracking-tight">{(detailsModalVehicle.currentKM || 0).toLocaleString('pt-BR')}</span>
                          <span className="text-[20px] font-bold text-slate-800 dark:text-slate-800">KM</span>
                        </div>
                        <div className="flex flex-col gap-1 mb-4 opacity-70">
                          <p className="text-[10px] text-slate-500 dark:text-slate-500 font-bold uppercase flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">sync</span>
                            Última sincronização
                          </p>
                          <p className="text-xs font-bold text-blue-600 dark:text-blue-600">
                            {new Date(detailsModalVehicle.lastSyncCheck || detailsModalVehicle.updatedAt || Date.now()).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <button 
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('MANUAL_KM_SYNC', { 
                              detail: { vehicleId: detailsModalVehicle.id, plate: detailsModalVehicle.plate } 
                            }));
                          }}
                          className="w-full py-2.5 bg-blue-50 border border-blue-200 dark:bg-blue-50 dark:border-blue-200 text-blue-600 dark:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-100 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-[18px]">refresh</span>
                          Sincronizar Agora
                        </button>
                      </div>
                      <div className="space-y-2 mt-6">
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 dark:bg-blue-600 rounded-full transition-all duration-1000" style={{ width: '65%' }}></div>
                        </div>
                        <div className="flex justify-between text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                          <span>Último: {((detailsModalVehicle.currentKM || 0) - 5000).toLocaleString('pt-BR')}</span>
                          <span>Próximo: {((detailsModalVehicle.currentKM || 0) + 5000).toLocaleString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Bento Grid */}
                  <div className="col-span-12 lg:col-span-4 bg-white dark:bg-white border border-slate-100 dark:border-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 dark:bg-slate-50 flex justify-between items-center">
                      <h3 className="text-[10px] font-bold text-slate-700 dark:text-slate-700 uppercase tracking-widest">Informações Técnicas</h3>
                      <span className="material-symbols-outlined text-blue-600 dark:text-blue-600 text-[20px]">precision_manufacturing</span>
                    </div>
                    <div className="p-6 divide-y divide-slate-100 dark:divide-slate-100 flex-1">
                      {[
                        { label: 'Cor Predominante', value: detailsModalVehicle.color || 'BRANCA', isBadge: true },
                        { label: 'Ano do Modelo', value: detailsModalVehicle.modelYear || '2023' },
                        { label: 'Combustível', value: detailsModalVehicle.fuelType || 'DIESEL' },
                        { label: 'Chassi', value: detailsModalVehicle.chassis || '9535V6TBXPR001424', font: 'font-mono' },
                        { label: 'Centro de Custo', value: (Array.isArray(detailsModalVehicle.costCenter) ? detailsModalVehicle.costCenter : [detailsModalVehicle.costCenter]).map(v => String(v || '').replace(/logística - região sul/gi, '').trim()).filter(Boolean).join(', ') || 'Sede Adm' },
                        { label: 'Lotação', value: detailsModalVehicle.capacity || '03P' },
                        { label: 'Peso Bruto Total (PBT)', value: detailsModalVehicle.grossWeight || '10.7' },
                        { label: 'CNPJ / CPF', value: detailsModalVehicle.ownerCnpj || '26.005.751/0001-94' },
                      ].map((spec, i) => (
                        <div key={i} className="py-3 flex justify-between items-center">
                          <span className="text-slate-500 dark:text-slate-500 text-sm font-medium">{spec.label}</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-sm ${spec.font || ''} text-slate-800 dark:text-slate-800`}>{spec.value}</span>
                            {spec.isBadge && (
                              <div className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: spec.value.toLowerCase().includes('bran') ? '#ffffff' : spec.value.toLowerCase().includes('pret') ? '#1f2937' : '#ccc' }}></div>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="pt-4">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-widest mb-2">Observação</p>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-700 p-3 bg-slate-50 dark:bg-slate-50 rounded-xl">
                          {detailsModalVehicle.observation || 'SEM OBSERVAÇÕES'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-12 lg:col-span-5 bg-white dark:bg-white border border-slate-100 dark:border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 dark:bg-slate-50 flex justify-between items-center">
                      <h3 className="text-[10px] font-bold text-slate-700 dark:text-slate-700 uppercase tracking-widest">Distribuição Mensal</h3>
                      <span className="material-symbols-outlined text-blue-600 dark:text-blue-600 text-[20px]">payments</span>
                    </div>
                    <div className="p-8 flex items-center gap-10 h-full">
                      <div className="relative h-40 w-40 shrink-0">
                        <svg className="h-full w-full transform -rotate-90">
                          <circle className="text-slate-100 dark:text-slate-100" cx="80" cy="80" fill="transparent" r="65" stroke="currentColor" strokeWidth="15"></circle>
                          <circle className="text-primary" cx="80" cy="80" fill="transparent" r="65" stroke="currentColor" strokeDasharray="408" strokeDashoffset="180" strokeWidth="15"></circle>
                          <circle className="text-orange-500" cx="80" cy="80" fill="transparent" r="65" stroke="currentColor" strokeDasharray="408" strokeDashoffset="320" strokeWidth="15"></circle>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase">Total</span>
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-800">R$ 1.2k</span>
                        </div>
                      </div>
                      <div className="flex-1 space-y-5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-2.5 w-2.5 rounded-full bg-primary flex-shrink-0"></div>
                            <span className="text-sm font-bold text-slate-500 dark:text-slate-500">Combustível</span>
                          </div>
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-800">55%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-2.5 w-2.5 rounded-full bg-orange-500 flex-shrink-0"></div>
                            <span className="text-sm font-bold text-slate-500 dark:text-slate-500">Manutenção</span>
                          </div>
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-800">30%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-2.5 w-2.5 rounded-full bg-slate-200 dark:bg-slate-200 flex-shrink-0"></div>
                            <span className="text-sm font-bold text-slate-500 dark:text-slate-500">Outros</span>
                          </div>
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-800">15%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-12 lg:col-span-3 bg-white dark:bg-white border border-slate-100 dark:border-slate-100 p-6 rounded-2xl shadow-sm flex flex-col items-center text-center">
                    <div className="flex justify-between items-center w-full mb-6">
                      <h3 className="text-[10px] font-bold text-slate-700 dark:text-slate-700 uppercase tracking-widest">Motoristas Atribuídos</h3>
                      <span className="material-symbols-outlined text-blue-600 dark:text-blue-600 text-[20px]">person_add</span>
                    </div>
                    <div className="w-full flex-1 flex flex-col items-center justify-center">
                      {assignedDriversForModal.length > 0 ? (
                        <div className="w-full space-y-4 text-slate-800 dark:text-slate-800">
                          {assignedDriversForModal.map(driver => (
                            <div key={driver.id} className="flex flex-col items-center">
                              <div className="h-20 w-20 rounded-full mx-auto overflow-hidden mb-3 border-2 border-primary p-1 bg-slate-100 shadow-md">
                                {driver.imageUrl ? (
                                  <img 
                                    src={driver.imageUrl} 
                                    alt={driver.name} 
                                    className={`h-full w-full rounded-full object-cover transition-all duration-300 ${isPrivacyMode ? 'blur-[8px]' : ''}`} 
                                  />
                                ) : (
                                  <div className="h-full w-full rounded-full bg-blue-50 dark:bg-blue-50 flex items-center justify-center font-bold text-blue-600 dark:text-blue-600 text-xl">
                                    {driver.name?.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <h4 className="text-base font-bold text-slate-800 dark:text-slate-800 leading-tight"><PrivateValue value={driver.name} /></h4>
                              <p className="text-[10px] text-slate-500 dark:text-slate-500 font-bold uppercase mt-1">Status: {driver.status}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10">
                          <span className="material-symbols-outlined text-4xl text-slate-500 dark:text-slate-500 opacity-20 mb-4 scale-150">person_off</span>
                          <p className="text-sm font-bold text-slate-500 dark:text-slate-500 opacity-60">Nenhum motorista atribuído</p>
                          <button 
                            onClick={() => navigate('/drivers')}
                            className="mt-6 px-6 py-2 rounded-full border border-primary text-primary text-[10px] font-bold uppercase tracking-widest hover:bg-primary hover:text-white transition-all"
                          >
                            Atribuir Agora
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
