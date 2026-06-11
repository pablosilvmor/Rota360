import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, where, writeBatch, doc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { PrivateValue } from '../contexts/PrivacyContext';
import { useAuth } from '../contexts/AuthContext';
import * as xlsx from 'xlsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createSignature } from '../utils/pdfSignature';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
};

export function Fuel() {
  const [works, setWorks] = useState<any[]>([]);
  const [fuelRecords, setFuelRecords] = useState<any[]>([]);
  const [importLogs, setImportLogs] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [filterWork, setFilterWork] = useLocalStorageState('fuel_filterWork', 'Todas as Obras');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useLocalStorageState('fuel_filterMonth', 'Todos');
  const [filterYear, setFilterYear] = useLocalStorageState('fuel_filterYear', 'Todos');
  
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  const ColumnFilter = ({ columnId, label }: { columnId: string, label: string }) => {
    const uniqueValues = React.useMemo(() => {
      const vals = new Set<string>();
      fuelRecords.forEach(r => {
        let v = '';
        if (columnId === 'date') v = r.date?.toDate ? r.date.toDate().toLocaleDateString('pt-BR') : '';
        else if (columnId === 'liters') v = r.liters ? `${r.liters.toLocaleString('pt-BR')}L` : '0L';
        else if (columnId === 'workName') {
            const veh = vehicles.find(v => v.plate === r.vehiclePlate);
            const cc = (Array.isArray(veh?.costCenter) ? veh.costCenter.join(', ') : veh?.costCenter) || veh?.workName || r.workName || 'Não informada';
            v = String(cc).replace(/logística\s*-\s*região\s*sul/gi, "").replace(/,\s*,/g, ",").replace(/^[\s,]+|[\s,]+$/g, "").trim() || 'Não informada';
        }
        else if (columnId === 'station') {
          if (r.rawData) {
            const keys = Object.keys(r.rawData);
            // Prioritize finding a key that isn't just a code if multiple established keys exist
            const stationKey = keys.find(k => k.toUpperCase().includes('NOME ESTABELECIMENTO')) || 
                               keys.find(k => k.toUpperCase().includes('POSTO') || k.toUpperCase().includes('ESTABELECIMENTO'));
            
            const rawVal = stationKey ? String(r.rawData[stationKey] || '') : '';
            // If the rawVal looks like just an ID code (all numbers and > 5 chars), fallback to r.station
            if (rawVal && /^\d+$/.test(rawVal) && rawVal.length > 5) {
                v = String(r.station || 'Não informado');
            } else {
                v = rawVal || String(r.station || 'Não informado');
            }
          } else {
            v = String(r.station || 'Não informado');
          }
        }
        else if (columnId === 'transactionCode') {
          v = String(r.transactionId || (r.rawData ? r.rawData['CODIGO TRANSACAO'] || r.rawData['CÓDIGO TRANSAÇÃO'] : '') || 'Não informado');
        }
        else if (columnId === 'vehiclePlate') {
          const veh = vehicles.find(v => v.plate === r.vehiclePlate);
          const model = r.vehicleModel || veh?.name || '';
          v = model ? `${model} - ${r.vehiclePlate}` : String(r.vehiclePlate || 'N/A');
        }
        else v = String(r[columnId] || 'Não informado');
        if (v) vals.add(v);
      });
      return Array.from(vals).sort();
    }, [columnId, fuelRecords, vehicles]);

    const filteredValues = filterSearch 
      ? uniqueValues.filter(v => v.toLowerCase().includes(filterSearch.toLowerCase()))
      : uniqueValues;

    if (openFilter !== columnId) return (
      <button onClick={(e) => { e.stopPropagation(); setOpenFilter(columnId); setFilterSearch(''); }} className="ml-1 p-1 hover:bg-black/5 rounded-full transition-colors leading-none">
        <span className={`material-symbols-outlined text-[16px] ${columnFilters[columnId]?.length ? 'text-primary fill-1' : 'text-on-surface-variant/30'}`}>filter_alt</span>
      </button>
    );

    return (
      <div className="absolute top-full left-0 mt-2 z-50 w-64 bg-white rounded-2xl shadow-2xl border border-outline-variant p-4 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
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
            className="w-full bg-surface-container border border-outline-variant rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
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
                  setColumnFilters({ ...columnFilters, [columnId]: next });
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
  const [isDragging, setIsDragging] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [customAlert, setCustomAlert] = useState<{ message: string; title?: string; type?: 'error' | 'success' | 'info'; onConfirm?: () => void; onCancel?: () => void; isConfirm?: boolean } | null>(null);
  
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [fuelTypeMenu, setFuelTypeMenu] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useLocalStorageState('fuel_columnFilters', {} as Record<string, string[]>);
  const [filterSearch, setFilterSearch] = useState('');
  
  const { userData } = useAuth();
  const [selectedColumns, setSelectedColumns] = useLocalStorageState('fuel_selectedColumns', [
    'date', 'vehiclePlate', 'workName', 'station', 'transactionCode', 'liters', 'totalValue'
  ]);
  
  const [reportMonth, setReportMonth] = useLocalStorageState('fuel_reportMonth', 'Todos');
  const [reportYear, setReportYear] = useLocalStorageState('fuel_reportYear', 'Todos');
  const [reportStartDate, setReportStartDate] = useLocalStorageState('fuel_reportStartDate', '');
  const [reportEndDate, setReportEndDate] = useLocalStorageState('fuel_reportEndDate', '');

  type ReportProfile = {
    id: string;
    name: string;
    columns: string[];
    filters: {
      work: string;
      month: string;
      year: string;
      startDate: string;
      endDate: string;
    };
  };
  const [reportProfiles, setReportProfiles] = useLocalStorageState<ReportProfile[]>('fuel_reportProfiles', []);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState('');

  const handleSaveProfile = () => {
    if (!editingProfileName.trim()) return;
    
    if (editingProfileId) {
      setReportProfiles(prev => prev.map(p => 
        p.id === editingProfileId 
          ? { ...p, name: editingProfileName, columns: selectedColumns, filters: { work: filterWork, month: reportMonth, year: reportYear, startDate: reportStartDate, endDate: reportEndDate } }
          : p
      ));
    } else {
      const newProfile: ReportProfile = {
        id: Date.now().toString(),
        name: editingProfileName,
        columns: selectedColumns,
        filters: { work: filterWork, month: reportMonth, year: reportYear, startDate: reportStartDate, endDate: reportEndDate }
      };
      setReportProfiles(prev => [...prev, newProfile]);
    }
    setEditingProfileId(null);
    setEditingProfileName('');
  };

  const handleApplyProfile = (profile: ReportProfile) => {
    setSelectedColumns(profile.columns);
    setFilterWork(profile.filters.work);
    setReportMonth(profile.filters.month);
    setReportYear(profile.filters.year);
    setReportStartDate(profile.filters.startDate);
    setReportEndDate(profile.filters.endDate);
  };

  const [profile, setProfile] = useState<any>(null);

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

  useEffect(() => {
    const q = query(collection(db, 'profiles'), where('userId', '==', auth.currentUser?.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) setProfile(snapshot.docs[0].data());
    });
    return () => unsubscribe();
  }, []);

  const columnOptions = [
    { id: 'date', label: 'Data', width: 'auto' },
    { id: 'vehiclePlate', label: 'Placa', width: 'auto' },
    { id: 'vehicleModel', label: 'Veículo', width: 'auto' },
    { id: 'workName', label: 'Obra', width: 'auto' },
    { id: 'station', label: 'Posto', width: 'auto' },
    { id: 'fuelType', label: 'Tipo Combustível', width: 'auto' },
    { id: 'liters', label: 'Litros', width: 'auto' },
    { id: 'unitPrice', label: 'V. Unitário', width: 'auto' },
    { id: 'totalValue', label: 'Total', width: 'auto' },
    { id: 'transactionCode', label: 'CODIGO', width: 'auto' },
    { id: 'odometer', label: 'Odômetro', width: 'auto' },
    { id: 'fuelType', label: 'Combustível', width: 'auto' },
    { id: 'driverRegistration', label: 'Matrícula', width: 'auto' },
    { id: 'driverName', label: 'Nome Motorista', width: 'auto' },
    { id: 'cityState', label: 'Cidade/Estado', width: 'auto' },
  ];

  const handleToggleColumn = (id: string) => {
    if (selectedColumns.includes(id)) {
      if (selectedColumns.length > 1) {
        setSelectedColumns(selectedColumns.filter((c: string) => c !== id));
      }
    } else {
      setSelectedColumns([...selectedColumns, id]);
    }
  };

  const exportPDF = async () => {
    try {
      const orientation = selectedColumns.length > 6 ? 'landscape' : 'portrait';
      const doc = new jsPDF(orientation);
      const title = `Relatório de Combustível - Exportação`;
      const companyName = userData?.signatureInfo?.company || 'Rota 360';
      const userName = userData?.signatureInfo?.fullName || 'Administrador';
      
      // Logo e Nome da Empresa
      try {
        const logoUrl = 'https://i.imgur.com/9iZCsf6.png';
        doc.addImage(logoUrl, 'PNG', 14, 10, 40, 15);
        doc.setFontSize(8);
        doc.setTextColor(15, 140, 220); // #0f8cdc
        doc.setFont('helvetica', 'bold');
        doc.text(companyName, 14, 28);
      } catch (e) {
        doc.setFontSize(22);
        doc.setTextColor(15, 140, 220);
        doc.text('ROTA 360', 14, 20);
      }
      
      doc.setFontSize(14);
      doc.setTextColor(50, 50, 50);
      doc.text(title, 70, 20);
      
      doc.setFontSize(10);
      const filterText = (reportStartDate || reportEndDate) 
        ? `${reportStartDate ? new Date(reportStartDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Início'} até ${reportEndDate ? new Date(reportEndDate + 'T23:59:59').toLocaleDateString('pt-BR') : 'Hoje'}`
        : `${reportMonth === 'Todos' ? 'Todo o período' : monthsNominal.find(m => m.value === reportMonth)?.label}/${reportYear === 'Todos' ? 'Todo o período' : reportYear}`;
      
      doc.text(`Filtros: Obra: ${filterWork} | Período: ${filterText}`, 14, 35);
      doc.text(`Total Gasto: R$ ${reportTotalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Total Litros: ${reportTotalLiters.toLocaleString('pt-BR')} L`, 14, 42);

      // Pre-load vehicle images for the PDF
      const vehicleImages: Record<string, string> = {};
      const uniquePlates = [...new Set(reportRecords.map(r => r.vehiclePlate))];
      await Promise.all(uniquePlates.map(async (plate) => {
          const v = vehicles.find(veh => veh.plate === plate);
          const imgUrl = v?.imageUrl || v?.photoUrl;
          if (imgUrl) {
              try {
                  const img = new Image();
                  img.crossOrigin = 'Anonymous';
                  img.src = imgUrl;
                  await new Promise((resolve, reject) => {
                      img.onload = resolve;
                      img.onerror = reject;
                  });
                  const canvas = document.createElement('canvas');
                  canvas.width = img.width;
                  canvas.height = img.height;
                  const ctx = canvas.getContext('2d');
                  ctx?.drawImage(img, 0, 0);
                  vehicleImages[plate] = canvas.toDataURL('image/jpeg', 0.7);
              } catch (e) {
                  console.warn(`Failed to load image for vehicle ${plate}`, e);
              }
          }
      }));

      const columnsToExport = columnOptions.filter(opt => selectedColumns.includes(opt.id));
      const tableHeaders = columnsToExport.map(opt => opt.label.toUpperCase());

      const tableData = reportRecords.map(r => {
        return columnsToExport.map((opt) => {
          const colId = opt.id;
          if (colId === 'vehiclePlate') return '';
          if (colId === 'date') return r.date?.toDate ? r.date.toDate().toLocaleDateString('pt-BR') : '-';
          if (colId === 'liters') return r.liters ? `${r.liters.toLocaleString('pt-BR')}L` : '0L';
          if (colId === 'transactionCode') return r.transactionId || (r.rawData ? r.rawData['CODIGO TRANSACAO'] || r.rawData['CÓDIGO TRANSAÇÃO'] || '-' : '-');
          if (colId === 'totalValue') return `R$ ${Number(r.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          if (colId === 'unitPrice') {
            const val = Number(r.totalValue || 0);
            const lit = Number(r.liters || 1);
            return `R$ ${(val / lit).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          }
          if (colId === 'odometer') return r.odometer?.toLocaleString('pt-BR') || '-';
          if (colId === 'workName') {
            const v = vehicles.find(veh => veh.plate === r.vehiclePlate);
            const cc = (Array.isArray(v?.costCenter) ? v.costCenter.join(', ') : v?.costCenter) || v?.workName || r.workName || 'Não informada';
            // Remove specific forbidden text and clean up commas/whitespace completely
            return String(cc)
              .replace(/logística\s*-\s*região\s*sul/gi, "") // Remove bad text
              .replace(/,\s*,/g, ",") // Fix double commas
              .replace(/^[\s,]+|[\s,]+$/g, "") // Clean edges
              .trim() || 'Não informada';
          }
          
          if (colId === 'station') {
            if (r.rawData) {
                const keys = Object.keys(r.rawData);
                const stationKey = keys.find(k => k.toUpperCase().includes('NOME ESTABELECIMENTO'));
                if (stationKey && r.rawData[stationKey]) return r.rawData[stationKey];
            }
            return r.station || '-';
          }
          
          if (colId === 'driverRegistration') return r.driverRegistration || (r.rawData ? Object.entries(r.rawData).find(([k]) => String(k).toUpperCase().includes('MATRICULA'))?.[1] || '-' : '-');
          if (colId === 'driverName') return r.driverName || (r.rawData ? Object.entries(r.rawData).find(([k, v]) => String(k).toUpperCase().includes('MOTORISTA') && typeof v === 'string' && v.length > 3)?.[1] || '-' : '-');
          if (colId === 'cityState') {
              if (!r.rawData) return '-';
              const cid = Object.entries(r.rawData).find(([k]) => String(k).toUpperCase() === 'CIDADE' || String(k).toUpperCase().includes('MUNICÍPIO'))?.[1];
              const est = Object.entries(r.rawData).find(([k]) => String(k).toUpperCase() === 'ESTADO' || String(k).toUpperCase() === 'UF')?.[1];
              const cidEst = Object.entries(r.rawData).find(([k]) => String(k).toUpperCase().includes('CIDADE') && String(k).toUpperCase().includes('ESTADO'))?.[1];
              if (cid && est) return `${cid}/${est}`;
              if (cid) return String(cid);
              if (cidEst) return String(cidEst);
              return '-';
          }
          
          return r[colId] || '-';
        });
      });

      autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: 50,
        theme: 'striped',
        headStyles: { fillColor: [15, 140, 220], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 250] },
        styles: { fontSize: 7, cellPadding: 2, valign: 'middle' },
        columnStyles: {
            vehiclePlate: { cellWidth: 55 }
        },
        margin: { top: 50, bottom: 40 },
        didDrawCell: (data) => {
          if (data && data.section === 'body' && columnsToExport[data.column.index].id === 'vehiclePlate') {
            const rowIndex = data.row.index;
            const record = reportRecords[rowIndex];
            if (!record) return;

            const { x, y, width, height } = data.cell;
            
            // 1. Draw Image Box
            const imgBoxSize = 10;
            const imgBoxX = x + 2;
            const imgBoxY = y + (height - 8) / 2;
            
            doc.setDrawColor(0, 0, 0, 0); // Fully transparent border
            doc.setLineWidth(0);
            doc.setFillColor(255, 255, 255);
            doc.rect(imgBoxX, imgBoxY, 12, 8, 'F'); // Fill only

            const imgData = vehicleImages[record.vehiclePlate];
            if (imgData) {
                try {
                    doc.addImage(imgData, 'JPEG', imgBoxX + 1, imgBoxY + 1, 10, 6);
                } catch (err) {
                    console.warn('Error drawing cell image', err);
                }
            }

            // 2. Draw Plate Text Box
            const plateBoxX = imgBoxX + 14;
            const plateBoxY = imgBoxY + 1;
            const plateBoxW = 16;
            const plateBoxH = 6;

            doc.setFillColor(240, 244, 248);
            doc.setDrawColor(220, 225, 235);
            // roundedRect(x, y, w, h, rx, ry, style)
            (doc as any).roundedRect(plateBoxX, plateBoxY, plateBoxW, plateBoxH, 1, 1, 'FD');

            // 3. Draw Plate Text
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(50, 60, 80);
            const plateText = record.vehiclePlate || '-';
            const textWidth = doc.getTextWidth(plateText);
            doc.text(plateText, plateBoxX + (plateBoxW - textWidth) / 2, plateBoxY + 4.2);
            
            // Reset for other cells
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
          }
        },
        didDrawPage: (data) => {
          const pageSize = doc.internal.pageSize;
          const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();
          const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
          
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text('By Pablo Moreira', 14, pageHeight - 10);
        }
      });

      const totalPagesOverall = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPagesOverall; i++) {
        doc.setPage(i);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Pág. ${i}/${totalPagesOverall}`, pageWidth - 25, pageHeight - 10);
      }

      // Assinatura Eletrônica Avançada
      let sigId = '';
      try {
        sigId = await createSignature({
          documentType: 'FUEL_REPORT',
          documentTitle: title
        });
      } catch (e) {
        console.warn('Signature service unavailable', e);
      }
      
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          if (i === pageCount && sigId) {
              const tableInfo = (doc as any).lastAutoTable;
              let finalY = tableInfo ? tableInfo.finalY + 15 : 70;
              const pageWidth = doc.internal.pageSize.getWidth();
              const pageHeight = doc.internal.pageSize.getHeight();
              
              const boxHeight = 45;
              
              // Ajuste automático inteligente: se ultrapassar página ou estiver muito próximo ao fim (20mm de margem)
              if (finalY + boxHeight > pageHeight - 20) {
                  doc.addPage();
                  finalY = 20;
              }

              // Caixa de assinatura estilo Rota 360
              doc.setDrawColor(230, 230, 230);
              doc.setFillColor(248, 250, 252);
              doc.roundedRect(14, finalY, pageWidth - 28, boxHeight, 3, 3, 'FD');
              
              try {
                // Logo secundário na assinatura
                doc.addImage('https://i.imgur.com/9iZCsf6.png', 'PNG', pageWidth - 45, finalY + 5, 25, 10);
                
                // QR Code Real (usando API pública para garantir fidelidade ao pedido)
                const verifyUrl = `${window.location.origin}/verify/${sigId}`;
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(verifyUrl)}`;
                doc.addImage(qrUrl, 'PNG', 20, finalY + 7, 25, 25);
              } catch(e) {}

              doc.setFontSize(10);
              doc.setTextColor(50, 50, 50);
              doc.setFont('helvetica', 'bold');
              doc.text('DOCUMENTO ASSINADO DIGITALMENTE', 50, finalY + 12);
              doc.text(`por ${userName.toUpperCase()}`, 50, finalY + 19);
              
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7);
              doc.setTextColor(120, 120, 120);
              doc.text('Para verificar a autenticidade deste documento, aponte a câmera para o QR Code', 50, finalY + 28);
              doc.text('ou acesse a URL abaixo:', 50, finalY + 32);
              
              doc.setTextColor(37, 99, 235);
              doc.setFontSize(8);
              const verifyUrl = `${window.location.origin}/verify/${sigId}`;
              doc.text(verifyUrl, 50, finalY + 38);
              
              doc.setTextColor(150, 150, 150);
              doc.setFontSize(7);
              doc.text(`Código de Validação: ${sigId}`, 50, finalY + 42);
          }
      }

      doc.save(`Relatorio_Combustivel_Export.pdf`);
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      setCustomAlert({
        title: 'Erro',
        message: 'Erro ao gerar PDF.',
        type: 'error'
      });
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    setCustomAlert({
      isConfirm: true,
      title: 'Atenção',
      message: 'Tem certeza que deseja excluir este registro de abastecimento?',
      type: 'info',
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'fuel_records', recordId));
          await batch.commit();
        } catch (err) {
          console.error('Erro ao excluir registro:', err);
          setCustomAlert({
            title: 'Erro',
            message: 'Erro ao excluir registro do sistema.',
            type: 'error'
          });
        }
      }
    });
  };

  const clearFilters = () => {
    setFilterWork('Todas as Obras');
    setSearchTerm('');
    setReportMonth('Todos');
    setReportYear('Todos');
    setReportStartDate('');
    setReportEndDate('');
    setColumnFilters({});
  }

  const [dialog, setDialog] = useState<{message: string, onConfirm?: () => void} | null>(null);

  const MessageDialog = () => !dialog ? null : (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <h4 className="text-lg font-bold text-on-surface mb-2">Rota 360 diz:</h4>
        <p className="text-on-surface-variant mb-6">{dialog.message}</p>
        <div className="flex justify-end gap-2">
            <button onClick={() => setDialog(null)} className="px-4 py-2 rounded-lg text-on-surface">OK</button>
            {dialog.onConfirm && (
                <button onClick={() => { dialog.onConfirm!(); setDialog(null); }} className="px-4 py-2 rounded-lg bg-error text-white font-semibold flex items-center gap-2">
                    Confirmar
                </button>
            )}
        </div>
      </div>
    </div>
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const qWorks = query(collection(db, 'works'), orderBy('name', 'asc'));
    const unsubscribeWorks = onSnapshot(qWorks, (snapshot) => {
      setWorks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'works');
    });

    const qVehicles = query(collection(db, 'vehicles'));
    const unsubscribeVehicles = onSnapshot(qVehicles, (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qDrivers = query(collection(db, 'drivers'));
    const unsubscribeDrivers = onSnapshot(qDrivers, (snapshot) => {
      setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qFuel = query(collection(db, 'fuel_records'), orderBy('date', 'desc'));
    const unsubscribeFuel = onSnapshot(qFuel, (snapshot) => {
      setFuelRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'fuel_records');
    });

    const qLogs = query(collection(db, 'fuel_imports'), orderBy('createdAt', 'desc'));
    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      setImportLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'fuel_imports');
    });

    return () => {
      unsubscribeWorks();
      unsubscribeVehicles();
      unsubscribeDrivers();
      unsubscribeFuel();
      unsubscribeLogs();
    };
  }, []);



  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = xlsx.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { raw: false, header: 1 }) as string[][];
      if (rows.length < 2) return;

      const headers = rows[0].map((h: any) => String(h).trim().toUpperCase());
      
      const idxCodTransacao = headers.findIndex(h => h.includes('CODIGO TRANSACAO') || h.includes('CÓDIGO TRANSAÇÃO'));
      const idxDataTransacao = headers.findIndex(h => h.includes('DATA TRANSACAO') || h.includes('DATA TRANSAÇÃO'));
      const idxPlaca = headers.findIndex(h => h.includes('PLACA'));
      const idxModelo = headers.findIndex(h => h.includes('MODELO VEICULO') || h.includes('MODELO VEÍCULO'));
      const idxCombustivel = headers.findIndex(h => h.includes('TIPO COMBUSTIVEL') || h.includes('TIPO COMBUSTÍVEL'));
      const idxLitros = headers.findIndex(h => h === 'LITROS');
      const idxValor = headers.findIndex(h => h.includes('VALOR EMISSAO') || h.includes('VALOR EMISSÃO') || h.includes('VALOR TOTAL'));
      const idxOdometro = headers.findIndex(h => h.includes('ODOMETRO') || h.includes('ODÔMETRO'));
      const idxPosto = headers.findIndex(h => h.includes('NOME ESTABELECIMENT') || h.includes('ESTABELECIMENTO'));
      
      let existingTransIds = new Set(fuelRecords.map(r => String(r.transactionId)));
      const batchList = [];
      let imported = 0;
      let duplicates = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        const codTransacao = idxCodTransacao >= 0 ? row[idxCodTransacao] : row[0];
        if (!codTransacao) continue;
        const transactionId = String(codTransacao).trim();
        
        if (existingTransIds.has(transactionId)) {
          duplicates++;
          continue;
        }
        
        const dataTransStr = idxDataTransacao >= 0 ? row[idxDataTransacao] : row[4];
        const placa = idxPlaca >= 0 ? row[idxPlaca] : row[5];
        const modelo = idxModelo >= 0 ? row[idxModelo] : row[7];
        const combustivel = idxCombustivel >= 0 ? row[idxCombustivel] : row[13];
        const litrosStr = idxLitros >= 0 ? row[idxLitros] : row[14];
        const valorStr = idxValor >= 0 ? row[idxValor] : row[18];
        const odometroStr = idxOdometro >= 0 ? row[idxOdometro] : row[16];
        const posto = idxPosto >= 0 ? row[idxPosto] : row[20];
        
        const litros = parseFloat(String(litrosStr).replace(',', '.'));
        const valor = parseFloat(String(valorStr).replace(/[^\d.,-]/g, '').replace(',', '.'));
        const odometro = parseFloat(String(odometroStr).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        
        let dateValue = new Date();
        if (dataTransStr) {
          const dateStr = String(dataTransStr).trim();
          if (dateStr.includes('/')) {
              const [datePart, timePart] = dateStr.split(' ');
              const [d, m, y] = datePart.split('/');
              if (timePart) {
                  const [h, min, s] = timePart.split(':');
                  dateValue = new Date(Number(y), Number(m)-1, Number(d), Number(h), Number(min), Number(s || 0));
              } else {
                  dateValue = new Date(Number(y), Number(m)-1, Number(d));
              }
          }
        }
        
        const rawData: Record<string, any> = {};
        headers.forEach((header, index) => {
          if (header) {
            rawData[header] = row[index] === undefined ? null : row[index];
          }
        });

        batchList.push({
          transactionId,
          date: dateValue,
          vehiclePlate: String(placa || '').trim(),
          vehicleModel: String(modelo || '').trim(),
          fuelType: String(combustivel || '').trim(),
          liters: isNaN(litros) ? 0 : litros,
          totalValue: isNaN(valor) ? 0 : valor,
          odometer: isNaN(odometro) ? 0 : odometro,
          station: String(posto || '').trim(),
          workName: 'Não informada',
          card: '', 
          createdAt: new Date(),
          importMode: 'excel',
          rawData
        });
        existingTransIds.add(transactionId);
      }
      
      const totalToImport = batchList.length;
      setImportProgress({ current: 0, total: totalToImport });

      const importLog = await addDoc(collection(db, 'fuel_imports'), {
        fileName: file.name,
        user: auth.currentUser?.email || 'Desconhecido',
        createdAt: serverTimestamp(),
        total: totalToImport
      });

      const chunkSize = 400;
      for (let i = 0; i < batchList.length; i += chunkSize) {
        const chunk = batchList.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const item of chunk) {
          batch.set(doc(collection(db, 'fuel_records')), { ...item, importId: importLog.id });
        }
        await batch.commit();
        imported += chunk.length;
        setImportProgress({ current: imported, total: totalToImport });
      }
      
      setImportProgress({ current: totalToImport, total: totalToImport });
      setDialog({ message: `Importação concluída: ${imported} registros novos.\n(Ignorados: ${duplicates} duplicados)` });
      
    } catch (err: any) {
      console.error(err);
      setDialog({ message: `Erro ao importar arquivo Excel: ${err?.message || err}` });
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
    if (e.target) {
       e.target.value = '';
    }
  };

  const handleClearData = async () => {
    setClearing(true);
    try {
      const q = query(collection(db, 'fuel_records'), where('importMode', '==', 'excel'));
      const snapshot = await getDocs(q);
      const batchList: any[] = [];
      snapshot.forEach(doc => batchList.push(doc.ref));
      
      const chunkSize = 400;
      for (let i = 0; i < batchList.length; i += chunkSize) {
        const chunk = batchList.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const ref of chunk) {
          batch.delete(ref);
        }
        await batch.commit();
      }
      setShowClearConfirm(false);
    } catch (err) {
      console.error(err);
      setCustomAlert({ title: 'Erro', message: 'Erro ao apagar dados importados.', type: 'error' });
    } finally {
      setClearing(false);
    }
  };

  const filteredRecords = fuelRecords.filter(r => {
    // Check column filters
    for (const [colId, values] of Object.entries(columnFilters)) {
      if (values.length === 0) continue;
      
      let cellValue = '';
      if (colId === 'date') cellValue = r.date?.toDate ? r.date.toDate().toLocaleDateString('pt-BR') : '';
      else if (colId === 'liters') cellValue = r.liters ? `${r.liters.toLocaleString('pt-BR')}L` : '0L';
      else if (colId === 'station') {
        if (r.rawData) {
          const keys = Object.keys(r.rawData);
          const stationKey = keys.find(k => k.toUpperCase().includes('NOME ESTABELECIMENTO')) || 
                             keys.find(k => k.toUpperCase().includes('POSTO') || k.toUpperCase().includes('ESTABELECIMENTO'));
          
          const rawVal = stationKey ? String(r.rawData[stationKey] || '') : '';
          if (rawVal && /^\d+$/.test(rawVal) && rawVal.length > 5) {
              cellValue = String(r.station || '');
          } else {
              cellValue = rawVal || String(r.station || '');
          }
        } else {
          cellValue = String(r.station || '');
        }
      }
      else if (colId === 'transactionCode') {
        cellValue = String(r.transactionId || (r.rawData ? r.rawData['CODIGO TRANSACAO'] || r.rawData['CÓDIGO TRANSAÇÃO'] : '') || '');
      }
      else if (colId === 'vehiclePlate') {
        const veh = vehicles.find(v => v.plate === r.vehiclePlate);
        const model = r.vehicleModel || veh?.name || '';
        cellValue = model ? `${model} - ${r.vehiclePlate}` : String(r.vehiclePlate || '');
      }
      else if (colId === 'workName') {
        const v = vehicles.find(veh => veh.plate === r.vehiclePlate);
        const cc = (Array.isArray(v?.costCenter) ? v.costCenter.join(', ') : v?.costCenter) || v?.workName || r.workName || 'Não informada';
        cellValue = String(cc).replace(/logística\s*-\s*região\s*sul/gi, "").replace(/,\s*,/g, ",").replace(/^[\s,]+|[\s,]+$/g, "").trim() || 'Não informada';
      }
      else cellValue = String(r[colId] || '');
      
      if (!values.includes(cellValue)) return false;
    }

    const matchesWork = filterWork === 'Todas as Obras' || r.workName === filterWork;
    const matchesSearch = searchTerm === '' || 
      String(r.vehiclePlate).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.vehicleModel).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.driverName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.station).toLowerCase().includes(searchTerm.toLowerCase()) ||
      Object.values(r.rawData || {}).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
    
    const recordDate = r.date?.toDate ? r.date.toDate() : new Date(0);
    
    const targetMonth = reportMonth;
    const targetYear = reportYear;
    
    const matchesMonth = targetMonth === 'Todos' || (recordDate.getMonth() + 1).toString() === targetMonth;
    const matchesYear = targetYear === 'Todos' || recordDate.getFullYear().toString() === targetYear;

    let inRange = true;
    if (reportStartDate) {
      if (recordDate < new Date(reportStartDate + 'T00:00:00')) inRange = false;
    }
    if (reportEndDate) {
      if (recordDate > new Date(reportEndDate + 'T23:59:59')) inRange = false;
    }
    
    if (reportStartDate || reportEndDate) return matchesWork && matchesSearch && inRange;
    return matchesWork && matchesSearch && matchesMonth && matchesYear;
  });

  let sortedRecords = [...filteredRecords];
  if (sortConfig !== null) {
    sortedRecords.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (sortConfig.key === 'date') {
         aVal = a.date?.toDate ? a.date.toDate() : new Date(0);
         bVal = b.date?.toDate ? b.date.toDate() : new Date(0);
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const reportRecords = React.useMemo(() => {
    let result = fuelRecords.filter(r => {
      // Check column filters
      for (const [colId, values] of Object.entries(columnFilters)) {
        if (values.length === 0) continue;
        
        let cellValue = '';
        if (colId === 'date') cellValue = r.date?.toDate ? r.date.toDate().toLocaleDateString('pt-BR') : '';
        else if (colId === 'liters') cellValue = r.liters ? `${r.liters.toLocaleString('pt-BR')}L` : '0L';
        else if (colId === 'station') {
          if (r.rawData) {
            const keys = Object.keys(r.rawData);
            const stationKey = keys.find(k => k.toUpperCase().includes('NOME ESTABELECIMENTO')) || 
                               keys.find(k => k.toUpperCase().includes('POSTO') || k.toUpperCase().includes('ESTABELECIMENTO'));
            
            const rawVal = stationKey ? String(r.rawData[stationKey] || '') : '';
            if (rawVal && /^\d+$/.test(rawVal) && rawVal.length > 5) {
                cellValue = String(r.station || '');
            } else {
                cellValue = rawVal || String(r.station || '');
            }
          } else {
            cellValue = String(r.station || '');
          }
        }
        else if (colId === 'transactionCode') {
          cellValue = String(r.transactionId || (r.rawData ? r.rawData['CODIGO TRANSACAO'] || r.rawData['CÓDIGO TRANSAÇÃO'] : '') || '');
        }
        else if (colId === 'vehiclePlate') {
          const veh = vehicles.find(v => v.plate === r.vehiclePlate);
          const model = r.vehicleModel || veh?.name || '';
          cellValue = model ? `${model} - ${r.vehiclePlate}` : String(r.vehiclePlate || '');
        }
        else if (colId === 'workName') {
            const v = vehicles.find(veh => veh.plate === r.vehiclePlate);
            const cc = (Array.isArray(v?.costCenter) ? v.costCenter.join(', ') : v?.costCenter) || v?.workName || r.workName || 'Não informada';
            cellValue = String(cc).replace(/logística\s*-\s*região\s*sul/gi, "").replace(/,\s*,/g, ",").replace(/^[\s,]+|[\s,]+$/g, "").trim() || 'Não informada';
        }
        else cellValue = String(r[colId] || '');
        
        if (!values.includes(cellValue)) return false;
      }

      const matchesWork = filterWork === 'Todas as Obras' || r.workName === filterWork;
      const matchesSearch = searchTerm === '' || 
        String(r.vehiclePlate).toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(r.vehicleModel).toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(r.driverName).toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(r.station).toLowerCase().includes(searchTerm.toLowerCase()) ||
        Object.values(r.rawData || {}).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesWork && matchesSearch;
    });

    result = result.filter(r => {
      const recordDate = r.date?.toDate ? r.date.toDate() : null;
      if (!recordDate) return true;

      const mMonth = reportMonth === 'Todos' || (recordDate.getMonth() + 1).toString() === reportMonth;
      const mYear = reportYear === 'Todos' || recordDate.getFullYear().toString() === reportYear;
      
      let inRange = true;
      if (reportStartDate) {
        if (recordDate < new Date(reportStartDate + 'T00:00:00')) inRange = false;
      }
      if (reportEndDate) {
        if (recordDate > new Date(reportEndDate + 'T23:59:59')) inRange = false;
      }
      
      // If Start or End date are specified, they override the month/year filter for more flexibility
      if (reportStartDate || reportEndDate) return inRange;
      return mMonth && mYear;
    });

    if (sortConfig !== null) {
      result.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (sortConfig.key === 'date') {
           aVal = a.date?.toDate ? a.date.toDate() : new Date(0);
           bVal = b.date?.toDate ? b.date.toDate() : new Date(0);
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [fuelRecords, filterWork, searchTerm, reportMonth, reportYear, reportStartDate, reportEndDate, sortConfig]);

  const reportTotalCost = reportRecords.reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
  const reportTotalLiters = reportRecords.reduce((acc, curr) => acc + (curr.liters || 0), 0);


  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return 'swap_vert';
    return sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
  };

  const totalCost = filteredRecords.reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
  const totalLiters = filteredRecords.reduce((acc, curr) => acc + (curr.liters || 0), 0);

  let firstDateStr = '-';
  let lastDateStr = '-';
  if (fuelRecords.length > 0) {
    const dates = fuelRecords.map(r => r.date?.toDate ? r.date.toDate().getTime() : 0).filter(t => t > 0);
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      firstDateStr = minDate.toLocaleDateString('pt-BR');
      lastDateStr = maxDate.toLocaleDateString('pt-BR');
    }
  }

  const chartData = React.useMemo(() => {
    const dataByDate: Record<string, { liters: number, totalValue: number }> = {};
    const reversed = [...reportRecords].reverse();
    reversed.forEach(r => {
      const d = r.date?.toDate ? r.date.toDate() : new Date(0);
      const k = reportMonth === 'Todos' && reportYear === 'Todos' && !reportStartDate ?
          `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}` :
          `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      
      if (!dataByDate[k]) {
        dataByDate[k] = { liters: 0, totalValue: 0 };
      }
      dataByDate[k].liters += parseFloat(r.liters) || 0;
      dataByDate[k].totalValue += parseFloat(r.totalValue) || 0;
    });
    return Object.keys(dataByDate).map(date => ({
       date,
       liters: Number(dataByDate[date].liters.toFixed(2)),
       totalValue: Number(dataByDate[date].totalValue.toFixed(2))
    }));
  }, [reportRecords, reportMonth, reportYear, reportStartDate]);

  const isAnyFilterActive = 
    filterWork !== 'Todas as Obras' || 
    searchTerm !== '' || 
    reportMonth !== 'Todos' || 
    reportYear !== 'Todos' || 
    reportStartDate !== '' || 
    reportEndDate !== '' || 
    Object.keys(columnFilters).length > 0;

  return (
    <motion.div 
      className="pb-12 relative"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {customAlert && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  customAlert.type === 'error' ? 'bg-error-container text-on-error-container' :
                  customAlert.type === 'success' ? 'bg-primary-container text-on-primary-container' :
                  'bg-surface-variant text-on-surface'
                }`}>
                  <span className="material-symbols-outlined text-[32px]">
                    {customAlert.type === 'error' ? 'warning' : customAlert.type === 'success' ? 'check_circle' : 'info'}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-on-surface mb-2">{customAlert.title || 'Atenção'}</h3>
                <p className="text-sm text-on-surface-variant">{customAlert.message}</p>
              </div>
              <div className="p-6 bg-surface-container-low border-t border-outline-variant flex gap-4">
                {customAlert.isConfirm && (
                  <button 
                    onClick={() => {
                      if (customAlert.onCancel) customAlert.onCancel();
                      setCustomAlert(null);
                    }}
                    className="flex-1 px-4 py-2 border border-outline-variant rounded-lg font-semibold hover:bg-surface-container transition-colors text-on-surface"
                  >
                    Cancelar
                  </button>
                )}
                <button 
                  onClick={() => {
                    const onConfirm = customAlert.onConfirm;
                    setCustomAlert(null);
                    if (onConfirm) onConfirm();
                  }}
                  className={`flex-1 px-4 py-2 font-bold rounded-lg shadow-sm transition-all focus:outline-none ${
                    customAlert.type === 'error' ? 'bg-error text-white hover:bg-error/90' :
                    customAlert.type === 'success' ? 'bg-primary text-on-primary hover:bg-primary/90' :
                    'bg-surface-container-highest text-on-surface hover:bg-surface-variant'
                  }`}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
      )}
      <MessageDialog />
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
                <h2 className="text-2xl font-bold text-on-surface mb-2">Solte sua planilha do Excel</h2>
                <p className="text-on-surface-variant font-medium">O arquivo (.xlsx) será processado automaticamente.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="mb-8" variants={itemVariants}>
        <h2 className="text-[32px] font-semibold text-primary leading-[1.3] tracking-[-0.01em]">Gestão de Combustível</h2>
        <p className="text-base text-on-surface-variant mt-2">Monitore os abastecimentos e custos importados da frota.</p>
        {fuelRecords.length > 0 && (
          <p className="text-xs text-on-surface-variant font-medium mt-1">
            Período dos dados: <strong className="text-primary">{firstDateStr}</strong> a <strong className="text-primary">{lastDateStr}</strong>
          </p>
        )}
      </motion.div>

      <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6" variants={containerVariants}>
        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-secondary-container text-on-secondary-container rounded-lg">
               <span className="material-symbols-outlined">payments</span>
            </div>
            <span className="bg-surface-container px-2 py-1 rounded text-xs font-bold text-on-surface-variant">Filtrado</span>
          </div>
          <p className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Custo Total</p>
          <h3 className="text-[36px] font-bold text-primary mt-1 leading-[1.2] tracking-[-0.02em]">R$ <PrivateValue value={totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} /></h3>
          <p className="text-xs text-on-surface-variant mt-2 font-semibold">Valor total gasto no período filtrado</p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-tertiary-container text-on-tertiary-container rounded-lg">
              <span className="material-symbols-outlined">local_gas_station</span>
            </div>
          </div>
          <p className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Volume Abastecido</p>
          <h3 className="text-[36px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">{totalLiters.toLocaleString('pt-BR')} L</h3>
          <p className="text-xs text-on-surface-variant mt-2 font-semibold">Volume acumulado conforme registros</p>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-primary-container text-on-primary-container rounded-lg">
              <span className="material-symbols-outlined">description</span>
            </div>
          </div>
          <p className="text-on-surface-variant text-sm font-semibold uppercase tracking-wider">Total de Registros</p>
          <h3 className="text-[36px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">{filteredRecords.length}</h3>
          <p className="text-xs text-on-surface-variant mt-2 font-semibold">Abastecimentos documentados</p>
        </motion.div>
      </motion.div>

      <motion.div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8" variants={itemVariants}>
          <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant h-[250px]">
              <h4 className="text-sm font-bold text-on-surface-variant mb-4 uppercase">Custo Diário (R$)</h4>
              <ResponsiveContainer width="100%" height="80%" minWidth={1} minHeight={1}>
                <AreaChart data={chartData}>
                  <XAxis dataKey="date" tick={{fontSize: 12}} stroke="#888" tickLine={false} axisLine={false} />
                  <YAxis tick={{fontSize: 12}} stroke="#888" tickLine={false} axisLine={false} />
                  <Tooltip 
                    formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Custo Total']}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  <Area type="monotone" dataKey="totalValue" stroke="#6750a4" fill="#6750a4" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
          </div>
          <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant h-[250px]">
              <h4 className="text-sm font-bold text-on-surface-variant mb-4 uppercase">Litros Diários (L)</h4>
              <ResponsiveContainer width="100%" height="80%" minWidth={1} minHeight={1}>
                <BarChart data={chartData}>
                  <XAxis dataKey="date" tick={{fontSize: 12}} stroke="#888" tickLine={false} axisLine={false} />
                  <YAxis tick={{fontSize: 12}} stroke="#888" tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    formatter={(value: any) => [`${Number(value).toLocaleString('pt-BR')} L`, 'Litros']}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  <Bar dataKey="liters" fill="#4f378b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
          </div>
      </motion.div>

      <motion.div className="flex flex-col gap-6 mb-8" variants={itemVariants}>
          <div className="sticky top-0 z-40 bg-surface-container-highest/95 backdrop-blur-md border border-outline-variant rounded-2xl p-4 flex items-center justify-between flex-wrap gap-4 shadow-sm">
            <div className="flex gap-4 items-center flex-wrap">
              <input 
                type="text"
                placeholder="🔍 Buscar placa, motorista..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-[44px] bg-surface w-64 border border-outline-variant rounded-xl px-4 text-sm outline-none focus:border-primary transition-colors focus:shadow-md"
              />
              <div className="h-6 w-px bg-outline-variant" />
              
              <div className="flex items-center gap-2 bg-surface border border-outline-variant rounded-xl px-3 h-[44px]">
                 <span className="material-symbols-outlined text-primary text-[18px]">calendar_month</span>
                 <select 
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    disabled={!!reportStartDate}
                    className="bg-transparent text-sm font-bold outline-none cursor-pointer disabled:opacity-50"
                  >
                      <option value="Todos">Mês: Todos</option>
                      {monthsNominal.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select 
                    value={reportYear}
                    onChange={(e) => setReportYear(e.target.value)}
                    disabled={!!reportStartDate}
                    className="bg-transparent text-sm font-bold outline-none cursor-pointer disabled:opacity-50"
                  >
                      <option value="Todos">Ano: Todos</option>
                      {Array.from({length: 5}, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
              </div>

              <div className="flex items-center gap-3 bg-surface-container border border-outline-variant rounded-2xl px-5 h-[52px] shadow-sm group hover:border-primary/40 transition-all duration-300">
                 <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col min-w-[80px]"
                 >
                   <span className="text-[8px] font-black uppercase text-primary tracking-wider leading-none mb-1 opacity-60">Início</span>
                   <input 
                      type="date" 
                      value={reportStartDate} 
                      onChange={e => setReportStartDate(e.target.value)} 
                      className="bg-transparent text-[11px] font-bold outline-none h-4 appearance-none text-on-surface hover:text-primary transition-colors" 
                   />
                 </motion.div>
                 <div className="w-px h-8 bg-outline-variant group-hover:bg-primary/20 transition-colors" />
                 <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col min-w-[80px]"
                 >
                   <span className="text-[8px] font-black uppercase text-primary tracking-wider leading-none mb-1 opacity-60">Fim</span>
                   <input 
                      type="date" 
                      value={reportEndDate} 
                      onChange={e => setReportEndDate(e.target.value)} 
                      className="bg-transparent text-[11px] font-bold outline-none h-4 appearance-none text-on-surface hover:text-primary transition-colors" 
                   />
                 </motion.div>
                 <AnimatePresence>
                   {(reportStartDate || reportEndDate) && (
                     <motion.button 
                       initial={{ opacity: 0, x: 10 }}
                       animate={{ opacity: 1, x: 0 }}
                       exit={{ opacity: 0, x: 10 }}
                       onClick={() => { setReportStartDate(''); setReportEndDate(''); }} 
                       className="material-symbols-outlined text-[18px] text-error p-1 rounded-full hover:bg-error/10 transition-all ml-2"
                     >
                       backspace
                     </motion.button>
                   )}
                 </AnimatePresence>
              </div>
            </div>

            <div className="flex gap-2 items-center">
              <button 
                onClick={clearFilters} 
                className={`h-11 px-6 rounded-xl border transition-all flex items-center gap-2 text-[13px] font-bold ${
                  isAnyFilterActive 
                    ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20 ring-2 ring-primary/20 scale-[1.02]' 
                    : 'bg-white border-outline-variant text-on-surface hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">filter_alt_off</span>
                Limpar Filtros
              </button>

              <div className="relative">
                <button 
                  onClick={() => setShowActionMenu(!showActionMenu)}
                  className={`h-11 w-11 rounded-full flex items-center justify-center transition-all ${showActionMenu ? 'bg-primary text-on-primary ring-4 ring-primary/20' : 'bg-surface-container-highest text-on-surface hover:bg-surface-variant'}`}
                  title="Ações do Sistema"
                >
                  <span className="material-symbols-outlined text-[22px]">{showActionMenu ? 'close' : 'more_vert'}</span>
                </button>

                <AnimatePresence>
                  {showActionMenu && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 10, x: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10, x: -10 }}
                      className="absolute right-0 top-full mt-2 w-56 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl p-2 z-[60]"
                    >
                      <button 
                        onClick={() => {
                          setShowActionMenu(false);
                          fileInputRef.current?.click();
                        }}
                        disabled={importing}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-primary/10 text-on-surface transition-colors text-sm font-medium"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <span className="material-symbols-outlined text-[20px]">upload_file</span>
                        </div>
                        {importing ? 'Importando...' : 'Importar Excel'}
                      </button>

                      <button 
                        onClick={() => {
                          setShowActionMenu(false);
                          setShowClearConfirm(true);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-error/10 text-error transition-colors text-sm font-medium"
                      >
                        <div className="w-8 h-8 rounded-lg bg-error/10 flex items-center justify-center">
                          <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
                        </div>
                        Limpar Importações
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            
            {showClearConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
                        <h4 className="text-lg font-bold text-on-surface mb-4">Confirmar exclusão</h4>
                        <p className="text-on-surface-variant mb-6">Tem certeza que deseja excluir todos os dados importados? Esta ação não pode ser desfeita.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 rounded-lg text-on-surface">Cancelar</button>
                            <button onClick={handleClearData} className="px-4 py-2 rounded-lg bg-error text-white font-semibold flex items-center gap-2" disabled={clearing}>
                                {clearing ? 'Excluindo...' : 'Confirmar Exclusão'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <input 
                type="file" 
                ref={fileInputRef} 
                accept=".xlsx,.xls" 
                className="hidden" 
                onChange={handleFileInput}
            />
            {importing && importProgress.total > 0 && (
                <div className="w-full mt-2">
                    <div className="flex justify-between text-[9px] font-bold text-primary mb-1">
                        <span>Progresso</span>
                        <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-primary/20 h-1.5 rounded-full overflow-hidden">
                        <div 
                        className="bg-primary h-full transition-all duration-300"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                        />
                    </div>
                </div>
            )}
          </div>
      </motion.div>
      <motion.div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm mb-10" variants={itemVariants}>
        <div className="p-6 border-b border-outline-variant bg-white flex justify-between items-center">
          <h4 className="text-[18px] font-semibold text-primary">Histórico de Abastecimentos</h4>
          <button 
            onClick={() => setShowReportPreview(true)}
            className="text-sm font-semibold text-primary hover:underline flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span>
            Ver Relatório Completo
          </button>
        </div>
        <div className="overflow-x-auto min-h-[450px] scrollbar-thin">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant sticky top-0 z-10">
                {columnOptions.filter(opt => ['date', 'vehiclePlate', 'workName', 'station', 'transactionCode', 'odometer', 'fuelType', 'liters', 'totalValue'].includes(opt.id) && opt.label !== 'Combustível').map(opt => (
                  <th key={opt.id} className="p-0 relative group">
                    <div className="flex items-center">
                      <button 
                        onClick={() => handleSort(opt.id)} 
                        className="flex-1 px-6 py-4 text-left text-xs font-semibold text-on-surface-variant uppercase flex items-center gap-2 hover:bg-surface-container transition-colors outline-none cursor-pointer tracking-tighter"
                      >
                        {opt.label} 
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant/30 group-hover:text-primary transition-colors">{getSortIcon(opt.id)}</span>
                      </button>
                      <div className="pr-2">
                        <ColumnFilter columnId={opt.id} label={opt.label} />
                      </div>
                    </div>
                  </th>
                ))}
                <th className="px-6 py-4 text-center text-xs font-semibold text-on-surface-variant uppercase tracking-tighter">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {sortedRecords.map((item) => {
                const cols = columnOptions.filter(opt => ['date', 'vehiclePlate', 'workName', 'station', 'transactionCode', 'odometer', 'fuelType', 'liters', 'totalValue'].includes(opt.id) && opt.label !== 'Combustível');
                return (
                  <tr key={item.id} className="hover:bg-surface-container/50 transition-colors group cursor-pointer" onClick={() => setSelectedRecord(item)}>
                    {cols.map(col => {
                      if (col.id === 'date') return (
                        <td key={col.id} className="px-6 py-4 text-[13px] font-semibold">
                          {item.date?.toDate ? item.date.toDate().toLocaleDateString('pt-BR') : '-'}
                        </td>
                      );
                      if (col.id === 'vehiclePlate') return (
                        <td key={col.id} className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm text-primary leading-none mb-1">{item.vehicleModel || 'N/A'}</span>
                            <span className="font-mono text-xs text-on-surface-variant font-bold tracking-widest"><PrivateValue value={item.vehiclePlate} /></span>
                          </div>
                        </td>
                      );
                      if (col.id === 'transactionCode') return (
                        <td key={col.id} className="px-6 py-4 text-[13px] font-mono text-on-surface">
                          {item.transactionId || (item.rawData ? item.rawData['CODIGO TRANSACAO'] || item.rawData['CÓDIGO TRANSAÇÃO'] || '-' : '-')}
                        </td>
                      );
                      if (col.id === 'workName') return (
                        <td key={col.id} className="px-6 py-4 text-[13px] text-on-surface">
                          {(() => {
                              const v = vehicles.find(v => v.plate === item.vehiclePlate);
                              const cc = (Array.isArray(v?.costCenter) ? v.costCenter.join(', ') : v?.costCenter) || v?.workName || item.workName || 'Não informada';
                              return String(cc)
                                .replace(/logística\s*-\s*região\s*sul/gi, "")
                                .replace(/,\s*,/g, ",")
                                .replace(/^[\s,]+|[\s,]+$/g, "")
                                .trim() || 'Não informada';
                          })()}
                        </td>
                      );
                      if (col.id === 'station') return (
                        <td key={col.id} className="px-6 py-4 text-[13px] font-medium truncate max-w-[120px]" title={item.station}>
                          {(() => {
                            if (item.rawData) {
                               const keys = Object.keys(item.rawData);
                               const stationKey = keys.find(k => k.toUpperCase().includes('NOME ESTABELECIMENTO'));
                               if (stationKey && item.rawData[stationKey]) return item.rawData[stationKey];
                            }
                            return item.station || '-';
                          })()}
                        </td>
                      );
                      if (col.id === 'odometer') return (
                        <td key={col.id} className="px-6 py-4 text-[13px] font-mono text-on-surface">
                          {item.odometer?.toLocaleString('pt-BR') || '-'}
                        </td>
                      );
                      if (col.id === 'fuelType') return (
                        <td key={col.id} className="px-6 py-4 text-[13px] text-on-surface">
                          {item.fuelType || '-'}
                        </td>
                      );
                      if (col.id === 'liters') return (
                        <td key={col.id} className="px-6 py-4">
                          <div className="flex flex-col">
                             <span className="font-bold text-sm text-on-surface">{item.liters} L</span>
                             <span className="text-[10px] uppercase font-black text-on-surface-variant opacity-60 leading-none">{item.fuelType || '-'}</span>
                           </div>
                        </td>
                      );
                      if (col.id === 'totalValue') return (
                        <td key={col.id} className="px-6 py-4 text-[13px] font-bold text-on-surface whitespace-nowrap">
                          R$ <PrivateValue value={item.totalValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
                        </td>
                      );
                      return <td key={col.id} className="px-6 py-4">-</td>;
                    })}
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                           onClick={(e) => { e.stopPropagation(); handleDeleteRecord(item.id); }}
                           className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                           title="Excluir abastecimento"
                         >
                           <span className="material-symbols-outlined text-[18px]">delete</span>
                         </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedRecords.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-on-surface-variant font-medium">
                    Nenhum registro de abastecimento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>


      <AnimatePresence>
        {showReportPreview && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
            onClick={() => setShowReportPreview(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] w-full max-w-5xl h-[85vh] shadow-2xl flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                <div>
                  <h3 className="text-xl font-bold text-primary flex items-center gap-2">
                    <span className="material-symbols-outlined">description</span>
                    Relatório Customizado
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${selectedColumns.length > 5 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                      Formato {selectedColumns.length > 5 ? 'Paisagem' : 'Retrato'}
                    </span>
                    <span className="text-xs text-on-surface-variant font-medium">• Escolha as colunas abaixo</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={exportPDF}
                    className="h-11 px-6 bg-primary text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[20px]">verified</span>
                    Exportar com Assinatura
                  </button>
                  <button 
                    onClick={() => setShowReportPreview(false)}
                    className="w-10 h-10 rounded-full hover:bg-black/5 flex items-center justify-center transition-colors"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>

              {/* Column Selector */}
              <div className="p-4 bg-white border-b border-outline-variant flex flex-wrap gap-2 justify-center">
                {columnOptions.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => handleToggleColumn(opt.id)}
                    className={`h-9 px-4 rounded-full text-xs font-bold transition-all border flex items-center gap-2 ${
                      selectedColumns.includes(opt.id) 
                        ? 'bg-primary text-white border-primary shadow-md' 
                        : 'bg-white text-on-surface-variant border-outline-variant hover:bg-surface-container'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {selectedColumns.includes(opt.id) ? 'check_circle' : 'circle'}
                    </span>
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* Profiles Sidebar */}
                <div className="w-[300px] bg-white border-r border-outline-variant flex flex-col p-6 overflow-y-auto custom-scrollbar">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-lg font-bold text-on-surface flex items-center gap-2">
                       <span className="material-symbols-outlined text-primary">bookmark</span>
                       Perfis Salvos
                    </h4>
                    <button 
                      onClick={() => { setEditingProfileId(null); setEditingProfileName('Novo Perfil'); }}
                      className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
                    >
                       <span className="material-symbols-outlined text-[20px]">add</span>
                    </button>
                  </div>

                  {editingProfileName !== '' && (
                    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 mb-4">
                       <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-2">Editar Nome do Perfil</label>
                       <input 
                         type="text" 
                         value={editingProfileName}
                         onChange={e => setEditingProfileName(e.target.value)}
                         autoFocus
                         className="w-full h-10 px-3 border border-outline-variant rounded-lg text-sm mb-3 focus:outline-none focus:border-primary"
                       />
                       <div className="flex gap-2">
                          <button onClick={handleSaveProfile} className="flex-1 h-9 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-dark transition-colors">
                              Atualizar Perfil
                          </button>
                          <button onClick={() => { setEditingProfileId(null); setEditingProfileName(''); }} className="flex-1 h-9 bg-surface-container-high text-on-surface text-xs font-bold rounded-lg hover:bg-surface-container-highest transition-colors">
                              Cancelar
                          </button>
                       </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {reportProfiles.map(p => (
                      <div 
                        key={p.id}
                        className="group bg-surface-container border border-primary/20 rounded-xl p-4 cursor-pointer hover:bg-primary/5 hover:border-primary transition-all relative overflow-hidden"
                        onClick={() => handleApplyProfile(p)}
                      >
                         <div className="flex justify-between items-start mb-1">
                           <h5 className="font-bold text-on-surface text-sm">{p.name}</h5>
                           <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                               onClick={(e) => { e.stopPropagation(); setEditingProfileId(p.id); setEditingProfileName(p.name); }}
                               className="p-1 text-primary hover:bg-primary/10 rounded"
                             >
                                <span className="material-symbols-outlined text-[14px]">edit</span>
                             </button>
                             <button 
                               onClick={(e) => { e.stopPropagation(); setReportProfiles(prev => prev.filter(x => x.id !== p.id)); }}
                               className="p-1 text-error hover:bg-error/10 rounded"
                             >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                             </button>
                           </div>
                         </div>
                         <p className="text-[11px] text-on-surface-variant">
                           {p.columns.length} campos • {p.columns.length > 5 ? 'Paisagem' : 'Retrato'}
                         </p>
                      </div>
                    ))}
                    {reportProfiles.length === 0 && editingProfileName === '' && (
                      <p className="text-center text-sm text-on-surface-variant italic py-10 opacity-70">
                         Nenhum perfil salvo
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-8 bg-slate-100 scrollbar-thin scrollbar-thumb-primary/20">
                  <div className={`bg-white shadow-2xl transition-all duration-500 mx-auto p-12 min-h-full border border-outline-variant ${selectedColumns.length > 5 ? 'w-fit min-w-[1000px]' : 'max-w-[800px]'}`}>
                  {/* PDF header mockup */}
                  <div className="flex justify-between items-start border-b-4 border-primary/10 pb-8 mb-8">
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex items-center gap-4">
                        <img src="https://i.imgur.com/9iZCsf6.png" alt="Rota 360" className="h-14 object-contain" />
                        <div className="h-10 w-px bg-outline-variant" />
                        <div>
                          <h1 className="text-xl font-black text-primary tracking-tight leading-none uppercase">GESTÃO DE COMBUSTÍVEL</h1>
                          <p className="text-[10px] font-bold text-on-surface-variant uppercase mt-1 tracking-widest">Documento Operacional Oficial</p>
                        </div>
                      </div>
                      <p className="text-[10px] font-black text-on-surface-variant/60 ml-2 uppercase tracking-tighter italic">{profile?.companyName || 'ROTA 360'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Data de Emissão</p>
                      <p className="text-lg font-black text-on-surface leading-none">{new Date().toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 mb-10">
                    <div className="bg-primary/5 rounded-[24px] p-6 border border-primary/10">
                      <p className="text-[10px] font-black text-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[14px]">filter_list</span>
                        Contexto do Relatório
                      </p>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-on-surface uppercase">Unidade: <span className="font-medium normal-case">{filterWork}</span></p>
                        <p className="text-xs font-bold text-on-surface uppercase mt-1">
                           Período: <span className="font-medium normal-case text-primary">
                             {(reportStartDate || reportEndDate) 
                               ? `${reportStartDate ? new Date(reportStartDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Início'} até ${reportEndDate ? new Date(reportEndDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Hoje'}` 
                               : `${reportMonth === 'Todos' ? 'Todo o período' : monthsNominal.find(m => m.value === reportMonth)?.label}/${reportYear === 'Todos' ? 'Todos os Anos' : reportYear}`}
                           </span>
                        </p>
                      </div>
                    </div>
                    <div className="bg-primary rounded-[24px] p-6 shadow-xl shadow-primary/10 flex justify-between items-center text-white">
                      <div>
                        <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Consumo Total</p>
                        <p className="text-2xl font-black leading-none">R$ {reportTotalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Litros</p>
                        <p className="text-xl font-bold leading-none">{reportTotalLiters.toLocaleString('pt-BR')} L</p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto overflow-y-hidden pb-4 scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent">
                    <table className="w-full min-w-max text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-primary text-white">
                          {selectedColumns.map(colId => {
                            const opt = columnOptions.find(o => o.id === colId);
                            if (!opt) return null;
                            return (
                              <th key={colId} className="py-3 px-4 text-left font-black uppercase tracking-tight text-[10px]">
                                {opt.label}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-on-surface/5">
                        {reportRecords.slice(0, 50).map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            {selectedColumns.map(colId => {
                              const opt = columnOptions.find(o => o.id === colId);
                              if (!opt) return null;
                              return (
                                <td key={colId} className="py-3 px-4 transition-colors">
                                {(() => {
                                  if (opt.id === 'date') return <span className="font-bold">{r.date?.toDate ? r.date.toDate().toLocaleDateString('pt-BR') : '-'}</span>;
                                  if (opt.id === 'liters') return <span className="font-bold">{r.liters}L</span>;
                                  if (opt.id === 'workName') return (
                                    <span>
                                      {(() => {
                                          const v = vehicles.find(v => v.plate === r.vehiclePlate);
                                          const cc = (Array.isArray(v?.costCenter) ? v.costCenter.join(', ') : v?.costCenter) || v?.workName || r.workName || 'Não informada';
                                          return String(cc)
                                            .replace(/logística\s*-\s*região\s*sul/gi, "")
                                            .replace(/,\s*,/g, ",")
                                            .replace(/^[\s,]+|[\s,]+$/g, "")
                                            .trim() || 'Não informada';
                                      })()}
                                    </span>
                                  );

                                  if (opt.id === 'vehiclePlate') return (
                                    <div className="flex items-center gap-2">
                                      {(() => {
                                         const v = vehicles.find(veh => veh.plate === r.vehiclePlate);
                                         const imgUrl = v?.imageUrl || v?.photoUrl;
                                         return imgUrl ? (
                                           <img src={imgUrl} className="w-8 h-6 object-cover rounded shadow-sm border border-slate-200" alt="Veículo" />
                                         ) : (
                                           <div className="w-8 h-6 bg-slate-100 rounded flex items-center justify-center border border-slate-200">
                                              <span className="material-symbols-outlined text-[14px] text-slate-400">directions_car</span>
                                           </div>
                                         );
                                      })()}
                                      <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-black">{r.vehiclePlate}</span>
                                    </div>
                                  );
                                  
                                  if (opt.id === 'totalValue') return <span className="font-bold text-primary">R$ {Number(r.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>;
                                  if (opt.id === 'transactionCode') return <span className="font-mono">{r.transactionId || (r.rawData ? r.rawData['CODIGO TRANSACAO'] || r.rawData['CÓDIGO TRANSAÇÃO'] || '-' : '-')}</span>;
                                  if (opt.id === 'unitPrice') return <span className="">R$ {(Number(r.totalValue || 0) / (Number(r.liters) || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>;
                                  if (opt.id === 'station') {
                                    if (r.rawData) {
                                        const keys = Object.keys(r.rawData);
                                        const stationKey = keys.find(k => k.toUpperCase().includes('NOME ESTABELECIMENTO'));
                                        if (stationKey && r.rawData[stationKey]) return r.rawData[stationKey];
                                    }
                                    return r.station || '-';
                                  }
                                  
                                  if (opt.id === 'vehicleModel') return r.vehicleModel || '-';

                                  
                                  if (opt.id === 'driverRegistration') return r.driverRegistration || (r.rawData ? Object.entries(r.rawData).find(([k]) => String(k).toUpperCase().includes('MATRICULA'))?.[1] || '-' : '-');
                                  if (opt.id === 'driverName') return r.driverName || (r.rawData ? Object.entries(r.rawData).find(([k, v]) => String(k).toUpperCase().includes('MOTORISTA') && typeof v === 'string' && v.length > 3)?.[1] || '-' : '-');
                                  if (opt.id === 'cityState') {
                                    if (!r.rawData) return '-';
                                    const cid = Object.entries(r.rawData).find(([k]) => String(k).toUpperCase() === 'CIDADE' || String(k).toUpperCase().includes('MUNICÍPIO'))?.[1];
                                    const est = Object.entries(r.rawData).find(([k]) => String(k).toUpperCase() === 'ESTADO' || String(k).toUpperCase() === 'UF')?.[1];
                                    const cidEst = Object.entries(r.rawData).find(([k]) => String(k).toUpperCase().includes('CIDADE') && String(k).toUpperCase().includes('ESTADO'))?.[1];
                                    if (cid && est) return `${cid}/${est}`;
                                    if (cid) return String(cid);
                                    if (cidEst) return String(cidEst);
                                    return '-';
                                  }

                                  return (r as any)[colId] || '-';
                                })()}
                              </td>
                            );
                          })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {reportRecords.length > 50 && (
                    <div className="py-8 text-center border-t border-dashed mt-4">
                      <p className="text-[11px] font-bold text-on-surface-variant italic">Mostrando prévia dos primeiros 50 de {reportRecords.length} registros...</p>
                    </div>
                  )}

                  <div className="mt-12 pt-12 border-t-4 border-primary/5 flex justify-between items-start relative">
                    <div className="absolute top-2 left-0 text-[10px] text-slate-300 font-medium italic">By Pablo Moreira</div>
                    <div className="flex gap-4">
                      <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center border border-primary/10">
                         <span className="material-symbols-outlined text-primary text-[32px]">verified</span>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest">Segurança Eletrônica</p>
                        <p className="text-xs font-bold text-on-surface mt-1">Este documento contém assinatura digital ROTA 360</p>
                        <p className="text-[10px] text-on-surface-variant font-medium mt-1">por {profile?.name || 'Assinante Autorizado'}</p>
                        <p className="text-[10px] text-primary/60 font-black mt-0.5">ID: verification-code-preview</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-tighter mb-1">Total Consolidado</p>
                      <p className="text-3xl font-black text-primary leading-none">R$ {reportTotalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedRecord && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
            onClick={() => setSelectedRecord(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#121212]/95 border border-white/10 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden my-8 backdrop-blur-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Detalhes do Abastecimento</h3>
                    <p className="text-white/60 text-sm mt-1">
                        Transação: <span className="font-mono text-white/80">{selectedRecord.transactionId || '-'}</span>
                    </p>
                </div>
                <button 
                  onClick={() => setSelectedRecord(null)}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[70vh] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20" style={{ scrollbarColor: 'rgba(255,255,255,0.1) transparent', backgroundColor: '#121212' }}>
                <div className="flex flex-col md:flex-row gap-6 mb-8">
                    {/* Vehicle & Driver Images Check */}
                    {(() => {
                        const vehicleDoc = vehicles.find(v => String(v.plate).toUpperCase().replace(/[^A-Z0-9]/g, '') === String(selectedRecord.vehiclePlate).toUpperCase().replace(/[^A-Z0-9]/g, ''));
                        
                        let extractedDriverName = selectedRecord.driverName || '';
                        if (!extractedDriverName && selectedRecord.rawData) {
                            const entry = Object.entries(selectedRecord.rawData).find(([k, v]) => String(k).toUpperCase().includes('MOTORISTA') && typeof v === 'string' && v.trim().length > 2);
                            if (entry) extractedDriverName = String(entry[1]);
                        }
                        
                        const driverDoc = extractedDriverName ? drivers.find(d => {
                             const target = extractedDriverName.toLowerCase().trim();
                             const dName = String(d.name).toLowerCase().trim();
                             return target === dName || target.includes(dName) || dName.includes(target);
                        }) : null;
                        
                        return (
                           <div className="flex gap-4 md:w-1/3">
                              {(vehicleDoc?.imageUrl || vehicleDoc?.photoUrl) && (
                                  <div className="flex-1 flex flex-col items-center">
                                      <div className="w-full aspect-square rounded-2xl bg-white border border-white/10 overflow-hidden relative group flex items-center justify-center">
                                          <img src={vehicleDoc.imageUrl || vehicleDoc.photoUrl} alt="Veículo" className="max-w-[90%] max-h-[90%] object-contain group-hover:scale-105 transition-transform duration-500" />
                                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                      </div>
                                      <span className="text-white/70 text-[10px] font-bold mt-2 uppercase tracking-widest text-center">{vehicleDoc.plate}</span>
                                  </div>
                              )}
                              {(driverDoc?.imageUrl || driverDoc?.photoUrl) && (
                                  <div className="flex-1 flex flex-col items-center">
                                      <div className="w-full aspect-square rounded-2xl bg-white border border-white/10 overflow-hidden relative group flex items-center justify-center">
                                          <img src={driverDoc.imageUrl || driverDoc.photoUrl} alt="Motorista" className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-500" />
                                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                      </div>
                                      <span className="text-white/70 text-[10px] font-bold mt-2 uppercase tracking-widest text-center">{driverDoc.name.split(' ')[0]}</span>
                                  </div>
                              )}
                              {!(vehicleDoc?.imageUrl || vehicleDoc?.photoUrl) && !(driverDoc?.imageUrl || driverDoc?.photoUrl) && (
                                  <div className="w-full h-32 rounded-2xl border border-white/10 border-dashed flex items-center justify-center text-white/30 text-sm font-medium">
                                      Sem imagens associadas
                                  </div>
                              )}
                           </div>
                        );
                    })()}

                    <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="col-span-full mb-2">
                             <h4 className="text-white/90 font-semibold tracking-tight text-lg mb-4">Métricas</h4>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                 <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                     <span className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">Valor Total</span>
                                     <span className="text-lg font-bold text-white">R$ {Number(selectedRecord.totalValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                 </div>
                                 <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                     <span className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">Litros</span>
                                     <span className="text-lg font-bold text-white">{selectedRecord.liters} L</span>
                                 </div>
                                 <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                     <span className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">Odômetro</span>
                                     <span className="text-lg font-bold text-white font-mono">{selectedRecord.odometer}</span>
                                 </div>
                                 <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                     <span className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">Data</span>
                                     <span className="text-sm font-bold text-white">
                                        {selectedRecord.date?.toDate ? selectedRecord.date.toDate().toLocaleString('pt-BR') : '-'}
                                     </span>
                                 </div>
                             </div>
                        </div>
                    </div>
                </div>

                <div className="border-t border-white/10 pt-6">
                    <h4 className="text-white/90 font-semibold tracking-tight text-lg mb-4">Dados Brutos Importados ({selectedRecord.rawData ? Object.keys(selectedRecord.rawData).length : '0'} Colunas)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {selectedRecord.rawData && Object.entries(selectedRecord.rawData).map(([key, value]) => (
                            <div key={key} className="bg-surface-container-lowest/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors">
                                <span className="text-[10px] text-white/50 uppercase tracking-wider block mb-1 truncate" title={key}>{key}</span>
                                <span className="text-sm font-medium text-white/90 break-words">{String(value || '-')}</span>
                            </div>
                        ))}
                        {!selectedRecord.rawData && (
                            <div className="col-span-full text-white/50 text-sm">Nenhum dado bruto disponível para este registro. Reimporte o documento para salvar as colunas extras.</div>
                        )}
                    </div>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm p-6 mb-10" variants={itemVariants}>
        <h4 className="text-[18px] font-semibold text-primary mb-6">Histórico de Importações</h4>
        <div className="space-y-4">
            {importLogs.length === 0 && <p className="text-on-surface-variant">Nenhum histórico de importação.</p>}
            {importLogs.map(log => (
                <div key={log.id} className="flex justify-between items-center p-4 bg-white rounded-xl border border-outline-variant shadow-sm">
                    <div>
                        <p className="font-semibold text-on-surface">{log.fileName}</p>
                        <p className="text-xs text-on-surface-variant">{log.user} • {log.createdAt?.toDate?.()?.toLocaleString() || 'Data indisponível'} • {log.total} registros</p>
                    </div>
                    <button 
                        onClick={async () => {
                            setDialog({ 
                                message: 'Tem certeza que deseja excluir esta importação e todos os registros associados?',
                                onConfirm: async () => {
                                    setClearing(true);
                                    try {
                                        const q = query(collection(db, 'fuel_records'), where('importId', '==', log.id));
                                        const snapshot = await getDocs(q);
                                        const batch = writeBatch(db);
                                        snapshot.forEach(doc => batch.delete(doc.ref));
                                        batch.delete(doc(db, 'fuel_imports', log.id));
                                        await batch.commit();
                                    } catch (err) {
                                        console.error(err);
                                        setDialog({ message: 'Erro ao apagar dados importados.' });
                                    } finally {
                                        setClearing(false);
                                    }
                                }
                            });
                        }}
                        disabled={clearing}
                        className="text-error hover:bg-error/10 p-2 rounded-lg transition-colors"
                    >
                        <span className="material-symbols-outlined">delete</span>
                    </button>
                </div>
            ))}
        </div>
      </motion.div>

    </motion.div>
  );
}

