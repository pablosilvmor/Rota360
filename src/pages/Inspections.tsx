import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  updateDoc,
  getDocs,
  where,
  orderBy,
  limit,
  addDoc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { auditDelete } from "../lib/audit";
import { useParams, useNavigate, Link } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { SearchableSelect } from "../components/SearchableSelect";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { useAuth } from "../contexts/AuthContext";
import { PrivateValue, usePrivacy } from "../contexts/PrivacyContext";
import * as XLSX from "xlsx";
import * as htmlToImage from "html-to-image";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createSignature, getQRCodeDataUrl, generateVerificationUrl } from '../utils/pdfSignature';

import {
  InspectionItem,
  InspectionRecord,
  isTimeBasedUnit,
  calculateNextDate,
  calculateDaysDiff,
  calculateProgress,
} from "../lib/progressUtils";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
} as const;

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
} as const;

function formatKM(km: number | undefined | null) {
  if (km === undefined || km === null) return "0";
  return km.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function InspectionForm({
  vehicleId,
  onBack,
  onPlateClick,
}: {
  vehicleId: string;
  onBack: () => void;
  onPlateClick: (vehicle: any) => void;
}) {
  const { user, userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  const { isPrivacyMode } = usePrivacy();
  const [vehicle, setVehicle] = useState<any>(null);
  const [loadingForm, setLoadingForm] = useState(true);
  const [loadingVehicle, setLoadingVehicle] = useState(true);

  const [currentKM, setCurrentKM] = useState<number>(0);
  const [isUpdatingKM, setIsUpdatingKM] = useState(false);

  const [items, setItems] = useState<InspectionItem[]>([]);
  const [records, setRecords] = useState<Record<string, InspectionRecord>>({});

  const [showImport, setShowImport] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [newItemData, setNewItemData] = useState({
    name: "",
    periodicityKM: "",
    unit: "km",
  });
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [customAlert, setCustomAlert] = useState<{ message: string; type?: 'error' | 'success' | 'info'; title?: string; onConfirm?: () => void } | null>(null);
  const [isGeneratingAlert, setIsGeneratingAlert] = useState(false);
  const [vehicleImgDataUrl, setVehicleImgDataUrl] = useState<string | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [resolvedVehicleId, setResolvedVehicleId] = useState<string | null>(
    null,
  );

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemData, setEditItemData] = useState<{
    name: string;
    periodicityKM: number;
    unit: string;
  }>({ name: "", periodicityKM: 0, unit: "km" });
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);
  const [itemSearchText, setItemSearchText] = useState("");
  const [checklistDate, setChecklistDate] = useLocalStorageState<string>(
    `inspections_checklistDate_${vehicleId}`,
    ""
  );
  const [historyKM, setHistoryKM] = useState<number | null>(null);
  const [concludedMaintenanceOrders, setConcludedMaintenanceOrders] = useState<any[]>([]);

  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean;
    isBulk: boolean;
    itemId?: string;
  }>({ isOpen: false, isBulk: false });

  useEffect(() => {
    // Fetch vehicle details with real-time listener
    let isMounted = true;

    const findAndListenVehicle = async () => {
      let unsubscribe: (() => void) | null = null;
      setLoadingVehicle(true);
      const decId = decodeURIComponent(vehicleId);

      try {
        let targetId = "";
        
        // 1. Tentar ID direto
        const vRef = doc(db, "vehicles", decId);
        const vSnap = await getDoc(vRef);
        if (vSnap.exists()) {
          targetId = vSnap.id;
        } else {
          // 2. Tentar por placa
          const q = query(collection(db, "vehicles"), where("plate", "==", decId));
          const snap = await getDocs(q);
          if (!snap.empty) {
            targetId = snap.docs[0].id;
          } else {
            // 3. Busca fuzzy
            const allSnap = await getDocs(collection(db, "vehicles"));
            const matched = allSnap.docs.find(
              (d) =>
                d.id.replace(/[^a-zA-Z0-9]/g, "") === decId.replace(/[^a-zA-Z0-9]/g, "") ||
                d.data().plate === decId
            );
            if (matched) targetId = matched.id;
          }
        }

        if (targetId && isMounted) {
          unsubscribe = onSnapshot(doc(db, "vehicles", targetId), (docSnap) => {
            if (docSnap.exists() && isMounted) {
              const data = docSnap.data();
              setVehicle({ id: docSnap.id, ...data });
              setResolvedVehicleId(docSnap.id);
              // Sempre atualiza o KM local quando o banco mudar (útil para o Sync)
              setCurrentKM(data.currentKM || 0);
              setLoadingVehicle(false);
              setLoadingForm(false);
            }
          });
        } else {
          if (isMounted) {
            setLoadingVehicle(false);
            setLoadingForm(false);
          }
        }
      } catch (err) {
        console.error("Erro ao buscar e ouvir veículo:", err);
        if (isMounted) {
          setLoadingVehicle(false);
          setLoadingForm(false);
        }
      }

      return unsubscribe;
    };

    const unsubPromise = findAndListenVehicle();

    return () => {
      isMounted = false;
      unsubPromise.then((unsub) => unsub?.());
    };
  }, [vehicleId]);

  useEffect(() => {
    if (!vehicle?.imageUrl) return;

    let isMounted = true;
    const imgUrl = vehicle.imageUrl;
    const proxies = [
      `https://wsrv.nl/?url=${encodeURIComponent(imgUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(imgUrl)}`,
      imgUrl,
    ];

    let proxyIdx = 0;
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/jpeg");
          if (isMounted) setVehicleImgDataUrl(dataUrl);
        }
      } catch (e) {
        console.warn("CORS blocked canvas export for image:", imgUrl);
      }
    };

    img.onerror = () => {
      proxyIdx++;
      if (proxyIdx < proxies.length && isMounted) {
        img.src = proxies[proxyIdx];
      }
    };

    img.src = proxies[0];

    return () => {
      isMounted = false;
    };
  }, [vehicle?.imageUrl]);

  useEffect(() => {
    if (!resolvedVehicleId) return;

    let isMounted = true;
    let unsubscribeItems: any = null;
    let unsubscribeRecords: any = null;

    try {
      // Listen to inspection items for this vehicle
      const qItems = query(
        collection(db, `inspections/${resolvedVehicleId}/items`),
      );
      unsubscribeItems = onSnapshot(
        qItems,
        (snapshot) => {
          if (!isMounted) return;
          const itemsData = snapshot.docs.map((d) => {
            const data = d.data();
            const periodicityKM = Number(data.periodicityKM);
            return { id: d.id, ...data, periodicityKM };
          }) as InspectionItem[];
          setItems(itemsData);
        },
        (error) => {
          console.error("Error items listener:", error);
          handleFirestoreError(
            error,
            OperationType.LIST,
            `inspections/${resolvedVehicleId}/items`,
          );
        },
      );

      // Listen to inspection records for this vehicle
      const qRecords = query(
        collection(db, `inspections/${resolvedVehicleId}/records`),
      );
      unsubscribeRecords = onSnapshot(
        qRecords,
        (snapshot) => {
          if (!isMounted) return;
          const recs: Record<string, InspectionRecord> = {};
          snapshot.docs.forEach((d) => {
            const data = d.data() as InspectionRecord;
            recs[data.itemId] = { id: d.id, ...data };
          });
          setRecords(recs);
          setLoadingForm(false);
        },
        (error) => {
          console.error("Error records listener:", error);
          handleFirestoreError(
            error,
            OperationType.LIST,
            `inspections/${resolvedVehicleId}/records`,
          );
          if (isMounted) setLoadingForm(false);
        },
      );
    } catch (e: any) {
      console.error("Error starting listeners:", e);
      if (isMounted) setLoadingForm(false);
    }

    return () => {
      isMounted = false;
      if (unsubscribeItems) unsubscribeItems();
      if (unsubscribeRecords) unsubscribeRecords();
    };
  }, [resolvedVehicleId]);

  // Consistency check useEffect to fix incorrect NextMaintenanceKM
  useEffect(() => {
    if (
      !resolvedVehicleId ||
      items.length === 0 ||
      Object.keys(records).length === 0
    )
      return;

    const fixInconsistencies = async () => {
      const batch = writeBatch(db);
      let needsBatch = false;

      items.forEach((item) => {
        const record = records[item.id];
        if (record) {
          const expectedNextKM =
            Number(record.lastMaintenanceKM) + Number(item.periodicityKM);
          // If difference is more than 0 (to avoid float issues, though they should be ints)
          if (
            Math.abs(Number(record.nextMaintenanceKM) - expectedNextKM) > 0.1
          ) {
            console.log(
              `Syncing record for ${item.name}: ${record.nextMaintenanceKM} -> ${expectedNextKM}`,
            );
            batch.update(
              doc(db, `inspections/${resolvedVehicleId}/records`, record.id),
              {
                nextMaintenanceKM: expectedNextKM,
                updatedAt: serverTimestamp(),
              },
            );
            needsBatch = true;
          }
        }
      });

      if (needsBatch) {
        try {
          await batch.commit();
        } catch (error) {
          console.error("Error syncing maintenance KM:", error);
        }
      }
    };

    fixInconsistencies();
  }, [items, records, resolvedVehicleId]);

  useEffect(() => {
    if (!checklistDate || !resolvedVehicleId) {
        setHistoryKM(null);
        setConcludedMaintenanceOrders([]);
        return;
    }
    const fetchMaintenanceInfo = async () => {
      // 1. Fetch History KM
      const qKm = query(
        collection(db, "checklist_history"),
        where("vehicleId", "==", resolvedVehicleId),
        where("date", "==", checklistDate),
        where("status", "==", "Concluído"),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      const snapKm = await getDocs(qKm);
      setHistoryKM(!snapKm.empty ? snapKm.docs[0].data().kmAtClosure || null : null);

      // 2. Fetch Concluded Maintenance Orders
      const qOs = query(
        collection(db, "maintenance"),
        where("vehicleId", "==", resolvedVehicleId),
        where("status", "==", "Concluído")
      );
      const snapOs = await getDocs(qOs);
      const orders = snapOs.docs.map(d => ({ id: d.id, ...d.data() } as any));
      
      // Filtrar pelo dia no javascript comparando strings YYYY-MM-DD para evitar problemas de fuso horário
      const dateTarget = checklistDate; // "YYYY-MM-DD"
      const filteredOrders = orders.filter(os => {
          const createdAt = os.createdAt?.toDate ? os.createdAt.toDate() : (os.createdAt ? new Date(os.createdAt) : null);
          if (!createdAt) return false;
          
          const y = createdAt.getFullYear();
          const m = String(createdAt.getMonth() + 1).padStart(2, '0');
          const d = String(createdAt.getDate()).padStart(2, '0');
          const osDateStr = `${y}-${m}-${d}`;

          return osDateStr === dateTarget;
      });
      setConcludedMaintenanceOrders(filteredOrders);
    };
    fetchMaintenanceInfo();
  }, [checklistDate, resolvedVehicleId]);

  const isServiceExecuted = (itemId: string) => {
    return concludedMaintenanceOrders.some(os => 
        os.inspectionItems?.some((i: any) => i.id === itemId || i.itemId === itemId)
    ) ? "SIM" : "NÃO";
  };

  const parseKM = (val: string) => {
    return parseInt(val.replace(/\D/g, "") || "0", 10);
  };

  const handleUpdateKM = async () => {
    if (!vehicle) return;
    setIsUpdatingKM(true);
    try {
      await updateDoc(doc(db, "vehicles", vehicleId), {
        currentKM: currentKM,
        updatedAt: serverTimestamp(),
      });
      // Also save the record in vehicle state so we don't feel lagging
      setVehicle({ ...vehicle, currentKM });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `vehicles/${vehicleId}`,
      );
    } finally {
      setIsUpdatingKM(false);
    }
  };

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportConfig, setExportConfig] = useState({
    inspection: true,
    checklist: false,
    maintenance: false,
    date: new Date().toISOString().split('T')[0]
  });

  const [isChecklistAvailable, setIsChecklistAvailable] = useState(false);
  const [isMaintenanceAvailable, setIsMaintenanceAvailable] = useState(false);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const checkAvailability = async () => {
      if (!showExportModal || !exportConfig.date || !resolvedVehicleId) return;
      
      setIsCheckingAvailability(true);
      try {
        // Check Checklist
        const qChecklist = query(
          collection(db, "checklist_history"),
          where("vehicleId", "==", resolvedVehicleId),
          where("date", "==", exportConfig.date),
          limit(1)
        );
        const snapChecklist = await getDocs(qChecklist);
        if (!isMounted) return;
        const checklistFound = !snapChecklist.empty;
        setIsChecklistAvailable(checklistFound);

        // Check OS
        const targetDateStr = exportConfig.date.split('-').reverse().join('-');
        const qMaintenance = query(
          collection(db, "maintenance"),
          where("vehicleId", "==", resolvedVehicleId),
          where("status", "==", "Concluído")
        );
        const snapMaintenance = await getDocs(qMaintenance);
        if (!isMounted) return;
        const maintenanceFound = snapMaintenance.docs.some(o => {
          const data = o.data();
          return data.title && data.title.includes(targetDateStr) && data.title.includes("OS Automática");
        });
        setIsMaintenanceAvailable(maintenanceFound);

        // Update config if currently selected but not available
        setExportConfig(prev => ({
          ...prev,
          checklist: prev.checklist && checklistFound,
          maintenance: prev.maintenance && maintenanceFound
        }));

      } catch (error) {
        console.error("Error checking document availability:", error);
      } finally {
        if (isMounted) setIsCheckingAvailability(false);
      }
    };

    checkAvailability();
    return () => { isMounted = false; };
  }, [showExportModal, exportConfig.date, resolvedVehicleId]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [manualDateInput, setManualDateInput] = useState("");
  const [pickerDate, setPickerDate] = useState(() => {
    return new Date();
  });

  const [exportStep, setExportStep] = useState("");
  const [exportProgressVal, setExportProgressVal] = useState(0);

  const exportToPDF = async () => {
    setShowExportModal(true);
    const targetDate = checklistDate || new Date().toISOString().split('T')[0];
    setExportConfig(prev => ({ ...prev, date: targetDate }));
    const d = new Date(targetDate + "T12:00:00");
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    setPickerDate(validDate);
    setManualDateInput(validDate.toLocaleDateString('pt-BR'));
  };

  const handleManualDateChange = (val: string) => {
    // Máscara simples DD/MM/YYYY
    let clean = val.replace(/\D/g, "");
    if (clean.length > 8) clean = clean.substring(0, 8);
    
    let formatted = clean;
    if (clean.length > 2) formatted = clean.substring(0, 2) + "/" + clean.substring(2);
    if (clean.length > 4) formatted = formatted.substring(0, 5) + "/" + formatted.substring(5);
    
    setManualDateInput(formatted);

    if (clean.length === 8) {
      const day = parseInt(clean.substring(0, 2));
      const month = parseInt(clean.substring(2, 4)) - 1;
      const year = parseInt(clean.substring(4, 8));
      const d = new Date(year, month, day, 12, 0, 0);
      
      if (!isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
        const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        setExportConfig(prev => ({ ...prev, date: isoDate }));
        setPickerDate(d);
      }
    }
  };

  const confirmExportUnifiedPDF = async () => {
    setIsExporting(true);
    setExportProgressVal(5);
    setExportStep("Iniciando exportação unificada...");
    setShowExportModal(false);
    try {
      setExportStep("Carregando geradores de PDF...");
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      setExportProgressVal(15);
      setExportStep("Criando estrutura do documento...");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.setFont("helvetica");

      let hasPages = false;

      // Garantir que a imagem do veículo esteja carregada
      let finalImgDataUrl = vehicleImgDataUrl;
      setExportProgressVal(25);
      setExportStep("Processando imagem do veículo...");
      if (!finalImgDataUrl && vehicle.imageUrl) {
        try {
          const imgUrl = vehicle.imageUrl;
          const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(imgUrl)}&w=400&output=jpeg`;
          const resp = await fetch(proxyUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            finalImgDataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          }
        } catch (e) {
          console.warn("Could not load image for PDF:", e);
        }
      }

      // Função helper para desenhar a Inspeção / Checklist
      const drawInspectionPage = async (isChecklistHistory) => {
        if (hasPages) {
           pdf.addPage();
        }
        
        let localHistoryKM = null;
        let localConcludedMaintenanceOrders = [];
        let historicalRecords: Record<string, any> = {};
        const rawDate = exportConfig.date || checklistDate || new Date().toISOString().split('T')[0];
        const dateLabel = rawDate.includes('-') 
          ? rawDate.split('-').reverse().join('/') 
          : rawDate;

        if (isChecklistHistory) {
          // Fetch historical records for exportConfig.date
          const qKm = query(
            collection(db, "checklist_history"),
            where("vehicleId", "==", resolvedVehicleId),
            where("date", "==", exportConfig.date)
          );
          const snapKm = await getDocs(qKm);
          if (!snapKm.empty) {
            // Get the latest one if multiple exist for the same day
            const docs = snapKm.docs.map(d => ({...d.data(), createdAt: d.data().createdAt?.toDate?.() || new Date(0)}));
            docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            const docData = docs[0] as any;

            localHistoryKM = docData.kmAtClosure ?? docData.vehicleKM ?? null;
            
            // Map historical inspection items to a record object
            const historicalItems = docData.items || docData.inspectionItems || [];
            if (historicalItems) {
              historicalItems.forEach((item: any) => {
                const itemId = item.id || item.itemId;
                if (itemId) {
                  // Normalize fields: Checklist.tsx uses 'conformidade' and 'service'
                  let conformity = item.conformity || item.conformidade || "-";
                  if (conformity === "Em conformidade") conformity = "SIM";
                  if (conformity === "Não conforme") conformity = "NÃO";

                  let serviceExecuted = item.serviceExecuted || (item.service && item.service !== "NÃO" ? "SIM" : "NÃO");
                  
                  historicalRecords[itemId] = {
                    ...item,
                    conformity: conformity,
                    serviceExecuted: serviceExecuted
                  };
                }
              });
            }
          } else {
            console.warn(`Histórico de Checklist não encontrado para ${exportConfig.date}`);
          }

          const qOs = query(
            collection(db, "maintenance"),
            where("vehicleId", "==", resolvedVehicleId)
          );
          const snapOs = await getDocs(qOs);
          const orders = snapOs.docs.map(d => ({ id: d.id, ...d.data() } as any));
          
          const targetDateStr = exportConfig.date.split('-').reverse().join('-'); // DD-MM-YYYY

          localConcludedMaintenanceOrders = orders.filter(os => {
            // First check by title (more reliable for automatic ones: OS Automática: Checklist DD-MM-YYYY)
            if (os.title && os.title.includes(targetDateStr)) return true;

            // Then check by createdAt date
            const createdAt = os.createdAt?.toDate ? os.createdAt.toDate() : (os.createdAt ? new Date(os.createdAt) : null);
            if (!createdAt) return false;
            const y = createdAt.getFullYear();
            const m = String(createdAt.getMonth() + 1).padStart(2, "0");
            const d = String(createdAt.getDate()).padStart(2, "0");
            return `${y}-${m}-${d}` === exportConfig.date;
          });
        } else {
          localHistoryKM = historyKM; 
          localConcludedMaintenanceOrders = concludedMaintenanceOrders;
        }

        const checkServiceExecuted = (itemId) => {
          return localConcludedMaintenanceOrders.some(os => 
              os.inspectionItems?.some((i) => i.id === itemId || i.itemId === itemId)
          ) ? "SIM" : "NÃO";
        };

        const tableData = [];
        sortedItems.forEach((item) => {
          if (!item || !item.id) return;
          
          let record: any;
          if (isChecklistHistory) {
            record = historicalRecords[item.id] || { 
              conformity: "-", 
              serviceExecuted: "-", 
              lastMaintenanceKM: 0, 
              nextMaintenanceKM: 0, 
              lastMaintenanceDate: null, 
              nextMaintenanceDate: null 
            };
          } else {
            record = (records[item.id] || { 
              conformity: "", 
              serviceExecuted: "", 
              lastMaintenanceKM: 0, 
              nextMaintenanceKM: 0, 
              lastMaintenanceDate: null, 
              nextMaintenanceDate: null, 
              id: "", 
              itemId: "" 
            }) as InspectionRecord;
          }

          const currentVehicleKM = isChecklistHistory ? (localHistoryKM || vehicle.currentKM || 0) : (vehicle.currentKM || vehicle.odometer || 0);

          let conformityVal = record.conformity || "-";
          
          const { progressPercent, remainingNumber, isOutdated, descRemaining } = calculateProgress(item, record, currentVehicleKM);
          const progressText = `${Math.round(progressPercent)}%`;

          const rawServiceExec = (isChecklistHistory ? (record.serviceExecuted === "-" ? checkServiceExecuted(item.id) : record.serviceExecuted) : (record.serviceExecuted || "-")) as string;
          const serviceExecText = ["SIM", "NÃO", "NaKM"].includes(rawServiceExec) ? rawServiceExec : (String(rawServiceExec) === "CONTROLEAR" || String(rawServiceExec) === "Controlar" ? "-" : rawServiceExec);

          tableData.push([
            `${item.name}\nPeriodicidade: ${(item.periodicityKM ?? 0).toLocaleString('pt-BR')} ${item.unit || "km"}`,
            conformityVal,
            serviceExecText,
            isTimeBasedUnit(item.unit)
              ? record.lastMaintenanceDate ? new Date(record.lastMaintenanceDate + "T12:00:00").toLocaleDateString("pt-BR") : "-"
              : record.lastMaintenanceKM?.toLocaleString('pt-BR') || '0',
            `Próx: ${isTimeBasedUnit(item.unit) ? (record.nextMaintenanceDate ? new Date(record.nextMaintenanceDate + "T12:00:00").toLocaleDateString("pt-BR") : "-") : record.nextMaintenanceKM?.toLocaleString('pt-BR') || '0'}\n${descRemaining}\nProgresso: ${progressText}\n`,
          ]);
        });

        autoTable(pdf, {
          startY: 40,
          margin: { top: 40, bottom: 20, left: 14, right: 14 },
          head: [["ITEM", "AÇÕES EM CONFORMIDADE", "SERVIÇO EXECUTADO", "ÚLTIMA MANUT.", "PROGRESSO"]],
          body: tableData,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 4, right: 4, bottom: 6, left: 4 }, valign: "middle" },
          headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: "bold", fontSize: 7, halign: "left", lineColor: [226, 232, 240], lineWidth: 0.1 },
          bodyStyles: { lineColor: [226, 232, 240], lineWidth: 0.1 },
          columnStyles: { 0: { cellWidth: 55 }, 1: { halign: "center", cellWidth: 35 }, 2: { halign: "center", cellWidth: 35 }, 3: { halign: "center", cellWidth: 25 }, 4: { halign: "left", fontStyle: "bold" } },
          didDrawPage: function (data) {
            let startY = 15;
            if (finalImgDataUrl) {
              pdf.addImage(finalImgDataUrl, "JPEG", 14, startY, 35, 20);
              pdf.setFontSize(16);
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(0, 0, 0);
              pdf.text(`${isChecklistHistory ? 'Histórico de Checklist' : 'Inspeção'}: ${vehicle.plate}`, 54, startY + 8);
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(100, 100, 100);
              pdf.text(`${vehicle.model}`, 54, startY + 14);
            } else {
              pdf.setFontSize(16);
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(0, 0, 0);
              pdf.text(`${isChecklistHistory ? 'Histórico de Checklist' : 'Inspeção'}: ${vehicle.plate}`, 14, startY + 8);
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(100, 100, 100);
              pdf.text(`${vehicle.model}`, 14, startY + 14);
            }

            const infoBoxWidth = 24;
            const infoBoxHeight = 16;
            const infoSpacing = 2;
            const rightMargin = 10;
            
            // KM Atual
            pdf.setFillColor(241, 245, 249);
            pdf.roundedRect(pageWidth - infoBoxWidth - rightMargin, startY, infoBoxWidth, infoBoxHeight, 2, 2, "F");
            pdf.setFontSize(5);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(100, 116, 139);
            pdf.text("KM ATUAL", pageWidth - infoBoxWidth - rightMargin + 3, startY + 5);
            pdf.setFontSize(8);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(30, 41, 59);
            pdf.text((vehicle.currentKM || vehicle.odometer || 0).toLocaleString('pt-BR'), pageWidth - infoBoxWidth - rightMargin + 3, startY + 12);

            // Data Checklist
            const dateBoxX = pageWidth - (infoBoxWidth * 2) - infoSpacing - rightMargin;
            pdf.setFillColor(241, 245, 249);
            pdf.roundedRect(dateBoxX, startY, infoBoxWidth, infoBoxHeight, 2, 2, "F");
            pdf.setFontSize(5);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(100, 116, 139);
            pdf.text("DATA CHECKLIST", dateBoxX + 3, startY + 5);
            pdf.setFontSize(8);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(30, 41, 59);
            pdf.text(dateLabel, dateBoxX + 3, startY + 12);

            // KM Checklist
            const kmChecklistX = pageWidth - (infoBoxWidth * 3) - (infoSpacing * 2) - rightMargin;
            pdf.setFillColor(241, 245, 249);
            pdf.roundedRect(kmChecklistX, startY, infoBoxWidth, infoBoxHeight, 2, 2, "F");
            pdf.setFontSize(5);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(100, 116, 139);
            pdf.text("KM CHECKLIST", kmChecklistX + 3, startY + 5);
            pdf.setFontSize(8);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(30, 41, 59);
            pdf.text((localHistoryKM !== null && localHistoryKM !== undefined) ? localHistoryKM.toLocaleString('pt-BR') : "-", kmChecklistX + 3, startY + 12);
          },
          didDrawCell: function (data) {
            if (data.section === "body" && data.column.index === 4) {
              const rowIndex = data.row.index;
              const item = sortedItems[rowIndex];
              if (!item) return;

              const record = (isChecklistHistory 
                ? (historicalRecords[item.id] || { conformity: "-", serviceExecuted: "-", lastMaintenanceKM: 0, nextMaintenanceKM: 0, lastMaintenanceDate: null, nextMaintenanceDate: null }) 
                : (records[item.id] || { lastMaintenanceKM: 0, conformity: "", serviceExecuted: "", nextMaintenanceKM: 0, id: "", itemId: "" })) as any;
              
              const currentVehicleKM = isChecklistHistory ? (localHistoryKM || vehicle.currentKM || 0) : (vehicle.currentKM || vehicle.odometer || 0);
              const { progressPercent } = calculateProgress(item, record, currentVehicleKM);

              const cell = data.cell;
              const barWidth = cell.width - 8;
              const barHeight = 4;
              const x = cell.x + 4;
              const y = cell.y + cell.height - 6;

              pdf.setFillColor(226, 232, 240);
              pdf.rect(x, y, barWidth, barHeight, "F");

              if (progressPercent > 0) {
                if (progressPercent >= 100) pdf.setFillColor(239, 68, 68);
                else pdf.setFillColor(14, 165, 233);
                const filledWidth = (Math.min(progressPercent, 100) / 100) * barWidth;
                pdf.rect(x, y, filledWidth, barHeight, "F");
              }
              pdf.setTextColor(0, 0, 0);
            }
          },
        });
        
        hasPages = true;
      };

      // Função helper para desenhar Manutenção (OS Automática)
      const drawMaintenancePage = async () => {
        const qOs = query(
          collection(db, "maintenance"),
          where("vehicleId", "==", resolvedVehicleId)
        );
        const snapOs = await getDocs(qOs);
        const orders = snapOs.docs.map(d => ({ id: d.id, ...d.data() } as any));
        
        const targetDateStr = exportConfig.date.split('-').reverse().join('-'); // DD-MM-YYYY

        const os = orders.find(o => {
          // Check by title (DD-MM-YYYY)
          if (o.title && o.title.includes(targetDateStr) && o.title.includes("OS Automática")) return true;

          // Fallback check by createdAt
          const createdAt = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt ? new Date(o.createdAt) : null);
          if (!createdAt) return false;
          if (!o.title?.includes("OS Automática")) return false;

          const y = createdAt.getFullYear();
          const m = String(createdAt.getMonth() + 1).padStart(2, "0");
          const d = String(createdAt.getDate()).padStart(2, "0");
          return `${y}-${m}-${d}` === exportConfig.date;
        });

        if (!os) {
          console.warn(`Não foi encontrada OS Automática para a data ${exportConfig.date}`);
          return;
        }

        let kmAtClosure = os.kmAtClosure || null;
        if (!kmAtClosure && os.title?.startsWith("OS Automática: Checklist ")) {
          try {
            const extractedDate = os.title.replace("OS Automática: Checklist ", "").trim();
            const parts = extractedDate.split('-');
            if (parts.length === 3) {
              const formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
              const q = query(
                collection(db, "checklist_history"),
                where("vehicleId", "==", resolvedVehicleId),
                where("date", "==", formattedDate)
              );
              const snapshot = await getDocs(q);
              if (!snapshot.empty) {
                const docData = snapshot.docs[0].data();
                kmAtClosure = docData.kmAtClosure || docData.vehicleKM || null;
              }
            }
          } catch (e) {
            console.error("Error fetching KM for Maintenance page in Inspections PDF:", e);
          }
        }

        if (hasPages) {
           pdf.addPage();
        }

        const tableData = [];
        let totalItems = 0;
        const isFirestoreId = (str) => typeof str === 'string' && str.length >= 20 && /^[a-zA-Z0-9]+$/.test(str);

        const itemsWithValidTitles = os.inspectionItems?.filter(i => {
          const label = i.itemTitle || i.description || i.title || i.item || (items.find(it => it.id === i.itemId)?.name);
          return label && !isFirestoreId(label);
        }) || [];

        if (itemsWithValidTitles.length > 0) {
          itemsWithValidTitles.forEach((i) => {
            const label = i.itemTitle || i.description || i.title || i.item || (items.find(it => it.id === i.itemId)?.name) || "Item Indefinido";
            tableData.push([label, "Manutenção Solicitada", os.status, ""]);
            totalItems++;
          });
        } else {
          const descItems = os.description?.split('\n') || [os.description];
          descItems.forEach((itemLine) => {
            const trimmed = itemLine.trim();
            if (trimmed !== '' && trimmed !== 'Gerado a partir do checklist diário.' && trimmed !== 'Itens:' && !trimmed.match(/^[a-zA-Z0-9]{20}$/)) {
              let label = trimmed.replace(/^- /, '');
              const matchedItem = items.find(it => it.id === label);
              if (isFirestoreId(label) && matchedItem) {
                label = matchedItem.name;
              }
              tableData.push([label, "Manutenção Solicitada", os.status, ""]);
              totalItems++;
            }
          });
        }

        autoTable(pdf, {
          startY: 55,
          margin: { top: 55, bottom: 20, left: 14, right: 14 },
          head: [["ITEM / SERVIÇO", "CATEGORIA", "STATUS", "OBSERVAÇÕES"]],
          body: tableData,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 4, right: 4, bottom: 4, left: 4 }, valign: "middle" },
          headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: "bold", fontSize: 7, halign: "left", lineColor: [226, 232, 240], lineWidth: 0.1 },
          bodyStyles: { lineColor: [226, 232, 240], lineWidth: 0.1 },
          didDrawPage: function (data) {
            let startY = 15;
            if (finalImgDataUrl) {
              pdf.addImage(finalImgDataUrl, "JPEG", 14, startY, 35, 20);
              pdf.setFontSize(16);
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(0, 0, 0);
              pdf.text(`OS: ${os.plate}`, 54, startY + 8);
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(100, 100, 100);
              pdf.text(`${vehicle.brand} ${vehicle.model}`, 54, startY + 14);
            } else {
              pdf.setFontSize(16);
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(0, 0, 0);
              pdf.text(`OS: ${os.plate}`, 14, startY + 8);
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(100, 100, 100);
              pdf.text(`${vehicle.brand} ${vehicle.model}`, 14, startY + 14);
            }

            pdf.setFontSize(8);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(30, 41, 59);
            pdf.text(`TOTAL ITENS: ${totalItems}`, 14, startY + 22);

            pdf.setFillColor(241, 245, 249);
            const boxHeight = (kmAtClosure !== null && kmAtClosure !== undefined) ? 24 : 20;
            pdf.roundedRect(pageWidth - 94, startY, 80, boxHeight, 2, 2, "F");

            pdf.setFontSize(7);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(100, 116, 139);
            pdf.text("DATA DE CRIAÇÃO", pageWidth - 90, startY + 6);

            pdf.setFontSize(9);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(30, 41, 59);
            
            let cleanDate = new Date(os.createdAt).toLocaleDateString().replace(/(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1");
            if (os.title && os.title.startsWith("OS Automática: Checklist ")) {
              const extractedDate = os.title.replace("OS Automática: Checklist ", "").trim();
              cleanDate = extractedDate.replace(/-/g, "/");
            }
            pdf.text(cleanDate, pageWidth - 90, startY + 11);
            pdf.text(`Prestador: ${os.provider || 'Não informado'}`, pageWidth - 90, startY + 16);

            if (kmAtClosure !== null && kmAtClosure !== undefined) {
              pdf.text(`KM Checklist: ${kmAtClosure.toLocaleString('pt-BR')}`, pageWidth - 90, startY + 21);
            }
          },
        });
        hasPages = true;
      };

      // Execution sequence
      if (exportConfig.inspection) {
        setExportStep("Gerando página de inspeção atual...");
        setExportProgressVal(45);
        await drawInspectionPage(false);
      }
      if (exportConfig.checklist) {
        setExportStep("Gerando página do histórico de checklist...");
        setExportProgressVal(70);
        await drawInspectionPage(true);
      }
      if (exportConfig.maintenance) {
        setExportStep("Gerando página de manutenção (OS)...");
        setExportProgressVal(85);
        await drawMaintenancePage();
      }

      if (!hasPages) {
         setIsExporting(false);
         return;
      }

      setExportStep("Configurando paginação e assinaturas...");
      setExportProgressVal(90);

      // Pagination and Signature
      const totalPages = (pdf as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.setFont("helvetica", "normal");
        pdf.text("ROTA 360 - Gestão de Frota", 14, pageHeight - 10);
        const pageStr = `Pág. ${i}/${totalPages}`;
        pdf.text(pageStr, pageWidth - 14 - pdf.getTextWidth(pageStr), pageHeight - 10);
      }

      pdf.setPage(totalPages);
      const finalY = (pdf as any).lastAutoTable?.finalY || 40;
      let signatureY = finalY + 20;
      let signatureHeight = 40;

      if (signatureY + signatureHeight > pageHeight - 20) {
        pdf.addPage();
        signatureY = 30;
      }

      // Generate digital signature
      const signatureId = await createSignature({
         documentType: 'Relatório Unificado',
         documentTitle: `Inspeção / Manutenção - Veículo ${vehicle.plate}`
      });

      if (signatureId) {
        const verifyUrl = generateVerificationUrl(signatureId);
        const qrCodeDataUrl = await getQRCodeDataUrl(verifyUrl);
        
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(14, signatureY, pageWidth - 28, signatureHeight, 3, 3, "F");
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.1);
        pdf.roundedRect(14, signatureY, pageWidth - 28, signatureHeight, 3, 3, "S");
        
        if (qrCodeDataUrl) pdf.addImage(qrCodeDataUrl, "JPEG", 20, signatureY + 5, 30, 30);
        
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
          pdf.addImage(sealDataUrl, 'PNG', pageWidth - 14 - w - 10, signatureY + 6, w, h, '', 'FAST');
        } catch (sealErr) {
          console.warn("Could not add seal logo to Inspections PDF", sealErr);
        }
      }

      setExportStep("Fazendo download do arquivo...");
      setExportProgressVal(98);

      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = String(today.getFullYear()).slice(-2);
      const dateStr = `${day}.${month}.${year}`;

      pdf.save(`${dateStr}_${vehicle.plate}_UNIFICADO.pdf`);
      setExportProgressVal(100);
      setExportStep("Documento gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      alert("Houve um problema ao gerar o PDF. Se o erro persistir, atualize a página.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileImport = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsReadingFile(true);
    try {
      const fileName = file.name.toLowerCase();
      const extension = fileName.split(".").pop();
      let importedData: { name: string; periodicityKM: number }[] = [];

      if (["xls", "xlsx", "xlsm"].includes(extension || "")) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

        // Skip header (first row)
        const rows = json.slice(1);
        importedData = rows
          .map((row) => {
            if (row && Array.isArray(row) && row.length >= 2) {
              const name = String(row[0] || "").trim();
              const km = String(row[1] || "").trim();
              if (name && km) {
                return {
                  name,
                  periodicityKM: parseKM(km),
                };
              }
            }
            return null;
          })
          .filter(Boolean) as any[];
      }

      if (importedData.length > 0) {
        const text = importedData
          .map((d) => `${d.name} ; ${formatKM(d.periodicityKM)}`)
          .join("\n");
        setImportText((prev) => (prev ? prev + "\n" + text : text));
        setImportError(null);
      } else {
        setImportError(
          "Nenhum dado válido encontrado no arquivo. Use o formato: Nome ; Periodicidade",
        );
      }
    } catch (error: any) {
      console.error("Error reading file:", error);
      setImportError(
        `Erro ao ler o arquivo. Detalhe: ${error.message || "Verifique se o formato está correto."}`,
      );
    } finally {
      setIsReadingFile(true); // Small delay feel
      setTimeout(() => setIsReadingFile(false), 500);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleImportItems = async () => {
    if (!importText.trim()) return;
    setIsSaving(true);
    try {
      const lines = importText.split("\n").filter((l) => l.trim() !== "");
      const batch = writeBatch(db);

      const existingNames = new Set(
        items.map((i) => i.name.toLowerCase().trim()),
      );
      const duplicatesFound: string[] = [];
      const addedNames = new Set<string>();
      let addedCount = 0;

      lines.forEach((line) => {
        // Expected format: Nome do Item ; Periodicidade
        const parts = line.split(";").map((s) => s.trim());
        if (parts.length >= 2) {
          const name = parts[0];
          const periodicityKM = parseKM(parts[1]);
          const normalizedName = name.toLowerCase().trim();

          if (!isNaN(periodicityKM) && periodicityKM > 0) {
            if (
              existingNames.has(normalizedName) ||
              addedNames.has(normalizedName)
            ) {
              if (!duplicatesFound.includes(name)) duplicatesFound.push(name);
            } else {
              const newItemRef = doc(
                collection(db, `inspections/${vehicleId}/items`),
              );
              batch.set(newItemRef, {
                name,
                periodicityKM,
                createdAt: serverTimestamp(),
              });
              // Also create a default record
              const newRecordRef = doc(
                collection(db, `inspections/${vehicleId}/records`),
              );
              const isTimeBased = isTimeBasedUnit("km"); // Bulk import currently defaults to KM
              batch.set(newRecordRef, {
                itemId: newItemRef.id,
                conformity: "SIM",
                serviceExecuted: "NÃO",
                lastMaintenanceKM: 0,
                nextMaintenanceKM: periodicityKM,
                lastMaintenanceDate: isTimeBased
                  ? new Date().toISOString().split("T")[0]
                  : null,
                nextMaintenanceDate: isTimeBased
                  ? calculateNextDate(
                      new Date().toISOString().split("T")[0],
                      "km",
                      periodicityKM,
                    )
                  : null,
                updatedAt: serverTimestamp(),
              });
              addedNames.add(normalizedName);
              addedCount++;
            }
          }
        }
      });

      if (addedCount > 0) {
        await batch.commit();
      }

      setShowImport(false);
      setImportText("");

      if (duplicatesFound.length > 0) {
        alert(
          `Foram identificados ${duplicatesFound.length} itens duplicados. Eles foram ignorados para evitar duplicidade na tabela.\n\nItens ignorados:\n${duplicatesFound.slice(0, 10).join("\n")}${duplicatesFound.length > 10 ? "\n..." : ""}`,
        );
      }
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `inspections/${vehicleId}/items`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewItem = async () => {
    const name = newItemData.name.trim();
    const periodicityKM = parseKM(newItemData.periodicityKM);
    if (!name || isNaN(periodicityKM) || periodicityKM <= 0) {
      alert("Preencha o nome e a periodicidade de forma válida.");
      return;
    }

    if (items.some((i) => i.name.toLowerCase().trim() === name.toLowerCase())) {
      alert(
        `O item "${name}" já existe na tabela. Operação cancelada para evitar duplicidade.`,
      );
      return;
    }

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const newItemRef = doc(collection(db, `inspections/${vehicleId}/items`));
      batch.set(newItemRef, {
        name,
        periodicityKM,
        unit: newItemData.unit || "km",
        createdAt: serverTimestamp(),
      });
      const isTimeBased = isTimeBasedUnit(newItemData.unit);
      const today = new Date().toISOString().split("T")[0];
      const newRecordRef = doc(
        collection(db, `inspections/${vehicleId}/records`),
      );
      batch.set(newRecordRef, {
        itemId: newItemRef.id,
        conformity: "SIM",
        serviceExecuted: "NÃO",
        lastMaintenanceKM: isTimeBased ? 0 : vehicle?.currentKM || 0,
        nextMaintenanceKM: isTimeBased
          ? 0
          : (vehicle?.currentKM || 0) + periodicityKM,
        lastMaintenanceDate: isTimeBased ? today : null,
        nextMaintenanceDate: isTimeBased
          ? calculateNextDate(today, newItemData.unit || "km", periodicityKM)
          : null,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setShowNewItem(false);
      setNewItemData({ name: "", periodicityKM: "", unit: "km" });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `inspections/${vehicleId}/items`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === "asc"
    ) {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(itemSearchText.toLowerCase()),
  );

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (!sortConfig) return 0;
    let aVal: any = a[sortConfig.key as keyof InspectionItem];
    let bVal: any = b[sortConfig.key as keyof InspectionItem];

    // Sort by records fields if requested
    if (
      sortConfig.key === "lastMaintenanceKM" ||
      sortConfig.key === "nextMaintenanceKM" ||
      sortConfig.key === "conformity" ||
      sortConfig.key === "serviceExecuted"
    ) {
      aVal = records[a.id]?.[sortConfig.key as keyof InspectionRecord];
      bVal = records[b.id]?.[sortConfig.key as keyof InspectionRecord];
    }

    if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedItems(newSet);
  };

  const toggleAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map((i) => i.id)));
    }
  };

  const handleBulkDelete = () => {
    setConfirmDelete({ isOpen: true, isBulk: true });
  };

  const handleDeleteItem = (id: string) => {
    setConfirmDelete({ isOpen: true, isBulk: false, itemId: id });
  };

  const executeDelete = async () => {
    const { isBulk, itemId } = confirmDelete;
    setConfirmDelete({ ...confirmDelete, isOpen: false });

    if (isBulk) {
      try {
        const batch = writeBatch(db);
        for (let id of selectedItems) {
          batch.delete(doc(db, `inspections/${resolvedVehicleId}/items`, id));
          if (records[id]) {
            batch.delete(
              doc(
                db,
                `inspections/${resolvedVehicleId}/records`,
                records[id].id,
              ),
            );
          }
        }
        await batch.commit();
        setSelectedItems(new Set());
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.DELETE,
          `inspections/${resolvedVehicleId}/items`,
        );
      }
    } else if (itemId) {
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, `inspections/${resolvedVehicleId}/items`, itemId));
        if (records[itemId]) {
          batch.delete(
            doc(
              db,
              `inspections/${resolvedVehicleId}/records`,
              records[itemId].id,
            ),
          );
        }
        await batch.commit();

        const newSelected = new Set(selectedItems);
        newSelected.delete(itemId);
        setSelectedItems(newSelected);
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.DELETE,
          `inspections/${resolvedVehicleId}/items`,
        );
      }
    }
  };

  const startEditing = (item: InspectionItem) => {
    setEditingItemId(item.id);
    setEditItemData({
      name: item.name,
      periodicityKM: item.periodicityKM,
      unit: item.unit || "km",
    });
  };

  const saveEdit = async (id: string) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, `inspections/${resolvedVehicleId}/items`, id), {
        name: editItemData.name,
        periodicityKM: editItemData.periodicityKM,
        unit: editItemData.unit || "km",
      });
      if (records[id]) {
        // Recompute nextMaintenance
        const isTimeBased = isTimeBasedUnit(editItemData.unit);
        let updates: any = {};
        if (isTimeBased && records[id].lastMaintenanceDate) {
          updates.nextMaintenanceDate = calculateNextDate(
            records[id].lastMaintenanceDate!,
            editItemData.unit,
            editItemData.periodicityKM,
          );
        } else if (!isTimeBased) {
          updates.nextMaintenanceKM =
            records[id].lastMaintenanceKM + editItemData.periodicityKM;
        }
        if (Object.keys(updates).length > 0) {
          batch.update(
            doc(db, `inspections/${resolvedVehicleId}/records`, records[id].id),
            updates,
          );
        }
      }
      await batch.commit();
      setEditingItemId(null);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `inspections/${resolvedVehicleId}/items`,
      );
    }
  };

  const updateRecord = async (
    itemId: string,
    updates: Partial<InspectionRecord>,
  ) => {
    const record = records[itemId];
    if (!record) return;

    try {
      if (
        updates.lastMaintenanceKM !== undefined ||
        updates.lastMaintenanceDate !== undefined
      ) {
        const item = items.find((i) => i.id === itemId);
        if (item) {
          const isTimeBased = isTimeBasedUnit(item.unit);
          const batch = writeBatch(db);

          // Find all items with same periodicityKM and unit
          const matchingItems = items.filter(
            (i) =>
              i.periodicityKM === item.periodicityKM &&
              (i.unit || "km") === (item.unit || "km"),
          );

          // Optimistic state updates
          const newRecordsState = { ...records };

          for (const mItem of matchingItems) {
            const mRecord = records[mItem.id];
            if (mRecord) {
              const mRecRef = doc(
                db,
                `inspections/${resolvedVehicleId}/records`,
                mRecord.id,
              );
              let dbUpdates: any = { updatedAt: serverTimestamp() };

              if (isTimeBased && updates.lastMaintenanceDate !== undefined) {
                const nextDate = calculateNextDate(
                  updates.lastMaintenanceDate,
                  mItem.unit || "km",
                  mItem.periodicityKM,
                );
                newRecordsState[mItem.id] = {
                  ...mRecord,
                  lastMaintenanceDate: updates.lastMaintenanceDate,
                  nextMaintenanceDate: nextDate,
                };
                dbUpdates.lastMaintenanceDate = updates.lastMaintenanceDate;
                dbUpdates.nextMaintenanceDate = nextDate;
              } else if (
                !isTimeBased &&
                updates.lastMaintenanceKM !== undefined
              ) {
                const value = Number(updates.lastMaintenanceKM);
                const nextKM = value + mItem.periodicityKM;
                newRecordsState[mItem.id] = {
                  ...mRecord,
                  lastMaintenanceKM: value,
                  nextMaintenanceKM: nextKM,
                };
                dbUpdates.lastMaintenanceKM = value;
                dbUpdates.nextMaintenanceKM = nextKM;
              }

              batch.update(mRecRef, dbUpdates);
            }
          }

          setRecords(newRecordsState);
          await batch.commit();
          return;
        }
      }

      // Normal single update fallback
      const recRef = doc(
        db,
        `inspections/${resolvedVehicleId}/records`,
        record.id,
      );

      // Calculate nextMaintenanceKM if lastMaintenanceKM changes (fallback if previous block bypassed)
      let nextKM = record.nextMaintenanceKM;
      if (updates.lastMaintenanceKM !== undefined) {
        const item = items.find((i) => i.id === itemId);
        if (item) {
          nextKM = Number(updates.lastMaintenanceKM) + item.periodicityKM;
          updates.nextMaintenanceKM = nextKM;
        }
      }

      // Optimistic update
      setRecords((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], ...updates },
      }));

      await updateDoc(recRef, { ...updates, updatedAt: serverTimestamp() });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `inspections/${resolvedVehicleId}/records`,
      );
    }
  };

  const handleGenerateAutoAlerta = async () => {
    // get items that are >= 90%
    const criticalItems = items.filter(item => {
        const record = records[item.id] || {} as any;
        const { progressPercent } = calculateProgress(item, record, vehicle?.currentKM || 0);
        return progressPercent >= 90;
    });

    if (criticalItems.length === 0) {
        setCustomAlert({ 
          title: "Atenção",
          message: "Nenhum item com progresso >= 90%.",
          type: "info"
        });
        return;
    }

    try {
        setIsGeneratingAlert(true);
        let driverName = "Não definido";
        let driverId = "";
        
        // Find driver assigned to this vehicle
        const driversRef = collection(db, 'drivers');
        const driverSnap = await getDocs(query(driversRef, where('vehicleAssigned', 'array-contains', vehicle?.plate)));
        if (!driverSnap.empty) {
            driverName = driverSnap.docs[0].data().name;
            driverId = driverSnap.docs[0].id;
        }

        const observation = criticalItems.map(i => {
           const record = records[i.id] || {} as any;
           const { progressPercent } = calculateProgress(i, record, vehicle?.currentKM || 0);
           return `- ${i.name} (${Math.round(progressPercent)}%)`;
        }).join('\n');

        const number = `AA-${Math.floor(1000 + Math.random() * 9000)}`;
        await addDoc(collection(db, 'auto_alertas'), {
            number,
            plate: vehicle?.plate || '',
            vehicleId: vehicle?.id || '',
            driverName,
            driverId,
            observation: "Manutenções Preventivas Críticas (>= 90%):\n\n" + observation,
            status: 'pending',
            createdAt: Date.now(),
            resolvedAt: null,
            fromSystem: true,
            creatorName: userData?.signatureInfo?.fullName || user?.displayName || "Sistema",
            creatorEmail: user?.email || "",
        });

        setIsGeneratingAlert(false);
        setCustomAlert({
          title: "AutoAlerta Emitido",
          message: "AutoAlerta gerado com sucesso para este veículo!",
          type: "success"
        });
    } catch (e) {
        console.error("Erro ao gerar auto alerta", e);
        setIsGeneratingAlert(false);
        setCustomAlert({
          title: "Erro",
          message: "Erro ao gerar auto alerta: " + (e as Error).message,
          type: "error"
        });
    }
  };

  if (loadingForm || loadingVehicle) {
    return <div className="p-8 text-center">Carregando formulário...</div>;
  }

  if (!vehicle) {
    return (
      <div className="p-8 text-center text-error flex flex-col items-center justify-center min-h-[40vh]">
        <div className="bg-error-container/30 text-error p-4 rounded-full mb-4">
          <span className="material-symbols-outlined text-4xl">error</span>
        </div>
        <h3 className="text-xl font-bold mb-2">Veículo não encontrado</h3>
        <p className="text-on-surface-variant max-w-md">
          Não foi possível encontrar o veículo selecionado. Verifique se o
          veículo ainda existe na frota (ID procurado:{" "}
          <code className="bg-surface-container px-1 py-0.5 rounded text-xs">
            {vehicleId}
          </code>
          ).
        </p>
        <button
          onClick={onBack}
          className="mt-6 px-6 py-2 bg-primary text-on-primary rounded-lg font-bold shadow-sm hover:opacity-90 transition-all"
        >
          Voltar para Inspeções
        </button>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface dark:bg-surface-container rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-outline-variant/30"
            >
              <div className="px-6 py-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low/50">
                <h3 className="text-lg font-bold text-on-surface">Exportar PDF Unificado</h3>
                <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <p className="text-sm text-on-surface-variant mb-4">Selecione quais documentos deseja incluir no PDF unificado:</p>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant/50 hover:bg-surface-container-low/50 cursor-pointer transition-colors">
                      <input type="checkbox" className="w-5 h-5 rounded border-outline text-primary focus:ring-primary" checked={exportConfig.inspection} onChange={e => setExportConfig({...exportConfig, inspection: e.target.checked})} />
                      <div>
                        <p className="font-semibold text-on-surface text-sm">Inspeção (Estado Atual)</p>
                        <p className="text-xs text-on-surface-variant">O status técnico da frota com base na última auditoria.</p>
                      </div>
                    </label>
                    <label className={`flex items-center gap-3 p-3 rounded-lg border border-outline-variant/50 transition-colors ${!isChecklistAvailable && !isCheckingAvailability ? 'opacity-50 grayscale cursor-not-allowed bg-surface-container-low/20' : 'hover:bg-surface-container-low/50 cursor-pointer'}`}>
                      <input 
                        type="checkbox" 
                        disabled={!isChecklistAvailable && !isCheckingAvailability}
                        className="w-5 h-5 rounded border-outline text-primary focus:ring-primary disabled:opacity-50" 
                        checked={exportConfig.checklist} 
                        onChange={e => setExportConfig({...exportConfig, checklist: e.target.checked})} 
                      />
                      <div>
                        <p className="font-semibold text-on-surface text-sm">Histórico de Checklist</p>
                        <p className="text-xs text-on-surface-variant">
                          {isCheckingAvailability ? 'Verificando disponibilidade...' : (!isChecklistAvailable ? 'Nenhum checklist encontrado para esta data.' : 'O registro diário do checklist realizado numa data específica.')}
                        </p>
                      </div>
                    </label>
                    <label className={`flex items-center gap-3 p-3 rounded-lg border border-outline-variant/50 transition-colors ${!isMaintenanceAvailable && !isCheckingAvailability ? 'opacity-50 grayscale cursor-not-allowed bg-surface-container-low/20' : 'hover:bg-surface-container-low/50 cursor-pointer'}`}>
                      <input 
                        type="checkbox" 
                        disabled={!isMaintenanceAvailable && !isCheckingAvailability}
                        className="w-5 h-5 rounded border-outline text-primary focus:ring-primary disabled:opacity-50" 
                        checked={exportConfig.maintenance} 
                        onChange={e => setExportConfig({...exportConfig, maintenance: e.target.checked})} 
                      />
                      <div>
                        <p className="font-semibold text-on-surface text-sm">Manutenção (OS Automática)</p>
                        <p className="text-xs text-on-surface-variant">
                          {isCheckingAvailability ? 'Verificando disponibilidade...' : (!isMaintenanceAvailable ? 'Nenhuma OS automática encontrada para esta data.' : 'A OS automática vinculada ao checklist selecionado.')}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">Data de Referência (Checklist/OS)</label>
                    <div className="relative">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={manualDateInput}
                          onChange={(e) => handleManualDateChange(e.target.value)}
                          placeholder="DD/MM/AAAA"
                          className="w-full bg-surface-container-lowest dark:bg-surface-variant/30 border border-outline-variant dark:border-outline/50 rounded-lg pl-11 pr-10 py-3 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                        />
                        <span className="absolute left-4 material-symbols-outlined text-[20px] text-primary pointer-events-none">calendar_today</span>
                        <button
                          type="button"
                          onClick={() => setShowDatePicker(!showDatePicker)}
                          className="absolute right-2 p-1.5 hover:bg-surface-container-high rounded-full text-on-surface-variant transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px]" style={{ transform: showDatePicker ? 'rotate(180deg)' : 'rotate(0)' }}>
                            expand_more
                          </span>
                        </button>
                      </div>

                      {showDatePicker && (
                        <div className="absolute right-0 left-0 z-[60] bottom-full mb-2 bg-white dark:bg-surface-container border border-outline-variant rounded-xl shadow-xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-150">
                          <div className="flex items-center justify-between mb-4">
                            <button
                              type="button"
                              onClick={() => {
                                const newDate = new Date(pickerDate);
                                newDate.setMonth(newDate.getMonth() - 1);
                                setPickerDate(newDate);
                              }}
                              className="p-1.5 hover:bg-surface-container-high rounded-lg text-on-surface-variant transition-colors"
                            >
                              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                            </button>
                            <span className="font-bold text-on-surface text-sm">
                              {pickerDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const newDate = new Date(pickerDate);
                                newDate.setMonth(newDate.getMonth() + 1);
                                setPickerDate(newDate);
                              }}
                              className="p-1.5 hover:bg-surface-container-high rounded-lg text-on-surface-variant transition-colors"
                            >
                              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-7 gap-1 text-center mb-2">
                            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                              <span key={i} className="text-xs font-semibold text-on-surface-variant/60">{day}</span>
                            ))}
                          </div>

                          <div className="grid grid-cols-7 gap-1">
                            {(() => {
                              const year = pickerDate.getFullYear();
                              const month = pickerDate.getMonth();
                              const daysInMonth = new Date(year, month + 1, 0).getDate();
                              const firstDayIndex = new Date(year, month, 1).getDay();
                              
                              const cells = [];
                              // Empty cells for prior month
                              for (let i = 0; i < firstDayIndex; i++) {
                                cells.push(<div key={`empty-${i}`} />);
                              }
                              
                              // Days of current month
                              const currentSelectedDateStr = exportConfig.date;
                              for (let day = 1; day <= daysInMonth; day++) {
                                const dayStr = String(day).padStart(2, '0');
                                const monthStr = String(month + 1).padStart(2, '0');
                                const fullDateStr = `${year}-${monthStr}-${dayStr}`;
                                const isSelected = fullDateStr === currentSelectedDateStr;
                                const isToday = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}` === fullDateStr;
                                
                                cells.push(
                                  <button
                                    key={day}
                                    type="button"
                                    onClick={() => {
                                      setExportConfig({ ...exportConfig, date: fullDateStr });
                                      setManualDateInput(`${dayStr}/${monthStr}/${year}`);
                                      setShowDatePicker(false);
                                    }}
                                    className={`h-8 w-8 text-xs font-bold rounded-lg flex items-center justify-center transition-all ${
                                      isSelected 
                                        ? 'bg-primary text-on-primary shadow-sm shadow-primary/30' 
                                        : isToday 
                                          ? 'border border-primary text-primary hover:bg-primary-container/20' 
                                          : 'text-on-surface hover:bg-surface-container-high'
                                    }`}
                                  >
                                    {day}
                                  </button>
                                );
                              }
                              return cells;
                            })()}
                          </div>
                          
                          <div className="mt-3 pt-3 border-t border-outline-variant/30 flex justify-between">
                            <button
                              type="button"
                              onClick={() => {
                                const now = new Date();
                                const year = now.getFullYear();
                                const month = String(now.getMonth() + 1).padStart(2, '0');
                                const day = String(now.getDate()).padStart(2, '0');
                                const todayStr = `${year}-${month}-${day}`;
                                
                                setExportConfig({ ...exportConfig, date: todayStr });
                                setManualDateInput(`${day}/${month}/${year}`);
                                setPickerDate(new Date());
                                setShowDatePicker(false);
                              }}
                              className="text-xs font-bold text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors"
                            >
                              Hoje
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowDatePicker(false)}
                              className="text-xs font-bold text-on-surface-variant hover:bg-surface-container-high px-2 py-1 rounded-lg transition-colors"
                            >
                              Fechar
                            </button>
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              </div>
              <div className="p-4 bg-surface-container-low border-t border-outline-variant/30 flex justify-end gap-3">
                <button onClick={() => setShowExportModal(false)} className="px-5 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-all">
                  Cancelar
                </button>
                <button onClick={confirmExportUnifiedPDF} disabled={isExporting || (!exportConfig.inspection && !exportConfig.checklist && !exportConfig.maintenance)} className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold shadow-sm hover:shadow hover:opacity-90 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                  {isExporting ? "Gerando..." : "Exportar PDF"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Indicador de progresso estilizado para exportação de PDF */}
      <AnimatePresence>
        {isExporting && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface dark:bg-surface-container rounded-2xl p-6 shadow-2xl max-w-sm w-full border border-outline-variant/30 text-center space-y-4"
            >
              <div className="flex justify-center">
                <div className="relative flex items-center justify-center">
                  {/* Spinner Animado Circular de Progresso */}
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="transparent"
                      className="text-surface-container-high dark:text-surface-container-low"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="transparent"
                      strokeDasharray={2 * Math.PI * 34}
                      strokeDashoffset={2 * Math.PI * 34 * (1 - exportProgressVal / 100)}
                      className="text-primary transition-all duration-300 ease-out"
                    />
                  </svg>
                  <span className="absolute text-sm font-bold text-on-surface">
                    {exportProgressVal}%
                  </span>
                </div>
              </div>
              
              <div className="space-y-1">
                <h4 className="text-base font-bold text-on-surface">Gerando Relatório Unificado</h4>
                <p className="text-xs text-on-surface-variant animate-pulse font-medium">
                  {exportStep || "Processando documentos..."}
                </p>
              </div>
              
              {/* Barra de Progresso Horizontal */}
              <div className="w-full bg-surface-container-high dark:bg-surface-container-low rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className="bg-primary h-full rounded-full"
                  animate={{ width: `${exportProgressVal}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div className="space-y-6" id="inspection-print-container">
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
      <div className="flex flex-col md:flex-row justify-between md:items-center bg-surface-container-low dark:bg-surface-variant/20 p-6 rounded-2xl border border-outline-variant dark:border-outline/50 gap-6 dark:glass-panel">
        <div className="flex items-center gap-5">
          <button
            onClick={onBack}
            data-html2canvas-ignore="true"
            className="p-2 hover:bg-surface-container dark:hover:bg-surface-container-high rounded-full transition-colors flex-shrink-0 text-on-surface"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>

          <div className="w-16 h-16 rounded-xl overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] flex-shrink-0 bg-white border border-outline-variant dark:border-outline/50">
            <img
              className="w-full h-full object-contain p-1"
              src={
                vehicleImgDataUrl ||
                vehicle.imageUrl ||
                "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800"
              }
              alt={vehicle.model}
            />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-on-surface">
              Inspeção:{" "}
              <button
                onClick={() => onPlateClick(vehicle)}
                className="text-primary dark:neon-text-primary tracking-wide hover:underline decoration-2 underline-offset-4 transition-all"
              >
                <PrivateValue value={vehicle.plate} />
              </button>
            </h2>
            <p className="text-on-surface-variant font-medium text-sm mt-0.5">
              {vehicle.brand} {vehicle.model}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-surface-container-lowest dark:bg-surface-container-high p-4 rounded-xl border border-outline-variant dark:border-outline/50 shadow-sm w-full md:w-auto">
          <div className="w-full">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block">
                Km Atual
              </label>
              {(vehicle.lastSyncCheck || vehicle.lastKmUpdate || vehicle.updatedAt) && (
                <span
                  className="text-[10px] text-on-surface-variant/70 italic flex items-center gap-1"
                  title="Última atualização via telemetria"
                >
                  <span className="material-symbols-outlined text-[12px]">
                    sync
                  </span>
                  {new Date(vehicle.lastSyncCheck || vehicle.lastKmUpdate || vehicle.updatedAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={formatKM(currentKM)}
                onChange={(e) => setCurrentKM(parseKM(e.target.value))}
                className="w-full md:w-32 bg-white dark:bg-surface-variant/30 border border-outline-variant dark:border-outline/50 rounded-lg px-3 py-1.5 font-mono text-sm focus:ring-2 focus:ring-primary dark:focus:ring-primary outline-none text-on-surface"
              />
              <button
                onClick={() => {
                  if (!isAdmin) return;
                  handleUpdateKM();
                }}
                data-html2canvas-ignore="true"
                disabled={!isAdmin || isUpdatingKM || currentKM === vehicle.currentKM}
                className={`bg-primary/10 dark:bg-primary/20 text-primary dark:neon-text-primary hover:bg-primary/20 dark:hover:bg-primary/30 p-2 rounded-lg transition-colors disabled:opacity-50 disabled:bg-surface-container dark:disabled:bg-surface-variant disabled:text-on-surface-variant flex-shrink-0 ${!isAdmin ? 'cursor-not-allowed' : ''}`}
                title={isAdmin ? "Salvar KM Atual" : "Apenas administradores"}
              >
                <span className="material-symbols-outlined text-[20px]">
                  save
                </span>
              </button>
              <button
                onClick={() => {
                   if (!isAdmin) return;
                   window.dispatchEvent(new CustomEvent('MANUAL_KM_SYNC', { detail: { vehicleId: vehicle.id, plate: vehicle.plate } }));
                }}
                data-html2canvas-ignore="true"
                disabled={!isAdmin}
                className={`bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-foreground hover:bg-primary/20 dark:hover:bg-primary/30 p-2 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed`}
                title={isAdmin ? "Sincronizar GPS Agora" : "Apenas administradores"}
              >
                <span className="material-symbols-outlined text-[20px]">
                  satellite_alt
                </span>
              </button>
            </div>
          </div>
          <div className="w-full pt-4 flex gap-4 border-t border-outline-variant dark:border-outline/50">
            <div className="flex-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">Data Checklist</label>
                <input type="date" value={checklistDate} onChange={(e) => setChecklistDate(e.target.value)} className="w-full bg-surface-container-lowest dark:bg-surface-variant/30 border border-outline-variant dark:border-outline/50 rounded-lg px-3 py-1.5 text-sm text-on-surface pointer-events-auto [color-scheme:light] dark:[color-scheme:dark]" />
            </div>
            <div className="flex-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">KM Checklist</label>
                <input type="text" readOnly value={historyKM ? historyKM.toLocaleString('pt-BR') : ''} className="w-full bg-surface-container-lowest dark:bg-surface-variant/30 border border-outline-variant dark:border-outline/50 rounded-lg px-3 py-1.5 text-sm font-mono text-on-surface" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <h3 className="text-[20px] font-bold text-on-surface flex items-center gap-2">
          Itens de Inspeção
          <span className="text-[12px] font-bold bg-surface-container-high dark:bg-surface-variant/50 px-2 py-0.5 rounded-full text-on-surface-variant flex items-center justify-center min-w-[24px]">
            {filteredItems.length}
          </span>
        </h3>
        <div
          className="flex flex-wrap items-center gap-2 w-full md:w-auto"
          data-html2canvas-ignore="true"
        >
          <button
            onClick={handleGenerateAutoAlerta}
            disabled={isGeneratingAlert}
            className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-2 border border-outline-variant dark:border-outline/50 bg-surface-container-low dark:bg-surface-variant/30 text-on-surface hover:bg-surface-container-high dark:hover:bg-surface-variant/50 rounded-lg font-bold shadow-sm transition-all text-sm text-primary dark:neon-text-primary relative overflow-hidden"
          >
            {isGeneratingAlert && (
              <div className="absolute inset-0 bg-primary/10">
                <div className="h-full bg-primary/20 animate-pulse w-full max-w-[100%] transition-all origin-left"></div>
              </div>
            )}
            <span className="material-symbols-outlined text-[18px]">
              {isGeneratingAlert ? 'hourglass_empty' : 'campaign'}
            </span>
            {isGeneratingAlert ? 'Gerando...' : 'Gerar AutoAlerta'}
          </button>
          <button
            onClick={exportToPDF}
            disabled={isExporting}
            className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-2 border border-outline-variant dark:border-outline/50 bg-surface-container-low dark:bg-surface-variant/30 text-on-surface hover:bg-surface-container-high dark:hover:bg-surface-variant/50 rounded-lg font-bold shadow-sm transition-all text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">
              picture_as_pdf
            </span>
            {isExporting ? "Processando..." : "Exportar PDF"}
          </button>
          {selectedItems.size > 0 && isAdmin && (
            <button
              onClick={handleBulkDelete}
              className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-2 bg-error dark:bg-error-container text-onError dark:text-error rounded-lg font-bold shadow-sm hover:opacity-90 transition-all text-sm border dark:border-error/30"
            >
              <span className="material-symbols-outlined text-[18px]">
                delete
              </span>
              Excluir ({selectedItems.size})
            </button>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => setShowImport(true)}
                className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-2 border border-outline-variant text-on-surface-variant hover:text-on-surface rounded-lg font-bold shadow-sm hover:bg-surface-container-low transition-all text-sm"
              >
                <span className="material-symbols-outlined text-[18px]">
                  publish
                </span>
                Importar
              </button>
              <button
                onClick={() => setShowNewItem(true)}
                className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold shadow-sm hover:opacity-90 transition-all text-sm"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Novo Item
              </button>
            </>
          )}
        </div>
      </div>

      {showNewItem && (
        <div
          className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm mb-6 animate-in fade-in slide-in-from-top-2"
          data-html2canvas-ignore="true"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-on-surface">Cadastrar Novo Item</h3>
            <button
              onClick={() => setShowNewItem(false)}
              className="text-on-surface-variant hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="col-span-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">
                Nome do Item
              </label>
              <input
                type="text"
                value={newItemData.name}
                onChange={(e) =>
                  setNewItemData({ ...newItemData, name: e.target.value })
                }
                placeholder="Ex: Troca de Óleo"
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">
                Periodicidade
              </label>
              <input
                type="text"
                value={
                  newItemData.periodicityKM
                    ? formatKM(parseKM(newItemData.periodicityKM))
                    : ""
                }
                onChange={(e) => {
                  const parsed = parseKM(e.target.value);
                  setNewItemData({
                    ...newItemData,
                    periodicityKM: parsed > 0 ? String(parsed) : "",
                  });
                }}
                placeholder="Ex: 10.000"
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1 block">
                Unidade
              </label>
              <select
                value={newItemData.unit}
                onChange={(e) =>
                  setNewItemData({ ...newItemData, unit: e.target.value })
                }
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="km">km</option>
                <option value="dias">dias</option>
                <option value="diário">diário</option>
                <option value="meses">meses</option>
                <option value="mensal">mensal</option>
                <option value="anos">anos</option>
                <option value="anual">anual</option>
                <option value="horas">horas</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
            <button
              onClick={() => setShowNewItem(false)}
              className="px-6 py-2 text-on-surface-variant font-bold hover:bg-surface-container-low rounded-lg transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateNewItem}
              disabled={
                isSaving ||
                !newItemData.name.trim() ||
                !newItemData.periodicityKM.trim()
              }
              className="px-6 py-2 bg-primary text-on-primary rounded-lg font-bold shadow-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? "Salvando..." : "Salvar Item"}
            </button>
          </div>
        </div>
      )}

      {showImport && (
        <div
          className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm mb-6 animate-in fade-in slide-in-from-top-2"
          data-html2canvas-ignore="true"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-on-surface">
              Importar Itens e Periodicidade
            </h3>
            <button
              onClick={() => {
                setShowImport(false);
                setImportError(null);
              }}
              className="text-on-surface-variant hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {importError && (
            <div className="mb-4 p-3 bg-error-container/30 text-error text-xs rounded-lg flex items-center gap-2 border border-error/20">
              <span className="material-symbols-outlined text-[18px]">
                error
              </span>
              {importError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                Opção 1: Arquivo (Excel)
              </p>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-outline-variant rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-surface-container-low hover:border-primary transition-all group"
              >
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-[28px]">
                    upload_file
                  </span>
                </div>
                <p className="text-sm font-bold text-on-surface mb-1">
                  Clique para selecionar
                </p>
                <p className="text-[11px] text-on-surface-variant text-center">
                  Planilhas (.xls, .xlsx, .xlsm)
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileImport}
                  className="hidden"
                  accept=".xls, .xlsx, .xlsm"
                />
              </div>
              {isReadingFile && (
                <div className="mt-2 flex items-center gap-2 text-primary font-bold text-xs animate-pulse">
                  <span className="material-symbols-outlined text-[16px] spin">
                    sync
                  </span>
                  Processando arquivo...
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                Opção 2: Entrada Manual
              </p>
              <p className="text-[11px] text-on-surface-variant mb-2 italic">
                Cole ou digite os dados abaixo seguindo o padrão:
              </p>
              <p className="text-[11px] font-mono text-primary font-bold mb-2 bg-primary/5 p-2 rounded">
                Nome do Item ; Periodicidade (ex: Filtro de Óleo ; 10.000)
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Exemplo:&#10;Troca de Óleo ; 10.000&#10;Filtro de Ar ; 5.000"
                className="w-full h-32 bg-surface-container-low border border-outline-variant rounded-xl p-3 text-sm text-on-surface resize-none focus:ring-2 focus:ring-primary outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
            <button
              onClick={() => {
                setShowImport(false);
                setImportError(null);
              }}
              className="px-6 py-2 text-on-surface-variant font-bold hover:bg-surface-container-low rounded-lg transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleImportItems}
              disabled={isSaving || !importText.trim()}
              className="px-6 py-2 bg-primary text-on-primary rounded-lg font-bold shadow-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? "Importando..." : "Confirmar Importação"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden dark:glass-panel dark:border-outline">
        {/* Custom Confirm Delete Modal */}
        {confirmDelete.isOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            data-html2canvas-ignore="true"
          >
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant p-6 max-w-sm w-full animate-in zoom-in-95 fade-in duration-200">
              <div className="flex items-center gap-3 text-error mb-4">
                <span className="material-symbols-outlined text-[32px]">
                  warning
                </span>
                <h4 className="text-xl font-bold">Confirmar Exclusão</h4>
              </div>
              <p className="text-on-surface-variant mb-6">
                {confirmDelete.isBulk
                  ? `Tem certeza que deseja excluir os ${selectedItems.size} itens selecionados? Esta ação não pode ser desfeita.`
                  : "Tem certeza que deseja excluir este item de inspeção? Esta ação não pode ser desfeita."}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() =>
                    setConfirmDelete({ ...confirmDelete, isOpen: false })
                  }
                  className="px-4 py-2 text-on-surface-variant font-bold hover:bg-surface-container rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={executeDelete}
                  className="px-4 py-2 bg-error text-onError rounded-lg font-bold shadow-sm hover:opacity-90 transition-all"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* List Toolbar / Filter */}
        <div
          className="p-4 border-b border-outline-variant dark:border-outline/50 flex flex-col md:flex-row items-center justify-between gap-4 bg-surface-container-low/30 dark:bg-surface-variant/30"
          data-html2canvas-ignore="true"
        >
          <div className="relative w-full md:w-80 group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 group-focus-within:text-primary dark:group-focus-within:text-primary transition-colors text-[20px]">
              search
            </span>
            <input
              type="text"
              placeholder="Filtrar itens..."
              value={itemSearchText}
              onChange={(e) => setItemSearchText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-surface border border-outline-variant dark:border-outline rounded-lg focus:ring-2 focus:ring-primary dark:focus:ring-primary focus:border-primary dark:focus:border-primary outline-none transition-all text-sm text-on-surface"
            />
          </div>
          {itemSearchText && (
            <button
              onClick={() => setItemSearchText("")}
              className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors uppercase tracking-widest px-3 py-1.5 rounded-full hover:bg-surface-container-low"
            >
              Limpar Filtros
              <span className="material-symbols-outlined text-[14px]">
                close
              </span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)] w-full scrollbar-thin scrollbar-thumb-outline-variant scrollbar-track-transparent">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="sticky top-0 z-20 shadow-sm border-b border-outline-variant dark:border-outline/50 bg-surface-container-low/50 dark:bg-surface-variant/50 backdrop-blur-md">
              <tr>
                {isAdmin && (
                  <th
                    className="p-4 w-12 text-center border-r border-outline-variant/30 dark:border-outline/50"
                    data-html2canvas-ignore="true"
                  >
                    <input
                      type="checkbox"
                      onChange={toggleAll}
                      checked={
                        items.length > 0 && selectedItems.size === items.length
                      }
                      className="rounded cursor-pointer"
                    />
                  </th>
                )}
                <th
                  className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider cursor-pointer select-none hover:bg-surface-container-low transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    Item{" "}
                    {sortConfig?.key === "name" ? (
                      <span className="material-symbols-outlined text-[14px]">
                        {sortConfig.direction === "asc"
                          ? "arrow_upward"
                          : "arrow_downward"}
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-50">
                        unfold_more
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider cursor-pointer select-none hover:bg-surface-container-low transition-colors"
                  onClick={() => handleSort("conformity")}
                >
                  <div className="flex items-center gap-1">
                    Ações Conformidade{" "}
                    {sortConfig?.key === "conformity" ? (
                      <span className="material-symbols-outlined text-[14px]">
                        {sortConfig.direction === "asc"
                          ? "arrow_upward"
                          : "arrow_downward"}
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-50">
                        unfold_more
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider cursor-pointer select-none hover:bg-surface-container-low transition-colors"
                  onClick={() => handleSort("serviceExecuted")}
                >
                  <div className="flex items-center gap-1">
                    Serviço Executado{" "}
                    {sortConfig?.key === "serviceExecuted" ? (
                      <span className="material-symbols-outlined text-[14px]">
                        {sortConfig.direction === "asc"
                          ? "arrow_upward"
                          : "arrow_downward"}
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-50">
                        unfold_more
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider cursor-pointer select-none hover:bg-surface-container-low transition-colors"
                  onClick={() => handleSort("lastMaintenanceKM")}
                >
                  <div className="flex items-center gap-1">
                    Última Manut. (KM){" "}
                    {sortConfig?.key === "lastMaintenanceKM" ? (
                      <span className="material-symbols-outlined text-[14px]">
                        {sortConfig.direction === "asc"
                          ? "arrow_upward"
                          : "arrow_downward"}
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-50">
                        unfold_more
                      </span>
                    )}
                  </div>
                </th>
                <th
                  className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider cursor-pointer select-none hover:bg-surface-container-low transition-colors min-w-[170px]"
                  onClick={() => handleSort("nextMaintenanceKM")}
                >
                  <div className="flex items-center gap-1">
                    Progresso{" "}
                    {sortConfig?.key === "nextMaintenanceKM" ? (
                      <span className="material-symbols-outlined text-[14px]">
                        {sortConfig.direction === "asc"
                          ? "arrow_upward"
                          : "arrow_downward"}
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-50">
                        unfold_more
                      </span>
                    )}
                  </div>
                </th>
                {isAdmin && (
                  <th
                    className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider text-center border-l border-outline-variant/30"
                    data-html2canvas-ignore="true"
                  >
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {sortedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-8 text-center text-on-surface-variant"
                  >
                    Nenhum item importado para este veículo.
                  </td>
                </tr>
              ) : (
                sortedItems.map((item) => {
                  const record = records[item.id];
                  if (!record) return null;

                  const currentVehicleKM =
                    vehicle.currentKM || vehicle.odometer || 0;
                  const {
                    progressPercent,
                    remainingNumber,
                    isOutdated,
                    descRemaining,
                  } = calculateProgress(item, record, currentVehicleKM);

                  let progressColor = "bg-primary dark:shadow-[0_0_12px_rgba(20,184,166,0.6)]";
                  if (progressPercent > 80) progressColor = "bg-tertiary dark:shadow-[0_0_12px_rgba(245,158,11,0.6)]";
                  if (progressPercent >= 100) progressColor = "bg-error dark:shadow-[0_0_12px_rgba(244,63,94,0.6)]";

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors border-b border-outline-variant/50 dark:border-outline/50 ${selectedItems.has(item.id) ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-surface-container-low/30 dark:hover:bg-surface-variant/20"}`}
                    >
                      {isAdmin && (
                        <td
                          className="p-4 text-center border-r border-outline-variant/30"
                          data-html2canvas-ignore="true"
                        >
                          <input
                            type="checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={() => toggleSelection(item.id)}
                            className="rounded cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="p-4">
                        {editingItemId === item.id ? (
                          <div className="flex flex-col gap-2">
                            <input
                              type="text"
                              value={editItemData.name}
                              onChange={(e) =>
                                setEditItemData({
                                  ...editItemData,
                                  name: e.target.value,
                                })
                              }
                              className="border border-outline-variant rounded px-2 py-1 text-sm bg-surface-container-lowest outline-none focus:ring-1 focus:ring-primary"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={formatKM(editItemData.periodicityKM)}
                                onChange={(e) =>
                                  setEditItemData({
                                    ...editItemData,
                                    periodicityKM: parseKM(e.target.value),
                                  })
                                }
                                className="border border-outline-variant rounded px-2 py-1 text-sm w-24 bg-surface-container-lowest font-mono outline-none focus:ring-1 focus:ring-primary"
                              />
                              <select
                                value={editItemData.unit}
                                onChange={(e) =>
                                  setEditItemData({
                                    ...editItemData,
                                    unit: e.target.value,
                                  })
                                }
                                className="border border-outline-variant rounded px-2 py-1 text-sm bg-surface-container-lowest outline-none focus:ring-1 focus:ring-primary"
                              >
                                <option value="km">km</option>
                                <option value="dias">dias</option>
                                <option value="diário">diário</option>
                                <option value="meses">meses</option>
                                <option value="mensal">mensal</option>
                                <option value="anos">anos</option>
                                <option value="anual">anual</option>
                                <option value="horas">horas</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <button
                                onClick={() => saveEdit(item.id)}
                                className="text-success hover:bg-success/10 p-1 rounded"
                                title="Salvar"
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  check
                                </span>
                              </button>
                              <button
                                onClick={() => setEditingItemId(null)}
                                className="text-error hover:bg-error/10 p-1 rounded"
                                title="Cancelar"
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  close
                                </span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-semibold text-on-surface text-sm">
                              {item.name}
                            </div>
                            <div className="text-xs text-on-surface-variant mt-0.5 font-mono">
                              Periodicidade: {formatKM(item.periodicityKM)}{" "}
                              {item.unit || "km"}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <select
                          value={record.conformity}
                          onChange={(e) => {
                            if (!isAdmin) return;
                            updateRecord(item.id, {
                              conformity: e.target.value as any,
                            });
                          }}
                          disabled={!isAdmin}
                          className={`text-sm px-2 py-1 rounded border outline-none dark:bg-surface-variant/30 ${isAdmin ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'} ${
                            record.conformity === "SIM"
                              ? "bg-success-container/30 border-success/30 text-success dark:border-success/50 dark:text-emerald-400 font-semibold"
                              : record.conformity === "NÃO"
                                ? "bg-error-container/30 border-error/30 text-error dark:border-error/50 dark:text-red-400 font-semibold"
                                : "bg-surface-container border-outline-variant text-on-surface-variant dark:border-outline/50 dark:text-on-surface-variant"
                          }`}
                        >
                          <option value="SIM">SIM</option>
                          <option value="NÃO">NÃO</option>
                          <option value="NA">NA</option>
                        </select>
                      </td>
                      <td className="p-4">
                        <select
                          value={["SIM", "NÃO", "NaKM"].includes(checklistDate ? isServiceExecuted(item.id) : (record.serviceExecuted || "NÃO")) ? (checklistDate ? isServiceExecuted(item.id) : (record.serviceExecuted || "NÃO")) : "NÃO"}
                          onChange={(e) => {
                            if (!isAdmin) return;
                            updateRecord(item.id, {
                              serviceExecuted: e.target.value as any,
                            });
                          }}
                          disabled={!isAdmin || !!checklistDate}
                          className={`text-sm px-2 py-1 rounded border outline-none dark:bg-surface-variant/30 ${isAdmin && !checklistDate ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'} ${
                            (["SIM", "NÃO", "NaKM"].includes(checklistDate ? isServiceExecuted(item.id) : (record.serviceExecuted || "NÃO")) ? (checklistDate ? isServiceExecuted(item.id) : (record.serviceExecuted || "NÃO")) : "NÃO") === "SIM"
                              ? "bg-primary-container text-on-primary-container border-primary-container dark:border-primary/50 dark:text-emerald-400 font-semibold"
                              : (["SIM", "NÃO", "NaKM"].includes(checklistDate ? isServiceExecuted(item.id) : (record.serviceExecuted || "NÃO")) ? (checklistDate ? isServiceExecuted(item.id) : (record.serviceExecuted || "NÃO")) : "NÃO") === "NaKM"
                                ? "bg-warning-container/50 text-warning-dark border-warning/50 dark:text-amber-400 font-semibold"
                                : "bg-surface-container border-outline-variant text-on-surface-variant dark:border-outline/50 dark:text-on-surface-variant"
                          }`}
                        >
                          <option value="SIM">SIM</option>
                          <option value="NÃO">NÃO</option>
                          <option value="NaKM">NaKM</option>
                        </select>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter opacity-70 mb-0.5">
                            {isTimeBasedUnit(item.unit)
                              ? "Data Informada"
                              : "KM Informado"}
                          </div>
                          {isTimeBasedUnit(item.unit) ? (
                            <input
                              type="date"
                              value={record.lastMaintenanceDate || ""}
                              onChange={(e) => {
                                if (!isAdmin) return;
                                updateRecord(item.id, {
                                  lastMaintenanceDate: e.target.value,
                                });
                              }}
                              disabled={!isAdmin}
                              className={`w-[125px] bg-surface-container-low dark:bg-surface-variant/30 border border-outline-variant dark:border-outline/50 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none pointer-events-auto [color-scheme:light] dark:[color-scheme:dark] text-on-surface ${!isAdmin ? 'opacity-70 cursor-not-allowed' : ''}`}
                            />
                          ) : (
                            <input
                              type="text"
                              value={formatKM(record.lastMaintenanceKM)}
                              onChange={(e) => {
                                if (!isAdmin) return;
                                updateRecord(item.id, {
                                  lastMaintenanceKM: parseKM(e.target.value),
                                });
                              }}
                              disabled={!isAdmin}
                              className={`w-24 bg-white dark:bg-surface-variant/30 border border-outline-variant dark:border-outline/50 rounded px-2 py-1 text-sm font-mono focus:ring-1 focus:ring-primary outline-none text-on-surface ${!isAdmin ? 'opacity-70 cursor-not-allowed' : ''}`}
                              placeholder="KM"
                            />
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col mb-1.5 justify-between gap-1 items-start">
                          <div className="flex justify-between w-full text-xs font-bold font-mono">
                            <span
                              className={
                                progressPercent >= 100
                                  ? "text-error"
                                  : "text-on-surface-variant"
                              }
                            >
                              Próx:{" "}
                              {isTimeBasedUnit(item.unit)
                                ? record.nextMaintenanceDate
                                  ? new Date(
                                      record.nextMaintenanceDate + "T12:00:00",
                                    ).toLocaleDateString("pt-BR")
                                  : "-"
                                : formatKM(record.nextMaintenanceKM)}
                            </span>
                            <span
                              className={
                                progressPercent >= 100
                                  ? "text-error"
                                  : "text-primary"
                              }
                            >
                              {Math.round(progressPercent)}%
                            </span>
                          </div>
                          <div className="w-full bg-surface-container-high dark:bg-surface-variant/50 rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-full ${progressColor} transition-all duration-500`}
                              style={{ width: `${progressPercent}%` }}
                            ></div>
                          </div>

                          <div className="flex justify-between w-full mt-1 items-center">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-tight ${isOutdated ? "text-error" : remainingNumber <= 1000 && !isTimeBasedUnit(item.unit) ? "text-warning" : remainingNumber <= 7 && isTimeBasedUnit(item.unit) ? "text-warning" : "text-on-surface-variant/60"}`}
                            >
                              {descRemaining}
                            </span>
                          </div>
                        </div>
                      </td>
                      {isAdmin && (
                        <td
                          className="p-4 border-l border-outline-variant/30"
                          data-html2canvas-ignore="true"
                        >
                          <div className="flex items-center gap-2 justify-center">
                            <button
                              onClick={() => startEditing(item)}
                              className="p-1 text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container rounded-lg flex items-center"
                              title="Editar"
                            >
                              <span className="material-symbols-outlined text-[20px]">
                                edit
                              </span>
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1 text-on-surface-variant hover:text-error transition-colors hover:bg-surface-container rounded-lg flex items-center"
                              title="Excluir"
                            >
                              <span className="material-symbols-outlined text-[20px]">
                                delete
                              </span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </>
  );
}

const VehicleInspectionCard: React.FC<{ vehicle: any; onClick: () => any; onPlateClick: (e: React.MouseEvent) => void }> = ({
  vehicle,
  onClick,
  onPlateClick
}) => {
  const [expiredCount, setExpiredCount] = useState<number | null>(null);

  useEffect(() => {
    const qRecords = query(collection(db, `inspections/${vehicle.id}/records`));
    const qItems = query(collection(db, `inspections/${vehicle.id}/items`));

    const fetchData = async () => {
      try {
        const [itemsSnap, recordsSnap] = await Promise.all([
          getDocs(qItems),
          getDocs(qRecords),
        ]);

        const itemsMap: Record<string, InspectionItem> = {};
        itemsSnap.docs.forEach((d) => {
          itemsMap[d.id] = { id: d.id, ...d.data() } as InspectionItem;
        });

        let count = 0;
        recordsSnap.docs.forEach((d) => {
          const record = { id: d.id, ...d.data() } as InspectionRecord;
          const item = itemsMap[record.itemId];
          if (item) {
            const { isOutdated } = calculateProgress(
              item,
              record,
              vehicle.currentKM || 0,
            );
            if (isOutdated) count++;
          }
        });
        setExpiredCount(count);
      } catch (e) {
        console.error("Error fetching card summary:", e);
      }
    };

    fetchData();
  }, [vehicle.id, vehicle.currentKM]);

  return (
    <motion.div
      layout
      onClick={onClick}
      className="!bg-white dark:!bg-white border border-outline-variant rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
    >
      <div className="relative h-44 overflow-hidden bg-white flex items-center justify-center p-4 border-b border-outline-variant/30">
        <img
          className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
          src={
            vehicle.imageUrl ||
            "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800"
          }
          alt={vehicle.model}
        />
        {expiredCount !== null && expiredCount > 0 && (
          <div className="absolute top-3 right-3 bg-error text-onError px-2 py-1 rounded-full text-[10px] font-bold shadow-lg animate-pulse whitespace-nowrap z-10 border border-white/20">
            {expiredCount}{" "}
            {expiredCount === 1 ? "ITEM VENCIDO" : "ITENS VENCIDOS"}
          </div>
        )}
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-primary/10 text-primary p-2.5 rounded-xl group-hover:bg-primary group-hover:text-on-primary transition-all duration-300">
            <span className="material-symbols-outlined text-[20px]">
              fact_check
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <button
              onClick={onPlateClick}
              className="text-xl font-bold text-slate-800 dark:text-slate-800 leading-none mb-1 truncate hover:text-primary transition-colors hover:underline text-left pointer-events-auto"
            >
              {vehicle.plate}
            </button>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-widest truncate">
              {vehicle.brand} {vehicle.model}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-auto pt-3 border-t border-outline-variant/30">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-600 bg-slate-100 dark:bg-slate-100 w-fit px-2 py-1 rounded-lg overflow-hidden max-w-full border border-slate-200">
            <span className="material-symbols-outlined text-[14px] flex-shrink-0">
              domain
            </span>
            <span className="text-[10px] font-bold truncate uppercase tracking-tight">
              {(Array.isArray(vehicle.costCenter)
                ? vehicle.costCenter
                : [vehicle.costCenter]
              )
                .map((v: any) =>
                  String(v || "")
                    .replace(/logística - região sul/gi, "")
                    .replace(/logístic a - região sul/gi, "")
                    .replace(/,? ?$/, "")
                    .trim(),
                )
                .filter(Boolean)
                .join(", ") || "NÃO ATRIBUÍDA"}
            </span>
          </div>

          <div className="flex items-center justify-between text-[9px] font-extrabold text-slate-500 dark:text-slate-500 uppercase tracking-[0.1em] mt-1">
            <span>KM ATUAL</span>
            <span className="font-mono text-primary text-xs">
              {(vehicle.currentKM || 0).toLocaleString("pt-BR")}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const VehicleOverdueBadge: React.FC<{
  vehicleId: string;
  currentKM: number;
}> = ({ vehicleId, currentKM }) => {
  const [expiredCount, setExpiredCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [itemsSnap, recordsSnap] = await Promise.all([
          getDocs(query(collection(db, `inspections/${vehicleId}/items`))),
          getDocs(query(collection(db, `inspections/${vehicleId}/records`))),
        ]);

        const itemsMap: Record<string, InspectionItem> = {};
        itemsSnap.docs.forEach((d) => {
          itemsMap[d.id] = { id: d.id, ...d.data() } as InspectionItem;
        });

        let count = 0;
        recordsSnap.docs.forEach((d) => {
          const record = { id: d.id, ...d.data() } as InspectionRecord;
          const item = itemsMap[record.itemId];
          if (item) {
            const { isOutdated } = calculateProgress(
              item,
              record,
              currentKM || 0,
            );
            if (isOutdated) count++;
          }
        });
        setExpiredCount(count);
      } catch (e) {
        console.error("Error fetching badge summary:", e);
      }
    };
    fetchData();
  }, [vehicleId, currentKM]);

  if (expiredCount === null || expiredCount === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 bg-error/10 text-error px-2 py-0.5 rounded-full text-[10px] font-bold border border-error/20">
      <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
      {expiredCount} {expiredCount === 1 ? "VENCIDO" : "VENCIDOS"}
    </span>
  );
};

export function Inspections() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';
  const { isPrivacyMode } = usePrivacy();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [checklistHistory, setChecklistHistory] = useState<any[]>([]);
  const [works, setWorks] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useLocalStorageState<
    "vehicles" | "history"
  >("inspections_activeTab", "vehicles");
  const [isExportingChecklist, setIsExportingChecklist] = useState<
    string | null
  >(null);
  const [detailsModalVehicle, setDetailsModalVehicle] = useState<any>(null);
  const [checklistToDelete, setChecklistToDelete] = useState<any | null>(null);
  const [isDeletingChecklist, setIsDeletingChecklist] = useState(false);

  const [searchQuery, setSearchQuery] = useLocalStorageState(
    "inspections_searchQuery",
    "",
  );
  const [filterWork, setFilterWork] = useLocalStorageState<string[]>(
    "inspections_filterWorkArr",
    [],
  );
  const [filterStatus, setFilterStatus] = useLocalStorageState<string[]>(
    "inspections_filterStatusArr",
    [],
  );
  const [viewMode, setViewMode] = useLocalStorageState<"grid" | "list">(
    "inspections_viewMode",
    "grid",
  );
  const [sortField, setSortField] = useLocalStorageState<string>('inspections_sortField', '');
  const [sortOrder, setSortOrder] = useLocalStorageState<'asc' | 'desc'>('inspections_sortOrder', 'asc');
  const [selectedChecklist, setSelectedChecklist] = useState<any | null>(null);

  const assignedDriversForModal = detailsModalVehicle
    ? drivers.filter((d) =>
        Array.isArray(d.vehicleAssigned)
          ? d.vehicleAssigned.includes(detailsModalVehicle.plate)
          : d.vehicleAssigned === detailsModalVehicle.plate,
      )
    : [];

  const handleDeleteChecklist = async (checklist: any) => {
    if (!checklist?.id) return;
    setIsDeletingChecklist(true);
    try {
      await auditDelete('checklist_history', checklist.id, 'Geral');
      setChecklistToDelete(null);
    } catch (error) {
      console.error("Error deleting checklist:", error);
      handleFirestoreError(error, OperationType.DELETE, "checklist_history");
    } finally {
      setIsDeletingChecklist(false);
    }
  };

  useEffect(() => {
    // We fetch the vehicles list to show cards or if an ID is present, we just pass to the Form
    const unsubscribeVehicles = onSnapshot(
      collection(db, "vehicles"),
      (snapshot) => {
        const seenPlates = new Set();
        const data = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          } as any))
          .filter((v) => {
            const plate = (v.plate || '').toUpperCase().trim();
            if (!plate) return true;
            if (seenPlates.has(plate)) return false;
            seenPlates.add(plate);
            return true;
          });
        setVehicles(
          data.sort((a: any, b: any) =>
            (a.plate || "").localeCompare(b.plate || "", undefined, {
              numeric: true,
              sensitivity: "base",
            }),
          ),
        );
        if (activeTab === "vehicles") setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, "vehicles"),
    );

    const qChecklist = query(
      collection(db, "checklist_history"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribeHistory = onSnapshot(
      qChecklist,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setChecklistHistory(data);
        if (activeTab === "history") setLoading(false);
      },
      (error) =>
        handleFirestoreError(error, OperationType.LIST, "checklist_history"),
    );

    const qWorks = query(collection(db, "works"), orderBy("name", "asc"));
    const unsubscribeWorks = onSnapshot(
      qWorks,
      (snapshot) => {
        setWorks(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, "works"),
    );

    const qStatuses = query(collection(db, "statuses"), orderBy("name", "asc"));
    const unsubscribeStatuses = onSnapshot(
      qStatuses,
      (snapshot) => {
        setStatuses(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, "statuses"),
    );

    const unsubscribeDrivers = onSnapshot(
      collection(db, "drivers"),
      (snapshot) => {
        setDrivers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, "drivers"),
    );

    return () => {
      unsubscribeVehicles();
      unsubscribeHistory();
      unsubscribeWorks();
      unsubscribeStatuses();
      unsubscribeDrivers();
    };
  }, [activeTab]);

  const handleExportChecklistPDF = async (checklist: any) => {
    setIsExportingChecklist(checklist.id);
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Buscar dados do veículo para pegar a imagem (tenta por ID ou Placa)
      const vehicle = vehicles.find((v) => 
        (v.id && checklist.vehicleId && v.id === checklist.vehicleId) || 
        (v.plate && checklist.vehiclePlate && v.plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === checklist.vehiclePlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
      );
      let vehicleLogoDataUrl = "";

      if (vehicle?.imageUrl) {
        try {
          const imgUrl = vehicle.imageUrl;
          // Usando proxy para evitar CORS e garantir conversão
          const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(imgUrl)}&w=400&output=jpeg`;
          const resp = await fetch(proxyUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            vehicleLogoDataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          }
        } catch (e) {
          console.warn("Could not load vehicle image for checklist PDF:", e);
        }
      }

      // Cálculos de resumo
      const totalItems = checklist.items.length;
      const compliantItems = checklist.items.filter(
        (i: any) => i.conformidade === "Em conformidade",
      ).length;
      const nonCompliantItems = totalItems - compliantItems;

      const tableData = checklist.items.map((item: any) => [
        item.item,
        item.category || "Geral",
        item.conformidade,
        item.service || "NENHUMA",
      ]);

      autoTable(pdf, {
        startY: 55,
        margin: { top: 55, bottom: 20, left: 14, right: 14 },
        head: [["ITEM", "CATEGORIA", "STATUS", "OBSERVAÇÕES / SERVIÇOS"]],
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
        didParseCell: function (data) {
          // Status não conforme em vermelho para toda a linha
          if (data.section === "body") {
            const status = data.row.cells[2].raw;
            if (status !== "Em conformidade") {
              data.cell.styles.textColor = [220, 38, 38]; // Red-600
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
        didDrawPage: function (data) {
          // Cabeçalho (renderizado em todas as páginas)
          let startY = 15;

          if (vehicleLogoDataUrl) {
            pdf.addImage(vehicleLogoDataUrl, "JPEG", 14, startY, 35, 20);
            pdf.setFontSize(16);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(0, 0, 0);
            pdf.text(`Checklist: ${checklist.vehiclePlate}`, 54, startY + 8);
            pdf.setFontSize(10);
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(100, 100, 100);
            pdf.text(`${checklist.vehicleModel}`, 54, startY + 14);
          } else {
            pdf.setFontSize(16);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(0, 0, 0);
            pdf.text(`Checklist: ${checklist.vehiclePlate}`, 14, startY + 8);
            pdf.setFontSize(10);
            pdf.setFont("helvetica", "normal");
            pdf.setTextColor(100, 100, 100);
            pdf.text(`${checklist.vehicleModel}`, 14, startY + 14);
          }

          // Resumo no cabeçalho
          pdf.setFontSize(8);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(30, 41, 59);
          pdf.text(`TOTAL: ${totalItems}`, 14, startY + 22);
          pdf.setTextColor(22, 163, 74); // Verde
          pdf.text(`EM CONFORMIDADE: ${compliantItems}`, 40, startY + 22);
          pdf.setTextColor(220, 38, 38); // Vermelho
          pdf.text(`NÃO CONFORME: ${nonCompliantItems}`, 85, startY + 22);

          // Boxes informativos (KMs e Dados do Checklist)
          const boxWidth = 24;
          const boxHeight = 16;
          const spacing = 2;
          const driverBoxWidth = 34;
          const rightMargin = 10;
          
          // KM Atual
          pdf.setFillColor(241, 245, 249);
          pdf.roundedRect(pageWidth - boxWidth - rightMargin, startY, boxWidth, boxHeight, 2, 2, "F");
          pdf.setFontSize(5);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(100, 116, 139);
          pdf.text("KM ATUAL", pageWidth - boxWidth - rightMargin + 3, startY + 5);
          pdf.setFontSize(8);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(30, 41, 59);
          pdf.text(formatKM(vehicle?.currentKM || 0), pageWidth - boxWidth - rightMargin + 3, startY + 12);

          // KM Checklist
          const kmX = pageWidth - (boxWidth * 2) - spacing - rightMargin;
          pdf.setFillColor(241, 245, 249);
          pdf.roundedRect(kmX, startY, boxWidth, boxHeight, 2, 2, "F");
          pdf.setFontSize(5);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(100, 116, 139);
          pdf.text("KM CHECKLIST", kmX + 3, startY + 5);
          pdf.setFontSize(8);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(30, 41, 59);
          pdf.text(formatKM(checklist.kmAtClosure || 0), kmX + 3, startY + 12);

          // Data e Motorista (que é a Data Checklist na prática aqui)
          const dataX = pageWidth - (boxWidth * 2) - driverBoxWidth - (spacing * 2) - rightMargin;
          pdf.setFillColor(241, 245, 249);
          pdf.roundedRect(dataX, startY, driverBoxWidth, boxHeight, 2, 2, "F");
          pdf.setFontSize(5);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(100, 116, 139);
          pdf.text("DATA E MOTORISTA", dataX + 3, startY + 5);
          pdf.setFontSize(7);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(30, 41, 59);
          pdf.text(`${checklist.date}`, dataX + 3, startY + 10);
          pdf.text(`${checklist.driverName}`, dataX + 3, startY + 14);
        },
      });

      // Adicionar paginação inteligente ao final de todas as páginas
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

      // Campo de assinatura na última página
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
         documentType: 'Checklist Diário',
         documentTitle: `Checklist - ${checklist.vehiclePlate}`
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
        
        const userNameHistory = userData?.signatureInfo?.fullName || userData?.name || 'USUÁRIO DO SISTEMA';
        pdf.setFontSize(11);
        pdf.setTextColor(0, 0, 0);
        pdf.text(`por ${userNameHistory.toUpperCase()}`, 56, signatureY + 14);
        
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
          pdf.addImage(sealDataUrl, 'PNG', pageWidth - 14 - w - 10, signatureY + 6, w, h, '', 'FAST');
        } catch (sealErr) {
          console.warn("Could not add seal logo to Checklist PDF", sealErr);
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

      let dateStr = checklist.date;
      if (dateStr?.includes('-')) {
        const parts = dateStr.split('-'); // YYYY-MM-DD
        const year = parts[0].slice(-2);
        const month = parts[1];
        const day = parts[2];
        dateStr = `${day}.${month}.${year}`;
      } else if (dateStr?.includes('/')) {
        const parts = dateStr.split('/'); // DD/MM/YYYY
        const year = parts[2].slice(-2);
        const month = parts[1];
        const day = parts[0];
        dateStr = `${day}.${month}.${year}`;
      }

      pdf.save(`${dateStr}_${checklist.vehiclePlate}_INSPECAO.pdf`);
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      alert("Houve um problema ao gerar o PDF.");
    } finally {
      setIsExportingChecklist(null);
    }
  };

  let filteredVehicles = vehicles.filter((v) => {
    const matchesSearch =
      (v.plate || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.model || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.brand || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesWork =
      !filterWork || filterWork.length === 0 || filterWork.includes("") || filterWork.includes("Todas as Obras") ||
      (Array.isArray(v.costCenter)
        ? v.costCenter.some(cc => filterWork.includes(cc))
        : filterWork.includes(v.costCenter));
    const matchesStatus =
      !filterStatus || filterStatus.length === 0 || filterStatus.includes("") || filterStatus.includes("Todos os Status") ||
      filterStatus.includes(v.status);

    return matchesSearch && matchesWork && matchesStatus;
  });

  if (sortField) {
    filteredVehicles.sort((a, b) => {
      let valA = a[sortField] || '';
      let valB = b[sortField] || '';
      
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const stats = {
    total: filteredVehicles.length,
    inCompliance: filteredVehicles.filter((v) => v.status === "Ativo").length,
    needsAttention: filteredVehicles.filter((v) => v.status === "Em Manutenção")
      .length,
    checklistsMonth: checklistHistory.filter((h) => {
      const hDate = new Date(h.createdAt);
      const now = new Date();
      return (
        hDate.getMonth() === now.getMonth() &&
        hDate.getFullYear() === now.getFullYear()
      );
    }).length,
  };

  const filteredHistory = checklistHistory.filter(
    (h) =>
      (h.vehiclePlate || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (h.driverName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (h.vehicleModel || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {id ? (
        <InspectionForm 
          vehicleId={id} 
          onBack={() => navigate("/inspections")} 
          onPlateClick={setDetailsModalVehicle}
        />
      ) : (
        <motion.div
          className="space-y-6"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-[32px] font-bold text-on-surface tracking-tight mb-2">
            Inspeções da Frota
          </h2>
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("vehicles")}
              className={`pb-2 border-b-2 transition-all font-bold text-sm ${activeTab === "vehicles" ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}
            >
              VEÍCULOS
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`pb-2 border-b-2 transition-all font-bold text-sm ${activeTab === "history" ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}
            >
              HISTÓRICO DE CHECKLISTS
            </button>
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              if (!isAdmin) return;
              window.dispatchEvent(new CustomEvent('MANUAL_KM_SYNC', { detail: {} }));
            }}
            disabled={!isAdmin}
            className="group p-3.5 transition-all duration-300 rounded-2xl bg-[#E8F0FE] text-primary hover:bg-primary hover:text-white border border-[#D2E3FC] shadow-sm hover:shadow-lg active:scale-95 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isAdmin ? "Sincronizar GPS Agora" : "Apenas administradores"}
          >
            <span className="material-symbols-outlined text-[26px] block group-hover:rotate-[360deg] transition-transform duration-700 ease-in-out">satellite_alt</span>
          </button>
        )}
      </div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10"
        variants={containerVariants}
      >
        <motion.div
          variants={itemVariants}
          className="bg-surface-container-lowest dark:glass-panel border border-outline-variant dark:border-blue-500/20 p-6 rounded-2xl shadow-sm flex flex-col justify-between h-32 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all duration-300 relative overflow-hidden"
        >
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Veículos Filtrados
          </h3>
          <p className="text-[32px] font-bold text-on-surface mt-1">
            {stats.total}
          </p>
        </motion.div>
        <motion.div
          variants={itemVariants}
          className="bg-surface-container-lowest dark:glass-panel border border-outline-variant dark:border-blue-500/20 p-6 rounded-2xl shadow-sm flex flex-col justify-between h-32 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all duration-300 relative overflow-hidden"
        >
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Em Conformidade
          </h3>
          <p className="text-[32px] font-bold text-emerald-600 mt-1">
            {stats.inCompliance}
          </p>
        </motion.div>
        <motion.div
          variants={itemVariants}
          className="bg-surface-container-lowest dark:glass-panel border border-outline-variant dark:border-blue-500/20 p-6 rounded-2xl shadow-sm flex flex-col justify-between h-32 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all duration-300 relative overflow-hidden"
        >
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Em Manutenção
          </h3>
          <p className="text-[32px] font-bold text-error mt-1">
            {stats.needsAttention}
          </p>
        </motion.div>
        <motion.div
          variants={itemVariants}
          className="bg-surface-container-lowest dark:glass-panel border border-outline-variant dark:border-blue-500/20 p-6 rounded-2xl shadow-sm flex flex-col justify-between h-32 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all duration-300 relative overflow-hidden"
        >
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Checklists (Mês)
          </h3>
          <p className="text-[32px] font-bold text-primary mt-1">
            {stats.checklistsMonth}
          </p>
        </motion.div>
      </motion.div>

      <motion.div
        className="bg-white dark:bg-surface-container rounded-2xl p-6 mb-10 shadow-sm flex flex-wrap items-center gap-8 border border-outline-variant/50 relative z-40"
        variants={itemVariants}
      >
        <div className="flex-1 min-w-[250px]">
          <label className="block text-sm font-semibold text-on-surface-variant mb-2">
            Pesquisar
          </label>
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">
              search
            </span>
            <input
              type="text"
              placeholder="Pesquisar veículo ou placa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-full !bg-white dark:!bg-white border border-outline-variant rounded-xl pl-10 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all shadow-sm text-slate-800 dark:text-slate-800"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full transition-colors"
                title="Limpar pesquisa"
              >
                <span className="material-symbols-outlined text-[18px]">
                  close
                </span>
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <SearchableSelect
            label="Obra"
            placeholder="Todas as Obras"
            multiple={true}
            forceLightBg={true}
            options={[
              ...works.map((work) => ({ value: work.name, label: work.name })),
            ]}
            value={filterWork}
            onChange={(val) => setFilterWork(val)}
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <SearchableSelect
            label="Status"
            placeholder="Todos os Status"
            multiple={true}
            forceLightBg={true}
            options={[
              { value: "Ativo", label: "Ativo" },
              { value: "Inativo", label: "Inativo" },
              { value: "Em Manutenção", label: "Em Manutenção" },
              ...statuses
                .filter((s) => s.name !== "Ativo" && s.name !== "Inativo" && s.name !== "Em Manutenção")
                .map((s) => ({ value: s.name, label: s.name })),
            ]}
            value={filterStatus}
            onChange={(val) => setFilterStatus(val)}
          />
        </div>
        
        <div className="flex-1 min-w-[200px] flex items-end gap-2">
          <div className="flex-1">
            <SearchableSelect 
              label="Ordenar por"
              placeholder="Padrão"
              multiple={false}
              forceLightBg={true}
              options={[
                { value: 'modelYear', label: 'Ano do Modelo' },
                { value: 'color', label: 'Cor do Veículo' },
                { value: 'bodywork', label: 'Espécie / Tipo' },
                { value: 'exerciceYear', label: 'Exercício' },
                { value: 'brand', label: 'Marca' },
                { value: 'model', label: 'Modelo' },
                { value: 'plate', label: 'Placa' },
                { value: 'fuelType', label: 'Tipo de Combustível' }
              ]}
              value={sortField}
              onChange={(val) => setSortField(val as string)}
            />
          </div>
          {sortField && (
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="h-[42px] px-3 flex items-center justify-center bg-white border border-outline-variant rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
              title={sortOrder === 'asc' ? 'Ordem Crescente' : 'Ordem Decrescente'}
            >
              <span className="material-symbols-outlined text-[20px]">
                {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
              </span>
            </button>
          )}
        </div>

        {/* Contadores por Centro de Custo */}
        <div className="w-full mt-4 pt-4 border-t border-outline-variant/30 flex flex-wrap gap-2">
          {Object.entries(
            filteredVehicles.reduce((acc: Record<string, number>, v) => {
              const ccs = Array.isArray(v.costCenter) ? v.costCenter : [v.costCenter];
              ccs.forEach(cc => {
                if (!cc) return;
                const cleanCC = String(cc).replace(/logística - região sul/gi, '').trim() || 'Geral';
                acc[cleanCC] = (acc[cleanCC] || 0) + 1;
              });
              return acc;
            }, {})
          )
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .map(([cc, count]: [string, number]) => (
            <div key={cc} className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-high rounded-full border border-outline-variant/50 shadow-sm animate-in fade-in zoom-in duration-300">
               <span className="text-[10px] font-bold text-primary uppercase tracking-tight">{cc}</span>
               <span className="w-5 h-5 flex items-center justify-center bg-primary text-on-primary rounded-full text-[10px] font-bold">{count}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-6 w-full md:w-auto">
          {(searchQuery || filterWork.length > 0 || filterStatus.length > 0 || sortField) && (
            <button
              onClick={() => {
                setSearchQuery("");
                setFilterWork([]);
                setFilterStatus([]);
                setSortField('');
                setSortOrder('asc');
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors uppercase tracking-widest px-3 py-1.5 rounded-full hover:bg-surface-container-low"
            >
              LIMPAR FILTRO
              <span className="material-symbols-outlined text-[14px]">
                filter_alt_off
              </span>
            </button>
          )}
          <div className="flex bg-surface-container-low p-1.5 rounded-xl border border-outline-variant items-center gap-1 self-end mb-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${viewMode === "grid" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container"}`}
              title="Visualização em Grade"
            >
              <span className="material-symbols-outlined text-[20px]">
                grid_view
              </span>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${viewMode === "list" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container"}`}
              title="Visualização em Lista"
            >
              <span className="material-symbols-outlined text-[20px]">
                view_list
              </span>
            </button>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="p-8 text-center text-on-surface-variant flex flex-col items-center gap-2">
          <span className="material-symbols-outlined animate-spin">
            refresh
          </span>
          Carregando dados...
        </div>
      ) : activeTab === "vehicles" ? (
        viewMode === "grid" ? (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            <AnimatePresence>
              {filteredVehicles.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="col-span-full p-12 text-center bg-surface-container-low text-on-surface-variant border border-outline-variant rounded-2xl border-dashed"
                >
                  Nenhum veículo encontrado.
                </motion.div>
              ) : (
                filteredVehicles.map((vehicle) => (
                  <VehicleInspectionCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    onClick={() => {
                      navigate(`/inspections/${vehicle.id}`);
                    }}
                    onPlateClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setDetailsModalVehicle(vehicle);
                    }}
                  />
                ))
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            layout
            className="bg-white dark:bg-surface-container border border-outline-variant rounded-2xl overflow-hidden shadow-sm"
          >
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left min-w-[800px]">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">
                    <th className="px-6 py-4">Veículo</th>
                    <th className="px-6 py-4">Obra / Centro de Custo</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Itens Vencidos</th>
                    <th className="px-6 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {filteredVehicles.map((vehicle) => (
                    <tr
                      key={vehicle.id}
                      className="hover:bg-surface-container-low transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-white p-1 border border-outline-variant/30 shadow-sm flex items-center justify-center">
                            <img
                              src={
                                vehicle.imageUrl ||
                                "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=100"
                              }
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div>
                            <button onClick={(e) => { e.stopPropagation(); setDetailsModalVehicle(vehicle); }} className="text-sm font-bold text-on-surface hover:text-primary transition-colors hover:underline text-left pointer-events-auto">
                              {vehicle.plate}
                            </button>
                            <div className="text-[10px] text-on-surface-variant uppercase">
                              {vehicle.model}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-on-surface-variant uppercase">
                        {(Array.isArray(vehicle.costCenter)
                          ? vehicle.costCenter
                          : [vehicle.costCenter]
                        )
                          .map((v) =>
                            String(v || "")
                              .replace(/logística - região sul/gi, "")
                              .replace(/logístic a - região sul/gi, "")
                              .replace(/,? ?$/, "")
                              .trim(),
                          )
                          .filter(Boolean)
                          .join(", ") || "N/D"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            vehicle.status === "Ativo"
                              ? "bg-emerald-100 text-emerald-800"
                              : vehicle.status === "Em Manutenção"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {vehicle.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <VehicleOverdueBadge
                          vehicleId={vehicle.id}
                          currentKM={vehicle.currentKM || 0}
                        />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => navigate(`/inspections/${vehicle.id}`)}
                          className="px-4 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-sm"
                        >
                          INSPECIONAR
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredVehicles.length === 0 && (
              <div className="p-12 text-center text-on-surface-variant">
                Nenhum veículo encontrado com os filtros atuais.
              </div>
            )}
          </motion.div>
        )
      ) : (
        <motion.div
          layout
          className="bg-white dark:bg-surface-container border border-outline-variant rounded-2xl overflow-hidden shadow-sm"
        >
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left min-w-[800px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">
                  <th className="px-6 py-4">Data</th>
                  <th className="px-6 py-4">Veículo</th>
                  <th className="px-6 py-4">Motorista</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filteredHistory.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-surface-container-low transition-colors group cursor-pointer"
                    onClick={() => setSelectedChecklist(item)}
                  >
                    <td className="px-6 py-4 text-sm font-medium">
                      {item.date?.includes('-') ? item.date.split('-').reverse().join('/') : item.date}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold">
                        <PrivateValue value={item.vehiclePlate} />
                      </div>
                      <div className="text-[10px] text-on-surface-variant uppercase">
                        {item.vehicleModel}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm"><PrivateValue value={item.driverName} /></td>
                    <td className="px-6 py-4">
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-3">
                        {isAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/checklist?edit=${item.id}`); }}
                            className="w-9 h-9 rounded-full flex items-center justify-center bg-primary/10 text-primary hover:bg-primary hover:text-on-primary transition-colors"
                            title="Editar Checklist"
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              edit
                            </span>
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExportChecklistPDF(item); }}
                          disabled={isExportingChecklist === item.id}
                          className="w-9 h-9 rounded-full flex items-center justify-center bg-surface-container-high text-primary hover:bg-primary hover:text-on-primary transition-colors"
                          title="Exportar PDF"
                        >
                          {isExportingChecklist === item.id ? (
                            <span className="animate-spin text-[20px] material-symbols-outlined">
                              refresh
                            </span>
                          ) : (
                            <span className="material-symbols-outlined text-[20px]">
                              picture_as_pdf
                            </span>
                          )}
                        </button>
                        {isAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setChecklistToDelete(item); }}
                            className="w-9 h-9 rounded-full flex items-center justify-center bg-error/10 text-error hover:bg-error hover:text-on-error transition-colors"
                            title="Excluir Checklist"
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              delete
                            </span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredHistory.length === 0 && (
            <div className="p-12 text-center text-on-surface-variant">
              Nenhum histórico encontrado.
            </div>
          )}
        </motion.div>
      )}

      {/* Confirmação de Exclusão de Checklist */}
      <AnimatePresence>
        {checklistToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeletingChecklist && setChecklistToDelete(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface w-full max-w-sm rounded-3xl shadow-2xl relative z-10 overflow-hidden p-6 text-center"
            >
              <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl">delete_forever</span>
              </div>
              <h3 className="text-xl font-bold text-on-surface mb-2">Excluir Checklist?</h3>
              <p className="text-sm text-on-surface-variant mb-6">
                Esta ação é irreversível. O checklist do veículo <strong>{checklistToDelete.vehiclePlate}</strong> do dia {checklistToDelete.date} será removido permanentemente.
              </p>
              <div className="flex gap-3">
                <button
                  disabled={isDeletingChecklist}
                  onClick={() => setChecklistToDelete(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors disabled:opacity-50"
                >
                  CANCELAR
                </button>
                <button
                  disabled={isDeletingChecklist}
                  onClick={() => handleDeleteChecklist(checklistToDelete)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-error text-onError hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeletingChecklist ? (
                    <span className="material-symbols-outlined animate-spin text-[18px]">refresh</span>
                  ) : (
                    "EXCLUIR"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Checklist Details Modal */}
      <AnimatePresence>
        {selectedChecklist && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedChecklist(null)}
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
                    <div className={`w-12 h-12 bg-primary-container rounded-xl flex items-center justify-center`}>
                      <span className={`material-symbols-outlined text-primary text-[24px]`}>fact_check</span>
                    </div>
                    {selectedChecklist.type || 'Checklist Diário'}
                  </h2>
                  <div className="flex gap-4 items-center mt-4">
                    {vehicles.find(v => v.id === selectedChecklist.vehicleId || v.plate === selectedChecklist.vehiclePlate)?.imageUrl && (
                      <div className="w-16 h-16 rounded-xl bg-white overflow-hidden flex-shrink-0 flex items-center justify-center p-1">
                        <img 
                          src={vehicles.find(v => v.id === selectedChecklist.vehicleId || v.plate === selectedChecklist.vehiclePlate)?.imageUrl} 
                          alt="Veículo" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <span className="text-sm font-medium text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">directions_car</span>
                      <PrivateValue value={selectedChecklist.vehiclePlate} original={selectedChecklist.vehiclePlate || 'N/A'} /> - {selectedChecklist.vehicleModel}
                    </span>
                    <span className="text-sm font-medium text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                      {selectedChecklist.date?.includes('-') ? selectedChecklist.date.split('-').reverse().join('/') : selectedChecklist.date}
                    </span>
                    <span className="text-sm font-medium text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">person</span>
                      <PrivateValue value={selectedChecklist.driverName} />
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedChecklist(null)}
                  className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-error transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              <div className="p-6 sm:p-8 overflow-y-auto bg-surface-container-lowest/50">
                <div className="bg-white border border-outline-variant/50 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-on-surface mb-6 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">checklist</span>
                    Itens Inspecionados ({selectedChecklist.items?.length || 0})
                  </h3>
                  
                  <div className="space-y-3">
                    {selectedChecklist.items?.map((it: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-start pb-3 border-b border-outline-variant/30 last:border-0 last:pb-0">
                        <div>
                          <p className="font-semibold text-sm text-on-surface">{it.item}</p>
                          <p className="text-xs text-on-surface-variant mt-0.5">{it.category}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${it.conformidade === 'Em conformidade' ? 'bg-emerald-100 text-emerald-800' : it.conformidade === 'Não conforme' ? 'bg-red-100 text-red-800' : 'bg-surface-container text-on-surface-variant'}`}>
                          {it.conformidade === 'Em conformidade' && <span className="material-symbols-outlined text-[12px]">check</span>}
                          {it.conformidade === 'Não conforme' && <span className="material-symbols-outlined text-[12px]">close</span>}
                          {it.conformidade}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-outline-variant/30 bg-surface flex justify-end gap-3 mt-auto">
                <button 
                  onClick={() => setSelectedChecklist(null)}
                  className="px-6 py-3 font-semibold text-on-surface-variant hover:bg-surface-container-low rounded-xl transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )}

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
                      { label: 'Centro de Custo', value: (Array.isArray(detailsModalVehicle.costCenter) ? detailsModalVehicle.costCenter : [detailsModalVehicle.costCenter]).map(v => String(v || '').replace(/logística - região sul/gi, '').trim()).filter(Boolean).join(', ') || 'NÃO ATRIBUÍDO' },
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
                          <div className="h-2.5 w-2.5 rounded-full bg-primary"></div>
                          <span className="text-sm font-bold text-slate-500 dark:text-slate-500">Combustível</span>
                        </div>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-800">55%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-2.5 w-2.5 rounded-full bg-orange-500"></div>
                          <span className="text-sm font-bold text-slate-500 dark:text-slate-500">Manutenção</span>
                        </div>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-800">30%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-2.5 w-2.5 rounded-full bg-slate-200 dark:bg-slate-200"></div>
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
                            <div className="h-20 w-20 rounded-full mx-auto overflow-hidden mb-3 border-2 border-primary p-1 bg-slate-55 shadow-md">
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
