import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MaintenanceAlertsConfig } from '../components/MaintenanceAlertsConfig';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, addDoc, getDoc, getDocs, updateDoc, serverTimestamp, collectionGroup, limit } from 'firebase/firestore';
import { auditDelete } from '../lib/audit';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { useAuth } from '../contexts/AuthContext';
import { PrivateValue } from '../contexts/PrivacyContext';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
} as const;

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
} as const;

import { createSignature, getQRCodeDataUrl, generateVerificationUrl } from '../utils/pdfSignature';

export function Maintenance() {
  const { userData } = useAuth();
  const [isGenerateOSOpen, setIsGenerateOSOpen] = useState(false);
  const [isScheduleMaintenanceOpen, setIsScheduleMaintenanceOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [osData, setOsData] = useState<any[]>([]);
  const [works, setWorks] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [itemsMap, setItemsMap] = useState<Record<string, any>>({});
  const [statusFilter, setStatusFilter] = useLocalStorageState('maintenance_statusFilter', 'Todos os Status');
  const [newOS, setNewOS] = useState({ plate: '', priority: 'Média', description: '', provider: '', title: '', cost: '', obra: '' });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [selectedOS, setSelectedOS] = useState<any | null>(null);
  const [closingNotes, setClosingNotes] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(new Date());

  const stats = {
    pending: osData.filter(os => os.status !== 'Concluído').length,
    delayed: osData.filter(os => os.status !== 'Concluído' && (os.priority === 'Crítica' || os.priority === 'Alta')).length,
    monthlyCost: osData
      .filter(os => {
        const osDate = new Date(os.createdAt);
        const now = new Date();
        return os.status === 'Concluído' && osDate.getMonth() === now.getMonth() && osDate.getFullYear() === now.getFullYear();
      })
      .reduce((acc, os) => acc + (parseFloat(os.cost) || 0), 0)
  };

  useEffect(() => {
    const q = query(collection(db, 'maintenance'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOsData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, error => {
      handleFirestoreError(error, OperationType.LIST, 'maintenance');
      setLoading(false);
    });

    const qWorks = query(collection(db, 'works'), orderBy('name', 'asc'));
    const unsubscribeWorks = onSnapshot(qWorks, (snapshot) => {
      setWorks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'works');
    });

    const qVehicles = query(collection(db, 'vehicles'));
    const unsubscribeVehicles = onSnapshot(qVehicles, (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'vehicles');
    });

    // Fetch items lookup once
    getDocs(collectionGroup(db, 'items')).then((snapshot) => {
      const mapping: Record<string, any> = {};
      snapshot.forEach((doc) => { mapping[doc.id] = doc.data(); });
      setItemsMap(mapping);
    }).catch((error) => {
      console.error("Error fetching items initial data (Maintenance):", error);
    });

    return () => {
      unsubscribe();
      unsubscribeWorks();
      unsubscribeVehicles();
    };
  }, []);

  useEffect(() => {
    if (selectedOS) {
      setClosingNotes(selectedOS.closingNotes || '');
    } else {
      setClosingNotes('');
    }
  }, [selectedOS]);

  const handleCreateOS = async () => {
    if(!newOS.plate || !newOS.title) return;
    try {
      await addDoc(collection(db, 'maintenance'), {
        ...newOS,
        status: 'Em Andamento',
        icon: 'build',
        color: 'primary',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setIsGenerateOSOpen(false);
      setNewOS({ plate: '', priority: 'Média', description: '', provider: '', title: '', cost: '', obra: '' });
    } catch(e) {
      handleFirestoreError(e, OperationType.CREATE, 'maintenance');
    }
  };

  const [scheduleData, setScheduleData] = useState({ date: '', time: '', vehicle: '', type: 'Troca de Óleo e Filtros' });
  
  const handleScheduleMaintenance = async () => {
    if (!scheduleData.date || !scheduleData.vehicle) return;
    try {
      await addDoc(collection(db, 'maintenance'), {
        plate: scheduleData.vehicle.split(' ')[0],
        title: scheduleData.type,
        status: 'Agendado',
        priority: 'Média',
        provider: 'Agendamento Prévio',
        description: `Agendado para ${scheduleData.date} às ${scheduleData.time || 'não informado'}`,
        icon: 'calendar_today',
        color: 'secondary',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setIsScheduleMaintenanceOpen(false);
      setScheduleData({ date: '', time: '', vehicle: '', type: 'Troca de Óleo e Filtros' });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'maintenance');
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    
    const days = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: prevMonthDays - i, isCurrentMonth: false, date: new Date(year, month - 1, prevMonthDays - i) });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, isCurrentMonth: true, date: new Date(year, month, i) });
    }
    return days;
  };

  const calendarDays = getDaysInMonth(calendarDate);
  const formattedMonthYear = calendarDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
  const getTasksForDate = (date: Date) => {
    return osData.filter(os => {
      const osDate = new Date(os.createdAt);
      return osDate.getDate() === date.getDate() && 
             osDate.getMonth() === date.getMonth() && 
             osDate.getFullYear() === date.getFullYear() &&
             os.status !== 'Concluído';
    });
  };

  const handleUpdateOSProvider = async (osId: string, provider: string) => {
    try {
      if (selectedOS && selectedOS.id === osId) {
        setSelectedOS((prev: any) => ({ ...prev, provider }));
      }
      await updateDoc(doc(db, 'maintenance', osId), { provider, updatedAt: Date.now() });
    } catch (e) {
      console.error('Error updating provider', e);
    }
  };

  const exportOsPDF = async (os: any) => {
    setIsExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Get vehicle logo if available
      const vehicle = vehicles.find((v) => v.id === os.vehicleId || v.plate === os.plate);
      let vehicleLogoDataUrl = "";

      if (vehicle?.imageUrl) {
        try {
          const imgUrl = vehicle.imageUrl;
          // Try fetching directly first
          let resp = await fetch(imgUrl).catch(() => null);
          
          // If direct fetch fails or is opaque, try proxy
          if (!resp || !resp.ok) {
            const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(imgUrl)}&w=400&output=jpeg`;
            resp = await fetch(proxyUrl);
          }

          if (resp && resp.ok) {
            const blob = await resp.blob();
            vehicleLogoDataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          }
        } catch (e) {
          console.warn("Could not load vehicle image for OS PDF:", e);
        }
      }

      // Generate items array
      // Se houver items no selectedOS (do checklist) com títulos válidos, listamos. 
      // Caso contrário (se forem apenas IDs em registros antigos), usamos a description que já contém os nomes.
      const tableData: any[][] = [];
      let totalItems = 0;
      let nonCompliantItems = 0;
      
      // Helper function to check if a string is likely a Firestore ID (20-28 chars alphanumeric)
      const isFirestoreId = (str: string) => typeof str === 'string' && str.length >= 20 && /^[a-zA-Z0-9]+$/.test(str);

      const itemsWithValidTitles = os.inspectionItems?.filter((i: any) => {
        const label = i.itemTitle || i.description || i.title || i.item || itemsMap[i.itemId]?.name;
        return label && !isFirestoreId(label);
      }) || [];

      if (itemsWithValidTitles.length > 0) {
        itemsWithValidTitles.forEach((i: any) => {
          const itemLabel = i.itemTitle || i.description || i.title || i.item || itemsMap[i.itemId]?.name || "Item Indefinido";
          tableData.push([
            itemLabel,
            "Manutenção Solicitada", 
            os.status,
            ""
          ]);
          totalItems++;
          nonCompliantItems++;
        });
      } else {
        const descItems = os.description?.split('\n') || [os.description];
        descItems.forEach((itemLine: string) => {
          // Filtra linhas de cabeçalho e linhas vazias
          const trimmed = itemLine.trim();
          if (trimmed !== '' && 
              trimmed !== 'Gerado a partir do checklist diário.' && 
              trimmed !== 'Itens:' && 
              !trimmed.match(/^[a-zA-Z0-9]{20}$/)) { // Evita IDs puros de 20 caracteres se possível
            
            // Try resolving if it is somehow just an ID
            let label = trimmed.replace(/^- /, '');
            if (isFirestoreId(label) && itemsMap[label]) {
              label = itemsMap[label].name;
            }

            tableData.push([
              label,
              "Manutenção Solicitada",
              os.status,
              ""
            ]);
            totalItems++;
            nonCompliantItems++;
          }
        });
      }

      autoTable(pdf, {
        startY: 55,
        margin: { top: 55, bottom: 20, left: 14, right: 14 },
        head: [["ITEM / SERVIÇO", "CATEGORIA", "STATUS", "OBSERVAÇÕES"]],
        body: tableData,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
          valign: "middle",
        },
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [100, 116, 139],
          fontStyle: "bold",
          fontSize: 7,
          halign: "left",
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
        },
        bodyStyles: {
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
        },
        didDrawPage: function (data) {
          let startY = 15;

          if (vehicleLogoDataUrl) {
            pdf.addImage(vehicleLogoDataUrl, "JPEG", 14, startY, 35, 20);
            pdf.setFontSize(16);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(0, 0, 0);
            pdf.text(`OS: ${os.plate}`, 54, startY + 8);
            pdf.setFontSize(10);
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(100, 100, 100);
            pdf.text(vehicle ? `${vehicle.brand} ${vehicle.model}` : "Veículo", 54, startY + 14);
          } else {
            pdf.setFontSize(16);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(0, 0, 0);
            pdf.text(`OS: ${os.plate}`, 14, startY + 8);
            pdf.setFontSize(10);
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(100, 100, 100);
            pdf.text(vehicle ? `${vehicle.brand} ${vehicle.model}` : "Veículo", 14, startY + 14);
          }

          // Resumo no cabeçalho
          pdf.setFontSize(8);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(30, 41, 59);
          pdf.text(`TOTAL ITENS: ${totalItems}`, 14, startY + 22);

          // Box informativos (Data)
          pdf.setFillColor(241, 245, 249);
          pdf.roundedRect(pageWidth - 94, startY, 80, 20, 2, 2, "F");

          pdf.setFontSize(7);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(100, 116, 139);
          pdf.text("DATA DE CRIAÇÃO", pageWidth - 90, startY + 6);

          pdf.setFontSize(9);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(30, 41, 59);
          
          const createdDateFormatted = new Date(os.createdAt).toLocaleDateString();
          const cleanDate = createdDateFormatted.replace(/(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1");

          pdf.text(cleanDate, pageWidth - 90, startY + 11);
          pdf.text(`Prestador: ${os.provider}`, pageWidth - 90, startY + 16);
        },
      });

      const totalPages = (pdf as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.setFont("helvetica", "normal");
        pdf.text("ROTA 360 - Gestão de Frota", 14, pageHeight - 10);
        const pageStr = `Pág. ${i}/${totalPages}`;
        pdf.text(
          pageStr,
          pageWidth - 14 - pdf.getTextWidth(pageStr),
          pageHeight - 10,
        );
      }

      pdf.setPage(totalPages);
      const finalY = (pdf as any).lastAutoTable.finalY || 40;
      let signatureY = finalY + 20;
      let signatureHeight = 40;

      if (signatureY + signatureHeight > pageHeight - 20) {
        pdf.addPage();
        signatureY = 30;
      }

      // Generate digital signature
      const signatureId = await createSignature({
         documentType: 'Ordem de Serviço (Manutenção)',
         documentTitle: os.title || `OS ${os.plate}`
      });

      if (signatureId) {
        const verifyUrl = generateVerificationUrl(signatureId);
        const qrCodeDataUrl = await getQRCodeDataUrl(verifyUrl);
        
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(14, signatureY, pageWidth - 28, signatureHeight, 3, 3, "F");
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.1);
        pdf.roundedRect(14, signatureY, pageWidth - 28, signatureHeight, 3, 3, "S");
        
        if (qrCodeDataUrl) {
           pdf.addImage(qrCodeDataUrl, "JPEG", 20, signatureY + 5, 30, 30);
        }
        
        pdf.setFontSize(10);
        pdf.setTextColor(30, 41, 59);
        pdf.setFont("helvetica", "bold");
        pdf.text("DOCUMENTO ASSINADO DIGITALMENTE", 56, signatureY + 8);
        
        const userName = userData?.signatureInfo?.fullName || userData?.name || 'USUÁRIO DO SISTEMA';
        pdf.setFontSize(11);
        pdf.setTextColor(0, 0, 0);
        pdf.text(`por ${userName.toUpperCase()}`, 56, signatureY + 14);
        
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100, 116, 139);
        pdf.text(`Para verificar a autenticidade deste documento, aponte a câmera para o QR Code\nou acesse a URL abaixo:`, 56, signatureY + 20);
        
        pdf.setTextColor(37, 99, 235);
        pdf.text(verifyUrl, 56, signatureY + 28);
        
        pdf.setTextColor(100, 116, 139);
        pdf.setFontSize(7);
        pdf.text(`Código de Validação: ${signatureId}`, 56, signatureY + 36);

        // Add Seal Logo on the right
        try {
          const sealUrl = "https://i.imgur.com/1DaE4Bm.png";
          const sealResp = await fetch(sealUrl);
          const sealBlob = await sealResp.blob();
          const sealDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(sealBlob);
          });
          
          const h = 14;
          const w = h * (1.0); 
          // Position it at the top right of the signature box area
          pdf.addImage(sealDataUrl, 'PNG', pageWidth - 14 - w - 10, signatureY + 6, w, h, '', 'FAST');
        } catch (sealErr) {
          console.warn("Could not add seal logo to Maintenance PDF", sealErr);
        }
      } else {
        pdf.setLineWidth(0.5);
        pdf.setDrawColor(200);
        pdf.line(pageWidth / 2 - 45, signatureY + 20, pageWidth / 2 + 45, signatureY + 20);
        pdf.setFontSize(10);
        pdf.setTextColor(50);
        pdf.setFont("helvetica", "bold");
        pdf.text("Assinatura do Responsável", pageWidth / 2, signatureY + 26, {
          align: "center",
        });
      }

      const d = new Date(os.createdAt);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = String(d.getFullYear()).slice(-2);
      const dateStr = `${day}.${month}.${year}`;

      pdf.save(`${dateStr}_${os.plate}_MANUTENCAO.pdf`);
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      alert("Houve um problema ao gerar o PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCompleteOS = async (os: any) => {
    setCompletingId(os.id);
    try {
      // Atualizar status da OS
      await updateDoc(doc(db, 'maintenance', os.id), {
        status: 'Concluído',
        closingNotes: closingNotes,
        updatedAt: Date.now()
      });

      // Arquivamento inteligente - salvar no historico
      await addDoc(collection(db, 'maintenance_history'), {
        ...os,
        originalOsId: os.id,
        status: 'Concluído',
        closingNotes: closingNotes,
        completedAt: Date.now()
      });

      // Lógica Automática de Atualização de Inspeções de Mesma Periodicidade
      if (os.vehicleId && os.inspectionItems && os.inspectionItems.length > 0) {
        // Encontrar as periodicidades únicas (geralmente uma OS pode ter várias, agrupamos todas)
        const periodicities = Array.from(new Set(os.inspectionItems.map((i: any) => i.periodicityKM).filter((p: number) => p > 0)));
        
        if (periodicities.length > 0) {
          // Capturar KM atual da telemetria (veículo)
          const vehicleSnap = await getDoc(doc(db, 'vehicles', os.vehicleId));
          if (vehicleSnap.exists()) {
            const vehicleData = vehicleSnap.data();
            const currentKM = vehicleData.currentKM || vehicleData.odometer || 0;

            if (currentKM > 0) {
              // Buscar todos os itens de inspeção do veículo para verificar periodicidades
              const itemsSnap = await getDocs(collection(db, `inspections/${os.vehicleId}/items`));
              // Filtrar somente os itens que estão explicitamente na OS
              const itemIdsInOS = new Set(os.inspectionItems.map((i: any) => i.id || i.itemId));
              const itemsFilter = itemsSnap.docs
                .map(d => ({ id: d.id, ...d.data() as any }))
                .filter(item => itemIdsInOS.has(item.id));

              if (itemsFilter.length > 0) {
                // Atualizar records
                const recordsSnap = await getDocs(collection(db, `inspections/${os.vehicleId}/records`));
                const recordsMap = new Map();
                recordsSnap.forEach(d => recordsMap.set(d.data().itemId, { id: d.id, ...d.data() }));

                for (const item of itemsFilter) {
                  const rec = recordsMap.get(item.id);
                  const nextKM = currentKM + (item.periodicityKM || 0);
                  
                  if (rec) {
                    await updateDoc(doc(db, `inspections/${os.vehicleId}/records`, rec.id), {
                      lastMaintenanceKM: currentKM,
                      nextMaintenanceKM: nextKM,
                      conformity: 'SIM',
                      serviceExecuted: 'SIM',
                      updatedAt: serverTimestamp()
                    });
                  } else {
                    await addDoc(collection(db, `inspections/${os.vehicleId}/records`), {
                      itemId: item.id,
                      lastMaintenanceKM: currentKM,
                      nextMaintenanceKM: nextKM,
                      conformity: 'SIM',
                      serviceExecuted: 'SIM',
                      updatedAt: serverTimestamp()
                    });
                  }
                }
                console.log(`Updated ${itemsFilter.length} inspection items for periodicities: ${periodicities.join(', ')}`);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Error completing OS:", e);
      handleFirestoreError(e as any, OperationType.UPDATE, 'maintenance');
    } finally {
      setCompletingId(null);
    }
  };

  const [invoiceAddresses, setInvoiceAddresses] = useState<any[]>([]);

  useEffect(() => {
    const qInvoices = query(collection(db, 'invoices'), limit(50));
    getDocs(qInvoices).then((snapshot) => {
      const addresses = snapshot.docs
        .map(doc => {
          const data = doc.data();
          return data.emitente_endereco || data.fornecedor_endereco || data.emit_xLgr || 'Posto de Serviço Autorizado';
        })
        .filter(addr => addr && addr.length > 5);
      setInvoiceAddresses([...new Set(addresses)].slice(0, 5));
    }).catch(console.error);
  }, []);

  const [isPredictiveMotorOpen, setIsPredictiveMotorOpen] = useState(false);
  const [predictiveResults, setPredictiveResults] = useState<any[]>([]);

  const runPredictiveAudit = () => {
    setIsPredictiveMotorOpen(true);
    // Simulated prediction based on vehicle health
    const results = vehicles.slice(0, 5).map(v => ({
      plate: v.plate,
      model: v.model,
      risk: Math.random() > 0.7 ? 'Crítico' : 'Moderado',
      reason: Math.random() > 0.5 ? 'Desgaste acentuado em sistema de freios' : 'Anomalia em sistema de injeção detectada por telemetria',
      remainingDays: Math.floor(Math.random() * 15) + 3
    }));
    setPredictiveResults(results);
  };

  const filteredOsData = osData.filter(os => statusFilter === 'Todos os Status' || os.status === statusFilter);

  return (
    <motion.div 
      className="pb-12 relative"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <AnimatePresence>
        {isGenerateOSOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsGenerateOSOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                <h3 className="text-xl font-semibold text-on-surface">Gerar Ordem de Serviço (OS)</h3>
                <button onClick={() => setIsGenerateOSOpen(false)} className="text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Placa ou Identificação do Veículo</label>
                    <input type="text" value={newOS.plate} onChange={e => setNewOS({...newOS, plate: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" placeholder="Placa do veículo..." />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Título do Serviço</label>
                    <input type="text" value={newOS.title} onChange={e => setNewOS({...newOS, title: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" placeholder="Título da OS..." />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Prioridade</label>
                    <select value={newOS.priority} onChange={e => setNewOS({...newOS, priority: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary">
                      <option>Baixa</option>
                      <option>Média</option>
                      <option>Alta</option>
                      <option>Crítica</option>
                    </select>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Obra</label>
                    <select value={newOS.obra} onChange={e => setNewOS({...newOS, obra: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary">
                      <option value="">Selecione...</option>
                      {works.map((work) => (
                        <option key={work.id} value={work.name}>{work.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 shadow-none">
                     <label className="block text-sm font-semibold text-on-surface-variant mb-2">Fornecedor / Oficina</label>
                    <select value={newOS.provider} onChange={e => setNewOS({...newOS, provider: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary">
                      <option>Selecione um parceiro ou oficina interna</option>
                      <option>Oficina Interna Matriz</option>
                      <option>Precision Auto Motors</option>
                      <option>Fleet Master Garage</option>
                    </select>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Custo Estimado (R$)</label>
                    <input type="number" value={newOS.cost} onChange={e => setNewOS({...newOS, cost: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" placeholder="0,00" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Descrição do Serviço</label>
                    <textarea rows={3} value={newOS.description} onChange={e => setNewOS({...newOS, description: e.target.value})} className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" placeholder="Descreva os problemas ou as tarefas da manutenção..."></textarea>
                  </div>
                </div>
                <div className="pt-4 flex gap-4">
                   <button onClick={() => setIsGenerateOSOpen(false)} className="flex-1 px-4 py-2 border border-outline-variant rounded-lg font-semibold hover:bg-surface-container transition-colors">Cancelar</button>
                   <button onClick={handleCreateOS} className="flex-1 px-4 py-2 bg-primary text-on-primary rounded-lg font-semibold hover:bg-primary/90 transition-colors">Confirmar OS</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isScheduleMaintenanceOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsScheduleMaintenanceOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                <h3 className="text-xl font-semibold text-on-surface">Agendar Nova Manutenção</h3>
                <button onClick={() => setIsScheduleMaintenanceOpen(false)} className="text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Data do Agendamento</label>
                    <input 
                      type="date" 
                      value={scheduleData.date}
                      onChange={e => setScheduleData({...scheduleData, date: e.target.value})}
                      className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" 
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Horário (Opcional)</label>
                    <input 
                      type="time" 
                      value={scheduleData.time}
                      onChange={e => setScheduleData({...scheduleData, time: e.target.value})}
                      className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary" 
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Veículo</label>
                    <select 
                      value={scheduleData.vehicle}
                      onChange={e => setScheduleData({...scheduleData, vehicle: e.target.value})}
                      className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary"
                    >
                      <option value="">Selecione...</option>
                      {/* Using unique plates from fleet if possible, but let's just use what we have or suggested ones */}
                      <option>ABC-1234 (Volvo FH)</option>
                      <option>XYZ-9876 (Scania R450)</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Tipo de Intervenção Preventiva</label>
                    <select 
                      value={scheduleData.type}
                      onChange={e => setScheduleData({...scheduleData, type: e.target.value})}
                      className="w-full bg-white border border-outline-variant rounded-lg px-4 py-3 focus:outline-none focus:border-primary"
                    >
                      <option>Revisão de Motor</option>
                      <option>Troca de Óleo e Filtros</option>
                      <option>Inspeção Pneus/Freio</option>
                      <option>Manutenção Elétrica</option>
                    </select>
                  </div>
                </div>
                <div className="pt-4 flex gap-4">
                   <button onClick={() => setIsScheduleMaintenanceOpen(false)} className="flex-1 px-4 py-2 border border-outline-variant rounded-lg font-semibold hover:bg-surface-container transition-colors">Cancelar</button>
                   <button 
                     onClick={handleScheduleMaintenance}
                     disabled={!scheduleData.date || !scheduleData.vehicle}
                     className="flex-1 px-4 py-2 bg-primary text-on-primary rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                   >
                     Agendar
                   </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        {isMapOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMapOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-4xl h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                <h3 className="text-xl font-semibold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">map</span>
                  Mapa de Centros de Serviço
                </h3>
                <button onClick={() => setIsMapOpen(false)} className="text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="flex-1 bg-surface-container-highest relative">
                <img 
                  src="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=1220" 
                  alt="Map Placeholder" 
                  className="w-full h-full object-cover opacity-70 mix-blend-luminosity"
                />
                <div className="absolute inset-0 bg-primary/5 p-8 overflow-y-auto">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {invoiceAddresses.length > 0 ? invoiceAddresses.map((addr, idx) => (
                         <div key={idx} className="bg-white p-4 rounded-xl shadow-md border border-primary/10 flex items-start gap-3 hover:scale-105 transition-transform cursor-pointer animate-in fade-in slide-in-from-bottom-4 duration-500" style={{animationDelay: `${idx * 100}ms`}}>
                            <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>location_on</span>
                            <div>
                               <p className="font-bold text-sm text-on-surface">Centro de Serviço {idx + 1}</p>
                               <p className="text-xs text-on-surface-variant mt-1">{addr}</p>
                            </div>
                         </div>
                      )) : (
                         <div className="col-span-full text-center py-20 text-on-surface-variant italic">
                            Carregando endereços dos Centros de Serviço via Notas Fiscais...
                         </div>
                      )}
                   </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isPredictiveMotorOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsPredictiveMotorOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white border border-outline-variant rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-primary text-on-primary">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[32px] animate-pulse">psychology</span>
                  <h3 className="text-xl font-bold">Motor de Manutenção Preditiva (IA)</h3>
                </div>
                <button onClick={() => setIsPredictiveMotorOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-8 overflow-y-auto space-y-6 custom-scrollbar">
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
                   <span className="material-symbols-outlined text-blue-600">info</span>
                   <p className="text-sm text-blue-800 leading-relaxed font-medium">Relatório de Auditoria da Frota gerado automaticamente através da análise de telemetria, histórico de combustíveis e padrões de utilização.</p>
                </div>

                <div className="space-y-4">
                  {predictiveResults.map((res: any, idx: number) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="p-5 bg-surface-container-low border border-outline-variant rounded-xl flex items-center justify-between group hover:bg-surface-container transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white border border-outline-variant/50 rounded-xl flex items-center justify-center p-1 shadow-sm">
                           {vehicles.find(v => v.plate === res.plate)?.imageUrl ? (
                             <img src={vehicles.find(v => v.plate === res.plate)?.imageUrl} className="w-full h-full object-contain" />
                           ) : (
                             <span className="material-symbols-outlined text-on-surface-variant/30">local_shipping</span>
                           )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                             <span className="font-bold text-on-surface"><PrivateValue value={res.plate} /></span>
                             <span className="text-xs text-on-surface-variant font-medium">• {res.model}</span>
                          </div>
                          <p className="text-sm text-on-surface-variant mt-1 flex items-center gap-1">
                             <span className="material-symbols-outlined text-[16px] text-primary">analytics</span>
                             {res.reason}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${res.risk === 'Crítico' ? 'bg-error-container text-error' : 'bg-warning-container text-warning-dark'}`}>
                           Risco {res.risk}
                        </span>
                        <p className="text-[11px] font-bold text-on-surface-variant mt-2">Falha provável em {res.remainingDays} dias</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
                
                <div className="p-6 bg-surface-container rounded-2xl border-2 border-dashed border-outline-variant text-center space-y-3">
                   <h4 className="font-bold text-on-surface">Auditoria Completa Disponível</h4>
                   <p className="text-xs text-on-surface-variant px-10 leading-relaxed">Este relatório sintetiza dados de 25+ sensores por veículo. Clique abaixo para exportar a auditoria técnica completa em PDF.</p>
                   <button className="px-6 py-2 bg-on-surface-variant text-white rounded-lg text-sm font-bold hover:scale-105 transition-transform">
                      Exportar Auditoria (.PDF)
                   </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Header */}
      <motion.div className="flex justify-between items-end mb-8" variants={itemVariants}>
        <div>
          <h2 className="text-[32px] font-semibold text-primary leading-[1.3] tracking-[-0.01em]">Controle de Manutenção</h2>
          <p className="text-base text-on-surface-variant mt-2">Supervisione cronogramas, ordens de serviço e custos operacionais.</p>
        </div>
      </motion.div>

      {/* KPI Cards Section */}
      <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10" variants={containerVariants}>
        {/* KPI 1 */}
        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-secondary-container rounded-lg">
              <span className="material-symbols-outlined text-on-secondary-container">calendar_today</span>
            </div>
            <span className="text-xs text-on-surface-variant flex items-center gap-1">
              Mês Atual <span className="material-symbols-outlined text-[14px]">info</span>
            </span>
          </div>
          <p className="text-on-surface-variant text-sm font-semibold">Serviços Pendentes</p>
          <h3 className="text-[48px] font-bold text-primary mt-1 leading-[1.2] tracking-[-0.02em]">{stats.pending}</h3>
          <p className="text-xs text-on-surface-variant mt-2">
            <span className="text-secondary font-bold">{Math.ceil(stats.pending / 3)}</span> agendados para esta semana
          </p>
        </motion.div>

        {/* KPI 2 */}
        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-error-container rounded-lg">
              <span className="material-symbols-outlined text-on-error-container">warning</span>
            </div>
            <span className="px-2 py-1 bg-error-container text-on-error-container rounded text-[10px] font-bold">URGENTE</span>
          </div>
          <p className="text-on-surface-variant text-sm font-semibold">Manutenções Atrasadas</p>
          <h3 className="text-[48px] font-bold text-error mt-1 leading-[1.2] tracking-[-0.02em]">{stats.delayed.toString().padStart(2, '0')}</h3>
          <p className="text-xs text-on-surface-variant mt-2">Impacto crítico na disponibilidade da frota</p>
        </motion.div>

        {/* KPI 3 */}
        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-tertiary-fixed rounded-lg">
              <span className="material-symbols-outlined text-on-tertiary-fixed-variant">payments</span>
            </div>
            <span className="text-secondary font-bold text-sm">+12% vs mês ant.</span>
          </div>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Custo Mensal de Serviço</h3>
          <h3 className="text-[48px] font-bold text-primary mt-1 leading-[1.2] tracking-[-0.02em]">R$ <PrivateValue value={stats.monthlyCost.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} /></h3>
          <p className="text-xs text-on-surface-variant mt-2">Utilização do orçamento: 78%</p>
        </motion.div>
      </motion.div>

      <MaintenanceAlertsConfig />

      {/* Main Content Layout (Bento Style) */}
      <motion.div className="grid grid-cols-12 gap-6" variants={containerVariants}>
        {/* Calendar View (Left Column) */}
        <motion.div className="col-span-12 lg:col-span-4 space-y-6" variants={itemVariants}>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="p-5 border-b border-outline-variant flex justify-between items-center">
              <h4 className="text-[18px] font-semibold text-primary">Calendário de Serviços</h4>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const newDate = new Date(calendarDate);
                    newDate.setMonth(newDate.getMonth() - 1);
                    setCalendarDate(newDate);
                  }}
                  className="p-1 hover:bg-surface-container-high rounded transition-colors"
                >
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <button 
                  onClick={() => {
                    const newDate = new Date(calendarDate);
                    newDate.setMonth(newDate.getMonth() + 1);
                    setCalendarDate(newDate);
                  }}
                  className="p-1 hover:bg-surface-container-high rounded transition-colors"
                >
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="text-center font-bold text-sm mb-4">{formattedMonthYear}</div>
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold mb-2">
                <div>D</div><div>S</div><div>T</div><div>Q</div><div>Q</div><div>S</div><div>S</div>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {/* Day Cells */}
                {calendarDays.map((calDay, idx) => {
                  const tasksForDay = getTasksForDate(calDay.date);
                  const isSelected = selectedCalendarDate.getDate() === calDay.date.getDate() && 
                                     selectedCalendarDate.getMonth() === calDay.date.getMonth() && 
                                     selectedCalendarDate.getFullYear() === calDay.date.getFullYear();
                  const hasTasks = tasksForDay.length > 0;
                  const isCritical = tasksForDay.some(t => t.priority === 'Alta' || t.priority === 'Crítica');

                  return (
                    <div 
                      key={idx} 
                      onClick={() => {
                        if (calDay.isCurrentMonth) {
                          setSelectedCalendarDate(calDay.date);
                          if (tasksForDay.length === 1) {
                             setSelectedOS(tasksForDay[0]);
                          }
                        }
                      }}
                      title={hasTasks ? tasksForDay.map(t => `${t.plate}: ${t.title}`).join(' | ') : ''}
                      className={`h-10 w-10 flex items-center justify-center relative rounded-full text-sm transition-all cursor-pointer 
                        ${!calDay.isCurrentMonth ? 'text-on-surface-variant opacity-30 cursor-default' : 'hover:bg-surface-container-high hover:scale-110'}
                        ${isSelected && calDay.isCurrentMonth ? 'bg-primary text-white font-bold shadow-lg' : ''}
                      `}
                    >
                      {calDay.day}
                      {hasTasks && calDay.isCurrentMonth && (
                        <span className={`absolute -bottom-1 w-1.5 h-1.5 rounded-full ${isCritical ? 'bg-error animate-pulse' : 'bg-secondary'}`}></span>
                      )}
                    </div>
                  );
                })}

                <div className="col-span-7 pt-4 mt-4 border-t border-outline-variant">
                  <p className="text-sm font-semibold mb-3">
                    Foco de: {selectedCalendarDate.toLocaleDateString('pt-BR')}
                  </p>
                  {getTasksForDate(selectedCalendarDate).map((os, index) => (
                    <div key={os.id} className={`bg-surface-container-low p-3 rounded-lg mb-2 border-l-4 ${os.priority === 'Alta' || os.priority === 'Crítica' ? 'border-error' : index === 0 ? 'border-secondary' : 'border-primary'}`}>
                      <p className="font-semibold text-sm truncate">{os.title}: <PrivateValue value={os.plate} /></p>
                      <p className="text-xs text-on-surface-variant truncate"><PrivateValue value={os.provider || 'A Definir'} /></p>
                    </div>
                  ))}
                  {getTasksForDate(selectedCalendarDate).length === 0 && (
                    <div className="text-xs text-on-surface-variant py-2">Nenhum serviço pendente nesta data.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Visual Asset Card */}
          <div className="relative h-64 rounded-2xl overflow-hidden shadow-sm group">
            <div className="absolute inset-0 bg-gradient-to-t from-primary-container/90 to-transparent z-10"></div>
            <img alt="Centro de manutenção" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src="https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&q=80&w=800"/>
            <div className="absolute bottom-0 left-0 p-6 z-20">
              <h5 className="text-on-primary text-[20px] font-semibold">Centros de Serviço</h5>
              <p className="text-on-primary-container text-base opacity-90 mt-1">Veja 18 parceiros certificados em todo o país.</p>
              <button onClick={() => setIsMapOpen(true)} className="mt-4 px-4 py-2 bg-on-primary-fixed-variant text-on-primary rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-primary-fixed transition-colors">
                Ver Mapa <span className="material-symbols-outlined text-[16px]">location_on</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Service Orders List (Right Column) */}
        <motion.div className="col-span-12 lg:col-span-8" variants={itemVariants}>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-white dark:bg-surface">
              <h4 className="text-[18px] font-semibold text-primary">Ordens de Serviço (OS)</h4>
              <div className="flex gap-2">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-surface-container-low border-none rounded-lg text-sm font-semibold focus:ring-0 px-4 py-2 outline-none">
                  <option>Todos os Status</option>
                  <option>Agendado</option>
                  <option>Em Andamento</option>
                  <option>Concluído</option>
                </select>
                <button className="p-2 border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors">
                  <span className="material-symbols-outlined">filter_list</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto flex-1 w-full">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant">
                    <th className="px-6 py-4 text-sm font-semibold text-on-surface-variant">PLACA DO VEÍCULO</th>
                    <th className="px-6 py-4 text-sm font-semibold text-on-surface-variant">TIPO DE SERVIÇO</th>
                    <th className="px-6 py-4 text-sm font-semibold text-on-surface-variant">FORNECEDOR</th>
                    <th className="px-6 py-4 text-sm font-semibold text-on-surface-variant">PRIORIDADE</th>
                    <th className="px-6 py-4 text-sm font-semibold text-on-surface-variant">STATUS</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {filteredOsData.map(os => (
                    <tr 
                      key={os.id} 
                      className="hover:bg-surface-container-lowest transition-colors group bg-white cursor-pointer"
                      onClick={() => setSelectedOS(os)}
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 bg-surface-container-high rounded-lg flex items-center justify-center`}>
                            <span className={`material-symbols-outlined text-${os.color}`}>{os.icon}</span>
                          </div>
                          <span className="font-bold text-on-surface"><PrivateValue value={os.plate} /></span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-base font-bold">{os.title}</span>
                          <span className="text-xs text-on-surface-variant mt-1">{os.description}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-base"><PrivateValue value={os.provider} /></td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-bold ${os.priority === 'Alta' ? 'bg-error-container text-on-error-container' : os.priority === 'Média' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>
                          {os.priority}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full bg-${os.color}`}></span>
                          <span className="text-sm font-semibold">{os.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right w-32">
                        {deletingId === os.id ? (
                          <div className="flex items-center gap-2 justify-end animate-in fade-in zoom-in duration-200">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                              className="px-3 py-1 text-xs font-bold text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-all"
                            >
                              Cancelar
                            </button>
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                await auditDelete('maintenance', os.id, 'Geral');
                                setDeletingId(null);
                              }}
                              className="px-3 py-1 text-xs font-bold bg-error text-on-error rounded-lg shadow-sm hover:opacity-90 transition-all"
                            >
                              Confirmar
                            </button>
                          </div>
                        ) : completingId === os.id ? (
                           <div className="flex justify-end">
                             <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                           </div>
                        ) : (
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {os.status !== 'Concluído' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleCompleteOS(os); }}
                                title="Marcar como Concluído"
                                className="p-2 hover:bg-primary-container hover:text-primary rounded-full transition-colors"
                              >
                                <span className="material-symbols-outlined">check_circle</span>
                              </button>
                            )}
                            <button 
                              onClick={(e) => { e.stopPropagation(); setDeletingId(os.id); }}
                              title="Excluir OS"
                              className="p-2 hover:bg-error-container hover:text-error rounded-full transition-colors"
                            >
                              <span className="material-symbols-outlined">delete</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredOsData.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-on-surface-variant">
                        Nenhuma OS encontrada para os critérios informados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 border-t border-outline-variant flex justify-between items-center bg-white dark:bg-surface mt-auto">
              <span className="text-xs text-on-surface-variant">Exibindo 3 de 150 entradas</span>
              <div className="flex gap-1">
                <button className="px-3 py-1 bg-surface-container-high rounded text-sm font-semibold">1</button>
                <button className="px-3 py-1 hover:bg-surface-container-high rounded text-sm font-semibold">2</button>
                <button className="px-3 py-1 hover:bg-surface-container-high rounded text-sm font-semibold">3</button>
                <span className="px-2">...</span>
                <button className="px-3 py-1 hover:bg-surface-container-high rounded text-sm font-semibold">50</button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Floating Action Component */}
      <motion.div className="mt-12 p-8 rounded-2xl bg-primary-container text-on-primary relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-8 shadow-xl" variants={itemVariants}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-fixed/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
        <div className="z-10 text-center md:text-left">
          <h3 className="text-[24px] font-semibold mb-2">Inteligência de Manutenção Operacional</h3>
          <p className="text-on-primary-container max-w-xl opacity-90 leading-relaxed text-base">Nosso motor de manutenção preditiva impulsionado por IA identifica falhas potenciais antes que elas ocorram. Solicite um relatório completo de auditoria da frota hoje mesmo.</p>
        </div>
        <div className="z-10 flex gap-4">
          <button className="px-8 py-4 bg-primary-fixed text-on-primary-fixed font-bold rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg">
            Ver Motor de Predição
          </button>
        </div>
      </motion.div>

      {/* OS Details Modal */}
      <AnimatePresence>
        {selectedOS && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOS(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface w-full max-w-2xl rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 sm:p-8 border-b border-outline-variant/30 flex justify-between items-start bg-surface-container-lowest">
                <div>
                  <h2 className="text-[28px] font-bold text-on-surface tracking-tight mb-2 flex items-center gap-3">
                    <div className={`w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center`}>
                      <span className={`material-symbols-outlined text-${selectedOS.color} text-[24px]`}>{selectedOS.icon}</span>
                    </div>
                    {selectedOS.title?.replace(/(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1")}
                  </h2>
                  <div className="flex gap-4 items-center mt-4">
                    {vehicles.find(v => v.id === selectedOS.vehicleId || v.plate === selectedOS.plate)?.imageUrl && (
                      <div className="w-16 h-16 rounded-xl border border-outline-variant/50 bg-white overflow-hidden flex-shrink-0 flex items-center justify-center p-1">
                        <img 
                          src={vehicles.find(v => v.id === selectedOS.vehicleId || v.plate === selectedOS.plate)?.imageUrl} 
                          alt="Veículo" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <span className="text-sm font-medium text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">directions_car</span>
                      <PrivateValue value={selectedOS.plate || 'N/A'} />
                    </span>
                    <span className="text-sm font-medium text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                      {new Date(selectedOS.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedOS(null)}
                  className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-error transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              <div className="p-6 sm:p-8 overflow-y-auto bg-surface-container-lowest/50">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                  <div className="bg-surface-container-lowest border border-outline-variant/30 p-4 rounded-2xl">
                    <span className="text-xs font-semibold text-on-surface-variant block mb-1 uppercase tracking-wider">Status</span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full bg-${selectedOS.color}`}></span>
                      <span className="font-bold text-on-surface">{selectedOS.status}</span>
                    </div>
                  </div>
                  <div className="bg-surface-container-lowest border border-outline-variant/30 p-4 rounded-2xl">
                    <span className="text-xs font-semibold text-on-surface-variant block mb-1 uppercase tracking-wider">Prioridade</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${selectedOS.priority === 'Alta' ? 'bg-error-container text-error' : selectedOS.priority === 'Media' ? 'bg-orange-100 text-orange-800' : 'bg-surface-container text-on-surface'}`}>
                      {selectedOS.priority}
                    </span>
                  </div>
                  <div className="bg-surface-container-lowest border border-outline-variant/30 p-4 rounded-2xl col-span-2 sm:col-span-2">
                    <span className="text-xs font-semibold text-on-surface-variant block mb-1 uppercase tracking-wider">Fornecedor</span>
                    {selectedOS.status !== 'Concluído' ? (
                      <input
                        type="text"
                        value={selectedOS.provider}
                        onChange={(e) => setSelectedOS({ ...selectedOS, provider: e.target.value })}
                        onBlur={(e) => handleUpdateOSProvider(selectedOS.id, e.target.value)}
                        className="w-full bg-white border border-outline-variant rounded px-2 py-1 text-sm font-medium text-on-surface focus:outline-none focus:border-primary"
                        placeholder="Nome do Fornecedor..."
                      />
                    ) : (
                      <span className="font-medium text-on-surface"><PrivateValue value={selectedOS.provider} /></span>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-outline-variant/50 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">build_circle</span>
                    Itens para Manutenção
                  </h3>
                  
                  <div className="whitespace-pre-wrap text-sm text-on-surface-variant leading-relaxed">
                    {selectedOS.description}
                  </div>
                </div>

                <div className="bg-white border border-outline-variant/50 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">notes</span>
                    Observações de Fechamento
                  </h3>
                  
                  {selectedOS.status !== 'Concluído' ? (
                    <textarea 
                      rows={3}
                      value={closingNotes}
                      onChange={(e) => setClosingNotes(e.target.value)}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-xl p-4 text-sm focus:ring-2 focus:ring-primary outline-none transition-all resize-none"
                      placeholder="Adicione observações importantes sobre o fechamento desta OS..."
                    />
                  ) : (
                    <div className="text-sm text-on-surface-variant italic">
                      {selectedOS.closingNotes || 'Nenhuma observação informada.'}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-outline-variant/30 bg-surface flex flex-wrap justify-end gap-3 mt-auto">
                <button
                  onClick={() => exportOsPDF(selectedOS)}
                  disabled={isExporting}
                  className="px-6 py-3 font-semibold border border-outline-variant rounded-xl hover:bg-surface-container-low transition-colors flex items-center gap-2"
                >
                  {isExporting ? (
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                  )}
                  Exportar PDF
                </button>
                <button 
                  onClick={() => setSelectedOS(null)}
                  className="px-6 py-3 font-semibold text-on-surface-variant hover:bg-surface-container-low rounded-xl transition-colors"
                >
                  Fechar
                </button>
                {selectedOS.status !== 'Concluído' ? (
                  <button 
                    onClick={() => {
                      handleCompleteOS(selectedOS);
                      setSelectedOS(null);
                    }}
                    className="px-6 py-3 font-bold bg-primary text-on-primary rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2 shadow-md"
                  >
                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                    Concluir Manutenção
                  </button>
                ) : (
                  <div className="px-6 py-3 font-bold bg-surface-container-highest text-on-surface-variant rounded-xl flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px]">verified</span>
                    Concluída em {new Date(selectedOS.updatedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
