import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db, OperationType, handleFirestoreError } from "../lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  getDoc,
  updateDoc,
  where,
  limit
} from "firebase/firestore";
import { SearchableSelect } from "../components/SearchableSelect";
import { useNavigate, useSearchParams } from "react-router";
import { calculateProgress } from "../lib/progressUtils";
import { useAuth } from "../contexts/AuthContext";

// Items default
const defaultItems = [
  {
    item: "Nível de Óleo",
    category: "Motor",
    conformidade: "Em conformidade",
    service: "Nenhum",
  },
  {
    item: "Nível de Água / Arrefecimento",
    category: "Motor",
    conformidade: "Em conformidade",
    service: "Nenhum",
  },
  {
    item: "Freios",
    category: "Segurança",
    conformidade: "Em conformidade",
    service: "Nenhum",
  },
  {
    item: "Pneus e Estepe",
    category: "Rodagem",
    conformidade: "Em conformidade",
    service: "Nenhum",
  },
  {
    item: "Sinalização e Faróis",
    category: "Elétrica",
    conformidade: "Em conformidade",
    service: "Nenhum",
  },
  {
    item: "Documentação (CRLV)",
    category: "Geral",
    conformidade: "Em conformidade",
    service: "Nenhum",
  },
];

export function Checklist({ preselectedVehicleId, autoAlertaId, hideHeader = false }: { preselectedVehicleId?: string, autoAlertaId?: string, hideHeader?: boolean } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const queryVehicleId = searchParams.get("vehicleId") === "undefined" ? "" : searchParams.get("vehicleId");
  const queryAutoAlertaId = searchParams.get("autoAlertaId") === "undefined" ? "" : searchParams.get("autoAlertaId");
  const queryVehiclePlate = searchParams.get("vehiclePlate") === "undefined" ? "" : searchParams.get("vehiclePlate");
  const queryDriverName = searchParams.get("driverName") === "undefined" ? "" : searchParams.get("driverName");

  const { user, userData } = useAuth();

  const [step, setStep] = useState(1);
  const [driverName, setDriverName] = useState(queryDriverName || "");
  const [checklistDate, setChecklistDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [vehicleId, setVehicleId] = useState(preselectedVehicleId || queryVehicleId || "");
  const [vehicles, setVehicles] = useState<any[]>([]);

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  const [records, setRecords] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!driverName && !queryDriverName) {
      if (userData?.name) setDriverName(userData.name);
      else if (user?.displayName) setDriverName(user.displayName);
    }
  }, [userData?.name, user?.displayName, queryDriverName]);

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const snap = await getDocs(collection(db, "vehicles"));
        const vList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setVehicles(vList);

        if (queryVehiclePlate && !vehicleId) {
          const matched = vList.find(v => v.plate === queryVehiclePlate);
          if (matched) setVehicleId(matched.id);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchVehicles();
  }, [queryVehiclePlate, vehicleId]);

  // Carregar checklist para edição se houver um ID
  useEffect(() => {
    if (editId) {
      const loadChecklist = async () => {
        setLoading(true);
        try {
          const docRef = doc(db, "checklist_history", editId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setDriverName(data.driverName || "");
            setVehicleId(data.vehicleId || "");
            setChecklistDate(
              data.date || new Date().toISOString().split("T")[0],
            );
            setItems(data.items || []);
            setStep(2); // Vai direto para a conferência dos itens
          }
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, "checklist_history");
        } finally {
          setLoading(false);
        }
      };
      loadChecklist();
    }
  }, [editId]);

  const handleStartInspection = async () => {
    if (!driverName || !vehicleId) {
      alert("Preencha seu nome e selecione um veículo.");
      return;
    }

    setLoadingItems(true);
    try {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      const targetId = vehicleId;

      const itemsSnap = await getDocs(
        collection(db, `inspections/${targetId}/items`),
      );

      const loadedItems = itemsSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          item: data.name,
          category: "Geral",
          conformidade: "Em conformidade",
          service: "",
          periodicityKM: data.periodicityKM || 0,
          unit: data.unit || "km",
        };
      });

      if (loadedItems.length === 0) {
        alert(
          "Este veículo ainda não possui itens de inspeção cadastrados na Central de Inspeções. Por favor, cadastre os itens antes de prosseguir.",
        );
        setLoadingItems(false);
        return;
      }

      const recordsSnap = await getDocs(
        collection(db, `inspections/${targetId}/records`),
      );
      const recordsMap: Record<string, any> = {};
      recordsSnap.docs.forEach((doc) => {
        const data = doc.data();
        recordsMap[data.itemId] = { id: doc.id, ...data };
      });

      setRecords(recordsMap);
      setItems(loadedItems);
      setStep(2);
    } catch (e) {
      console.error("Error starting checklist:", e);
      handleFirestoreError(
        e,
        OperationType.LIST,
        `inspections/${vehicleId}/items`,
      );
    } finally {
      setLoadingItems(false);
    }
  };

  const handleUpdateItem = (index: number, field: string, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const formatKM = (val: number) => {
    return new Intl.NumberFormat("pt-BR").format(val || 0);
  };

  const parseKM = (val: string) => {
    return parseInt(val.replace(/\D/g, "") || "0", 10);
  };

  const handleLocalRecordUpdate = (
    itemId: string,
    field: string,
    value: any,
  ) => {
    setRecords((prev) => {
      const currentRec = prev[itemId] || { lastMaintenanceKM: 0 };
      let nextKM = currentRec.nextMaintenanceKM || 0;

      if (field === "lastMaintenanceKM") {
        const item = items.find((i) => i.id === itemId);
        nextKM = value + (item?.periodicityKM || 0);
      }

      return {
        ...prev,
        [itemId]: {
          ...currentRec,
          [field]: value,
          ...(field === "lastMaintenanceKM"
            ? { nextMaintenanceKM: nextKM }
            : {}),
        },
      };
    });
  };

  const handleUpdateRecordField = async (
    itemId: string,
    field: string,
    value: any,
  ) => {
    try {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      const targetId = vehicleId;
      const record = records[itemId];
      let recId = record?.id;

      let nextKM = record?.nextMaintenanceKM || 0;
      let nextDate = record?.nextMaintenanceDate || "";

      const targetItem = items.find((i) => i.id === itemId);

      if (field === "lastMaintenanceKM" && targetItem) {
        nextKM = value + (targetItem.periodicityKM || 0);
      } else if (field === "lastMaintenanceDate" && targetItem) {
        // Implement calculateNextDate logic if required or ignore for now if only KM is requested
      }

      if (recId) {
        await updateDoc(doc(db, `inspections/${targetId}/records`, recId), {
          [field]: value,
          ...(field === "lastMaintenanceKM"
            ? { nextMaintenanceKM: nextKM }
            : {}),
          updatedAt: serverTimestamp(),
        });
        setRecords((prev) => ({
          ...prev,
          [itemId]: {
            ...prev[itemId],
            [field]: value,
            ...(field === "lastMaintenanceKM"
              ? { nextMaintenanceKM: nextKM }
              : {}),
          },
        }));
      } else {
        const newRef = doc(collection(db, `inspections/${targetId}/records`));
        await setDoc(newRef, {
          itemId,
          [field]: value,
          ...(field === "lastMaintenanceKM"
            ? { nextMaintenanceKM: nextKM }
            : {}),
          updatedAt: serverTimestamp(),
        });
        setRecords((prev) => ({
          ...prev,
          [itemId]: {
            id: newRef.id,
            itemId,
            [field]: value,
            ...(field === "lastMaintenanceKM"
              ? { nextMaintenanceKM: nextKM }
              : {}),
          },
        }));
      }
    } catch (e) {
      console.error("Error updating record:", e);
    }
  };

  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async () => {
    if (!driverName || !vehicleId) {
      alert("Preencha seu nome e selecione um veículo.");
      return;
    }

    setIsUploading(true);
    setLoading(true);
    setUploadProgress(10);

    try {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      setUploadProgress(20);

      // Criar o registro completo para o histórico (Arquivamento para consulta posterior)
      const checklistHistoryData = {
        driverName,
        date: checklistDate || new Date().toISOString().split("T")[0],
        vehicleId,
        vehiclePlate: vehicle?.plate || "",
        vehicleModel: vehicle?.model || "",
        items: items.map((item) => ({
          id: item.id,
          item: item.item,
          category: item.category,
          conformidade: item.conformidade,
          service: item.service,
        })),
        createdAt: serverTimestamp(),
        status: "Concluído",
        type: "Checklist Diário",
      };

      if (editId) {
        await updateDoc(
          doc(db, "checklist_history", editId),
          checklistHistoryData,
        );
      } else {
        await addDoc(collection(db, "checklist_history"), checklistHistoryData);
      }

      setUploadProgress(50);

      // Fetch existing records for this vehicle
      const currentVehicleId = vehicleId;
      const recordsSnap = await getDocs(
        collection(db, `inspections/${currentVehicleId}/records`),
      );
      const recordsByItemId = new Map();
      recordsSnap.forEach((doc) => {
        recordsByItemId.set(doc.data().itemId, { id: doc.id, ...doc.data() });
      });
      setUploadProgress(70);

      // Update records based on inspection items
      for (const item of items) {
        const conformityVal =
          item.conformidade === "Em conformidade" ? "SIM" : "NÃO";
        let serviceExec = item.service || "NÃO";
        if (conformityVal === "SIM") serviceExec = "NÃO";

        const existingRecord = recordsByItemId.get(item.id);

        if (existingRecord) {
          await setDoc(
            doc(
              db,
              `inspections/${currentVehicleId}/records`,
              existingRecord.id,
            ),
            {
              conformity: conformityVal,
              serviceExecuted: serviceExec,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        } else {
          await addDoc(
            collection(db, `inspections/${currentVehicleId}/records`),
            {
              itemId: item.id,
              conformity: conformityVal,
              serviceExecuted: serviceExec,
              lastMaintenanceKM: vehicle?.currentKM || 0,
              nextMaintenanceKM: (vehicle?.currentKM || 0) + 10000,
              updatedAt: serverTimestamp(),
            },
          );
        }
      }

      // Generate OS if there are non-conforming items
      const nonConformingItems = items.filter(i => i.conformidade === "Não conforme");
      if (nonConformingItems.length > 0) {
        await addDoc(collection(db, 'maintenance'), {
          plate: vehicle?.plate || "",
          vehicleId: vehicleId,
          title: `OS Automática: Checklist ${checklistDate.split('-').reverse().join('-')}`,
          status: 'Agendado',
          priority: 'Alta',
          provider: 'A Definir',
          description: `Gerado a partir do checklist diário.${(autoAlertaId || queryAutoAlertaId) ? `\nAutoAlerta Ref: ${(autoAlertaId || queryAutoAlertaId)}` : ''}\nItens:\n${nonConformingItems.map(i => `- ${i.item} (${i.service || 'Sem ação'})`).join('\n')}`,
          icon: 'build',
          color: 'error',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          source: 'checklist',
          autoAlertaId: (autoAlertaId || queryAutoAlertaId) || null,
          inspectionItems: nonConformingItems.map(i => ({ 
            id: i.id, 
            itemTitle: i.item, 
            periodicityKM: i.periodicityKM || 0 
          }))
        });

        const activeAlertId = autoAlertaId || queryAutoAlertaId;
        if (activeAlertId) {
           try {
             const autoAlertsRef = collection(db, "auto_alertas");
             const checkAlertDoc = async () => {
                 let dRef = doc(db, "auto_alertas", activeAlertId);
                 let snap = await getDoc(dRef);
                 if (snap.exists()) {
                     await updateDoc(dRef, { status: "os_generated" });
                     return;
                 }
                 // try by number
                 const q = query(autoAlertsRef, where("number", "==", activeAlertId), limit(1));
                 const qSnap = await getDocs(q);
                 if (!qSnap.empty) {
                     await updateDoc(doc(db, "auto_alertas", qSnap.docs[0].id), { status: "os_generated" });
                 }
             };
             await checkAlertDoc();
           } catch(err) {
             console.error("Erro updating auto_alerta", err);
           }
        }
      }

      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setSuccess(true);
        // Após 2 segundos, redirecionar
        setTimeout(() => {
          navigate("/inspections");
        }, 2000);
      }, 500);
    } catch (e) {
      handleFirestoreError(
        e,
        OperationType.UPDATE,
        `inspections/${vehicleId}/records`,
      );
      setIsUploading(false);
      setLoading(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (success) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-24 h-24 bg-primary-container text-primary rounded-full flex items-center justify-center mb-6"
        >
          <span className="material-symbols-outlined text-5xl">
            check_circle
          </span>
        </motion.div>
        <h2 className="text-3xl font-bold text-on-surface mb-4">
          Checklist Enviado com Sucesso!
        </h2>
        <p className="text-on-surface-variant mb-8 max-w-sm">
          Suas verificações foram enviadas ao controle de frota. Você será
          redirecionado em instantes.
        </p>
        <button
          onClick={() => navigate("/inspections")}
          className="bg-primary text-on-primary font-bold px-8 py-3 rounded-full shadow-lg"
        >
          Voltar para Inspeções
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-24">
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <div className="bg-white rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-primary animate-bounce">
                  cloud_upload
                </span>
              </div>
              <h3 className="text-xl font-bold mb-2 text-on-surface">
                Enviando Checklist...
              </h3>
              <p className="text-sm text-on-surface-variant mb-6">
                Aguarde enquanto processamos os dados.
              </p>

              <div className="h-3 w-full bg-surface-container-high rounded-full overflow-hidden mb-2">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs font-bold text-primary">
                {uploadProgress}% concluído
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="bg-primary text-on-primary p-6 rounded-b-3xl shadow-md sticky top-0 z-10 transition-all">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => (step === 1 ? window.history.back() : setStep(1))}
            className="w-10 h-10 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-2xl font-bold">Checklist Diário</h1>
            <p className="text-primary-container text-sm opacity-80">
              Preencha as informações do veículo
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <div
            className={`h-2 flex-1 rounded-full ${step >= 1 ? "bg-white" : "bg-primary-fixed/30"}`}
          ></div>
          <div
            className={`h-2 flex-1 rounded-full ${step >= 2 ? "bg-white" : "bg-primary-fixed/30"}`}
          ></div>
        </div>
      </header>

      <main className="p-6 max-w-lg mx-auto mt-4">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="space-y-6"
            >
              <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-outline-variant space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">
                    Nome
                  </label>
                  <input
                    type="text"
                    className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:outline-none transition-colors"
                    placeholder="Seu nome completo"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-on-surface-variant mb-2">
                    Data
                  </label>
                  <input
                    type="date"
                    className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:outline-none transition-colors"
                    value={checklistDate}
                    onChange={(e) => setChecklistDate(e.target.value)}
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Veículo"
                    placeholder="Selecione o veículo"
                    options={vehicles.map((v) => ({
                      value: v.id,
                      label: v.plate + " - " + v.model,
                      imageUrl: v.imageUrl,
                    }))}
                    value={vehicleId}
                    onChange={(val) => setVehicleId(val)}
                  />
                </div>

                {vehicleId &&
                  vehicles.find((v) => v.id === vehicleId)?.imageUrl && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-center mt-2 mb-4"
                    >
                      <img
                        src={vehicles.find((v) => v.id === vehicleId)?.imageUrl}
                        alt="Veículo Selecionado"
                        className="w-full max-w-[200px] h-32 object-cover rounded-xl border border-outline-variant/50 shadow-sm"
                      />
                    </motion.div>
                  )}

                <button
                  onClick={handleStartInspection}
                  disabled={loadingItems}
                  className="w-full py-4 bg-primary text-on-primary rounded-xl font-bold mt-4 shadow-sm active:scale-95 transition-transform disabled:opacity-50"
                >
                  {loadingItems ? "Carregando..." : "Iniciar Inspeção"}
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="space-y-6"
            >
              {(() => {
                const vehicle = vehicles.find((v) => v.id === vehicleId);
                return (
                  <div className="flex items-center gap-3 mb-6 bg-surface-container-lowest p-4 border border-outline-variant rounded-2xl shadow-sm">
                    <button
                      onClick={() => setStep(1)}
                      className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors"
                    >
                      <span className="material-symbols-outlined">
                        arrow_back
                      </span>
                    </button>
                    {vehicle?.imageUrl && (
                      <div className="w-14 h-14 rounded-lg bg-surface-container border border-outline-variant/50 overflow-hidden flex items-center justify-center shrink-0 shadow-sm p-1">
                        <img
                          src={vehicle.imageUrl}
                          alt={vehicle.plate}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-bold text-on-surface leading-tight">
                        Inspeção de Itens
                      </h3>
                      <p className="text-sm font-medium text-on-surface-variant flex items-center gap-1 mt-0.5">
                        <span className="material-symbols-outlined text-[16px]">
                          directions_car
                        </span>
                        {vehicle?.plate} - {vehicle?.model}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {items.length === 0 && (
                <div className="text-center p-6 text-on-surface-variant bg-surface-container-low rounded-xl">
                  Este veículo não possui itens cadastrados na sua ficha de
                  inspeção.
                </div>
              )}

              {items.map((item, idx) => {
                const record = records[item.id] || {
                  lastMaintenanceKM: 0,
                  nextMaintenanceKM: 0,
                };
                const vehicle = vehicles.find((v) => v.id === vehicleId);
                const currentVehicleKM =
                  vehicle?.currentKM || vehicle?.odometer || 0;

                // Construct pseudo-item for calculateProgress since item might miss "unit" or "periodicityKM" depending on past code, but we mapped it
                const pseudoItem = { ...item, name: item.item };

                const {
                  progressPercent,
                  remainingNumber,
                  isOutdated,
                  descRemaining,
                } = calculateProgress(pseudoItem, record, currentVehicleKM);

                let progressColor = "bg-primary";
                if (progressPercent > 80) progressColor = "bg-tertiary";
                if (progressPercent >= 100) progressColor = "bg-error";

                return (
                  <div
                    key={idx}
                    className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-outline-variant flex flex-col gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-bold text-on-surface leading-tight">
                          {item.item}
                        </p>
                        <p className="text-[11px] text-on-surface-variant uppercase tracking-widest">
                          {item.category}
                        </p>
                      </div>
                    </div>

                    {/* Linha Fina */}
                    <div className="w-full h-px bg-outline-variant/30"></div>

                    {/* Controles: Atualizar Manutenção e Conformidade */}
                    <div className="grid grid-cols-1 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                          Conformidade
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              handleUpdateItem(
                                idx,
                                "conformidade",
                                "Em conformidade",
                              )
                            }
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${item.conformidade === "Em conformidade" ? "bg-primary-container border-primary-container text-on-primary-container" : "border-outline-variant text-on-surface-variant bg-surface-container-low"}`}
                          >
                            OK
                          </button>
                          <button
                            onClick={() =>
                              handleUpdateItem(
                                idx,
                                "conformidade",
                                "Não conforme",
                              )
                            }
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${item.conformidade === "Não conforme" ? "bg-error-container border-error-container text-on-error-container" : "border-outline-variant text-on-surface-variant bg-surface-container-low"}`}
                          >
                            Com Problema
                          </button>
                        </div>
                      </div>

                      {item.conformidade === "Não conforme" && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                        >
                          <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">
                            Ação Executada / Necessária
                          </label>
                          <input
                            type="text"
                            value={item.service}
                            onChange={(e) =>
                              handleUpdateItem(idx, "service", e.target.value)
                            }
                            className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                            placeholder="Ex: Completou água..."
                          />
                        </motion.div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                          Última Manut. (KM)
                        </label>
                        <input
                          type="text"
                          value={formatKM(record.lastMaintenanceKM || 0)}
                          onChange={(e) => {
                            const val = parseKM(e.target.value);
                            handleLocalRecordUpdate(
                              item.id,
                              "lastMaintenanceKM",
                              val,
                            );
                          }}
                          onBlur={(e) =>
                            handleUpdateRecordField(
                              item.id,
                              "lastMaintenanceKM",
                              parseKM(e.target.value),
                            )
                          }
                          className="w-full md:w-44 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm font-mono focus:border-primary focus:ring-2 focus:ring-primary outline-none transition-all"
                          placeholder="Ex: 10.000"
                        />
                      </div>
                    </div>

                    {/* Progresso Igual ao de Inspeções */}
                    <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant/30 mt-1">
                      <div className="flex justify-between w-full text-xs font-bold font-mono mb-1.5">
                        <span
                          className={
                            progressPercent >= 100
                              ? "text-error"
                              : "text-on-surface-variant"
                          }
                        >
                          Próx: {formatKM(record.nextMaintenanceKM || 0)}
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
                      <div className="w-full bg-surface-container-high rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full ${progressColor} transition-all duration-500`}
                          style={{ width: `${progressPercent}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between w-full mt-1.5 items-center">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-tight ${isOutdated ? "text-error" : remainingNumber <= 1000 ? "text-warning" : "text-on-surface-variant/60"}`}
                        >
                          {descRemaining}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-4 bg-primary text-on-primary rounded-xl font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">
                    progress_activity
                  </span>
                ) : (
                  <span className="material-symbols-outlined">send</span>
                )}
                {loading ? "Enviando..." : "Finalizar Checklist"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Botão flutuante Voltar ao Topo */}
        <motion.button
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={scrollToTop}
          className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-white rounded-full shadow-2xl flex items-center justify-center z-50 hover:bg-opacity-90 transition-colors"
          title="Voltar ao Topo"
        >
          <span className="material-symbols-outlined">arrow_upward</span>
        </motion.button>
      </main>
    </div>
  );
}
