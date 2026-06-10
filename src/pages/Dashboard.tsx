import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { PrivateValue } from "../contexts/PrivacyContext";
import {
  collection,
  onSnapshot,
  collectionGroup,
  getDocs,
  query,
  limit
} from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { calculateProgress } from "../lib/progressUtils";

// Custom icons based on status
const createCustomIcon = (color: string) => L.divIcon({
  className: 'custom-div-icon',
  html: `<div class="pulse-marker" style="background-color: ${color}; box-shadow: 0 0 10px ${color}; margin: 9px;"></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

// Base coordinates for Belo Horizonte, MG
const BASE_LAT = -19.9167;
const BASE_LNG = -43.9345;

const CHART_COLORS = [
  "#0ea5e9",
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

export function Dashboard() {
  const navigate = useNavigate();
  const { cachedVehicles } = useAuth();
  const [isAlertCenterOpen, setIsAlertCenterOpen] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [vehicleStats, setVehicleStats] = useState({
    total: 0,
    active: 0,
    maintenance: 0,
  });

  const [expiredInspections, setExpiredInspections] = useState<any[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [itemsMap, setItemsMap] = useState<Record<string, any>>({});
  const [allRecords, setAllRecords] = useState<any[]>([]);

  const [nextServices, setNextServices] = useState<any[]>([]);
  const [costCenterStats, setCostCenterStats] = useState<any[]>([]);

  // 1. Fetch dynamic data initially
  useEffect(() => {
    let isMounted = true;
    
    const fetchInitialData = async () => {
      try {
        const itemsQ = query(collectionGroup(db, "items"), limit(200));
        const recordsQ = query(collectionGroup(db, "records"), limit(200));

        const [itemsSnap, recordsSnap] = await Promise.all([
          getDocs(itemsQ),
          getDocs(recordsQ)
        ]);
        
        if (!isMounted) return;

        const iMap: Record<string, any> = {};
        itemsSnap.forEach((doc) => {
          const data = doc.data();
          iMap[doc.id] = { ...data, id: doc.id };
        });
        setItemsMap(iMap);

        const rList: any[] = [];
        recordsSnap.forEach((doc) => {
          rList.push({ ...doc.data(), id: doc.id, path: doc.ref.path });
        });
        setAllRecords(rList);
      } catch (error) {
        console.error("Error fetching initial data:", error);
      }
    };

    fetchInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Main Logic Effect
  useEffect(() => {
    const processVehicles = () => {
      const vehicleLookup = new Map();
      const fetchedVehicles = cachedVehicles.map((data: any) => {
        const hash = (data.plate || data.id).split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
        const latOffset = (hash % 100) / 1000;
        const lngOffset = ((hash * 7) % 100) / 1000;
        
        const vehicle = {
          ...data,
          location: {
            lat: BASE_LAT + latOffset,
            lng: BASE_LNG + lngOffset
          }
        };
        
        vehicleLookup.set(data.id, vehicle);
        if (data.plate) vehicleLookup.set(data.plate, vehicle);
        
        return vehicle;
      });
      
      setVehicles(fetchedVehicles);

      const stats = {
        total: fetchedVehicles.length,
        active: fetchedVehicles.filter((v: any) => v.status === "Ativo").length,
        maintenance: fetchedVehicles.filter((v: any) => v.status === "Em Manutenção").length,
      };
      setVehicleStats(stats);

      // Chart stats
      const ccMap: Record<string, number> = {};
      fetchedVehicles.forEach((v: any) => {
        const ccs = Array.isArray(v.costCenter) ? v.costCenter : [v.costCenter || "Não Definido"];
        ccs.forEach((cc: any) => {
          const ccName = String(cc || "").replace(/logística - região sul/gi, "").replace(/logístic a - região sul/gi, "").replace(/,? ?$/, "").trim();
          if (ccName) ccMap[ccName] = (ccMap[ccName] || 0) + 1;
        });
      });
      setCostCenterStats(Object.entries(ccMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));
    };

    if (cachedVehicles.length > 0) {
      processVehicles();
    }
  }, [cachedVehicles]);

  // Secondary Data Effect
  useEffect(() => {
    // Alerts listener (fetch once)
    getDocs(collection(db, "alerts")).then((snapshot) => {
      setAlerts(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    }).catch(console.error);

    // Maintenance listener (fetch once)
    getDocs(collectionGroup(db, "maintenances")).then((snapshot) => {
      const maintenanceData = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      setNextServices(maintenanceData.filter((os: any) => os.status !== "Concluído").slice(0, 5));
    }).catch(console.error);

    return () => {
    };
  }, []);

  // 3. Process expired inspections whenever vehicles or records change
  useEffect(() => {
    console.log("Processing alerts... Vehicles:", vehicles.length, "Records:", allRecords.length);
    if (vehicles.length === 0 || allRecords.length === 0) {
      if (vehicles.length > 0) setLoadingAlerts(false); // If we have vehicles but no records found yet, at least stop loading if we're sure
      return;
    }

    setLoadingAlerts(true);
    try {
      const vehicleLookup = new Map();
      vehicles.forEach(v => {
        vehicleLookup.set(v.id, v);
        if (v.plate) vehicleLookup.set(v.plate, v);
      });

      const expired: any[] = [];

      // License expiration
      vehicles.forEach(v => {
        if (v.exerciceStatus === 'Vencido') {
          expired.push({
            vehicleId: v.id,
            vehiclePlate: v.plate,
            vehicleModel: v.model,
            vehicleBrand: v.brand,
            vehicleImage: v.imageUrl,
            itemName: "Licenciamento",
            remainingKM: 0,
            type: "expired",
            desc: `EXERCÍCIO ${v.exerciceYear} VENCIDO`
          });
        }
      });

      // Record-based expiration
      allRecords.forEach((record) => {
        const pathParts = record.path.split('/');
        const vehicle = pathParts.reduce((found: any, part: string) => found || vehicleLookup.get(part), null);
        const item = itemsMap[record.itemId];

        if (vehicle && item) {
          const currentVehicleKM = Number(vehicle.currentKM || vehicle.odometer || 0);
          const { progressPercent, remainingNumber, isOutdated, descRemaining } = calculateProgress(item, record, currentVehicleKM);

          if (isOutdated) {
            expired.push({
              vehicleId: vehicle.id,
              vehiclePlate: vehicle.plate,
              vehicleModel: vehicle.model,
              vehicleBrand: vehicle.brand,
              vehicleImage: vehicle.imageUrl,
              itemName: item.name,
              remainingKM: remainingNumber,
              type: "expired",
              desc: descRemaining
            });
          } else if (progressPercent >= 90 || remainingNumber <= 1000) {
            expired.push({
              vehicleId: vehicle.id,
              vehiclePlate: vehicle.plate,
              vehicleModel: vehicle.model,
              vehicleBrand: vehicle.brand,
              vehicleImage: vehicle.imageUrl,
              itemName: item.name,
              remainingKM: remainingNumber,
              type: "warning",
              desc: descRemaining
            });
          }
        }
      });

      setExpiredInspections(expired.sort((a, b) => {
        if (a.type === b.type) return a.remainingKM - b.remainingKM;
        return a.type === 'expired' ? -1 : 1;
      }));
    } catch (err) {
      console.error("Critical error in alert processing:", err);
    } finally {
      setLoadingAlerts(false);
    }
  }, [vehicles, allRecords, itemsMap]);

  console.log("Rendering Dashboard. Vehicles count:", vehicles.length);

  // Calculate center of vehicles
  const mapCenter: [number, number] = vehicles.length > 0
    ? [
        vehicles.reduce((acc, v) => acc + (v.location?.lat || 0), 0) / vehicles.length,
        vehicles.reduce((acc, v) => acc + (v.location?.lng || 0), 0) / vehicles.length
      ]
    : [BASE_LAT, BASE_LNG];

  return (
    <motion.div
      className="pb-10"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <AnimatePresence>
        {isAlertCenterOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsAlertCenterOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container text-on-surface">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[24px]">
                    notifications
                  </span>
                  <h3 className="text-xl font-semibold">Central de Alertas</h3>
                </div>
                <button
                  onClick={() => setIsAlertCenterOpen(false)}
                  className="hover:bg-black/10 p-2 rounded-full transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 overflow-y-auto space-y-4">
                {loadingAlerts ? (
                  <div className="py-12 text-center text-on-surface-variant flex flex-col items-center">
                    <span className="material-symbols-outlined animate-spin mb-2">
                      progress_activity
                    </span>
                    Carregando alertas...
                  </div>
                ) : Number(
                    [
                      ...alerts,
                      ...expiredInspections.filter((i) => i.type === "expired"),
                    ].length,
                  ) === 0 ? (
                  <div className="py-12 text-center text-on-surface-variant italic">
                    Nenhum alerta pendente no momento.
                  </div>
                ) : (
                  <>
                    {expiredInspections
                      .filter(
                        (i) => i.type === "expired" || i.type === "warning",
                      )
                      .map((insp, idx) => (
                        <div
                          key={`insp-${idx}`}
                          onClick={() => {
                            setIsAlertCenterOpen(false);
                            navigate(`/inspections/${insp.vehicleId}`);
                          }}
                          className={`flex items-start gap-4 p-4 bg-surface-container-low rounded-xl border ${insp.type === "expired" ? "border-error/50 shadow-[0_0_10px_rgba(255,0,0,0.05)] hover:bg-error-container/20" : "border-warning/50 hover:bg-warning-container/20"} transition-all cursor-pointer`}
                        >
                          <div className="w-12 h-12 rounded-lg border border-outline-variant bg-white overflow-hidden flex-shrink-0">
                            <img
                              src={
                                insp.vehicleImage ||
                                "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800"
                              }
                              className="w-full h-full object-contain"
                              alt={insp.vehicleModel}
                            />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-on-surface flex items-center gap-2">
                              {insp.itemName}
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-bold ${insp.type === "expired" ? "bg-error-container text-on-error-container" : "bg-warning-container text-warning-dark"}`}
                              >
                                {insp.type === "expired"
                                  ? "Vencido"
                                  : "Próximo do Vencimento"}
                              </span>
                            </p>
                            <p className="text-xs font-semibold text-on-surface-variant mt-1.5 uppercase tracking-wide">
                              <PrivateValue value={insp.vehiclePlate} /> • {insp.vehicleBrand}{" "}
                              {insp.vehicleModel}
                            </p>
                            <p
                              className={`text-[11px] mt-2 font-bold ${insp.type === "expired" ? "text-error" : "text-warning-dark"}`}
                            >
                              {insp.type === "expired"
                                ? `Vencido há ${Math.abs(insp.remainingKM).toLocaleString()} KM`
                                : `Faltam ${insp.remainingKM.toLocaleString()} KM`}
                            </p>
                          </div>
                        </div>
                      ))}
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`flex gap-4 p-4 bg-surface-container-low rounded-xl border ${alert.severity === "critical" ? "border-error/50" : "border-outline-variant"}`}
                      >
                        <span
                          className={`material-symbols-outlined mt-1 ${alert.severity === "critical" ? "text-error" : "text-on-surface-variant"}`}
                          style={{
                            fontVariationSettings:
                              alert.severity === "critical" ? "'FILL' 1" : "",
                          }}
                        >
                          {alert.severity === "critical" ? "warning" : "info"}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-on-surface">
                            {alert.title}
                          </p>
                          <p className="text-xs text-on-surface-variant mt-1">
                            {alert.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="mb-10" variants={itemVariants}>
        <h2 className="text-[32px] font-semibold text-on-surface leading-[1.3] tracking-[-0.01em]">
          Visão Geral das Operações
        </h2>
        <p className="text-base text-on-surface-variant mt-2">
          Status em tempo real do seu ecossistema logístico.
        </p>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10"
        variants={containerVariants}
      >
        <motion.div
          variants={itemVariants}
          className="bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm group hover:-translate-y-1 transition-transform duration-300"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-secondary-fixed rounded-lg text-on-secondary-fixed group-hover:bg-primary-container group-hover:text-primary-fixed transition-colors">
              <span className="material-symbols-outlined">local_shipping</span>
            </div>
            <span className="text-xs text-on-surface-variant font-bold uppercase">
              Frota Total
            </span>
          </div>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Total de Veículos
          </h3>
          <p className="text-[48px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">
            {vehicleStats.total}
          </p>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm group hover:-translate-y-1 transition-transform duration-300"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-tertiary-fixed rounded-lg text-on-tertiary-fixed group-hover:bg-primary-container group-hover:text-primary-fixed transition-colors">
              <span className="material-symbols-outlined">bolt</span>
            </div>
            <span className="text-xs text-on-surface-variant font-bold">
              {vehicleStats.total > 0 ? ((vehicleStats.active / vehicleStats.total) * 100).toFixed(1) : 0}%
            </span>
          </div>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Ativos Agora
          </h3>
          <p className="text-[48px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">
            {vehicleStats.active}
          </p>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm group hover:-translate-y-1 transition-transform duration-300"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-surface-variant rounded-lg text-on-surface-variant group-hover:bg-primary-container group-hover:text-primary-fixed transition-colors">
              <span className="material-symbols-outlined">build</span>
            </div>
            <span className="text-xs text-on-surface-variant font-bold">
              {vehicleStats.total > 0 ? ((vehicleStats.maintenance / vehicleStats.total) * 100).toFixed(1) : 0}%
            </span>
          </div>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Em Manutenção
          </h3>
          <p className="text-[48px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">
            {vehicleStats.maintenance}
          </p>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="bg-surface-container-lowest border border-outline-variant p-6 rounded-2xl shadow-sm group hover:-translate-y-1 transition-transform duration-300"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-error-container rounded-lg text-on-error-container group-hover:bg-error group-hover:text-white transition-colors">
              <span className="material-symbols-outlined">report_problem</span>
            </div>
            <span className="text-xs text-error font-bold">CRÍTICO</span>
          </div>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Alertas Ativos
          </h3>
          <p className="text-[48px] font-bold text-on-surface mt-1 leading-[1.2] tracking-[-0.02em]">
            {alerts.length + expiredInspections.filter(i => i.type === 'expired').length}
          </p>
        </motion.div>
      </motion.div>

      <motion.div
        className="grid grid-cols-12 gap-6 mb-6"
        variants={itemVariants}
      >
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-outline-variant flex items-center justify-between">
            <div>
              <h3 className="text-[20px] font-semibold">
                Veículos por Centro de Custo
              </h3>
              <p className="text-xs text-on-surface-variant mt-1">
                Quantidade de veículos ativos e em manutenção por obra/CC
              </p>
            </div>
          </div>
          <div className="p-6 h-[400px] w-full">
            {costCenterStats.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={0}
              >
                <BarChart
                  data={costCenterStats}
                  margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={true}
                    vertical={false}
                    stroke="#E2E8F0"
                  />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10, fontWeight: 600, fill: "#64748B" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontWeight: 600, fill: "#64748B" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.02)" }}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                    labelStyle={{ fontWeight: "bold", marginBottom: "4px" }}
                  />
                  <Bar
                    dataKey="value"
                    radius={[4, 4, 0, 0]}
                    barSize={40}
                    name="Veículos"
                  >
                    {costCenterStats.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center border-2 border-dashed border-outline-variant/30 rounded-xl">
                <p className="text-on-surface-variant italic text-sm text-center px-10">
                  Carregando dados estatísticos...
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-primary-container text-on-primary p-8 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6 text-on-primary-fixed">
              <span className="material-symbols-outlined text-tertiary-fixed">
                priority_high
              </span>
              <h3 className="text-[24px] font-semibold text-white">
                Alertas Críticos
              </h3>
            </div>
            <div className="space-y-4">
              {[
                ...alerts.map(a => ({
                  ...a,
                  vehicleImage: vehicles.find(v => v.plate === a.plate || v.id === a.vehicleId)?.imageUrl
                })),
                ...nextServices.filter(os => os.priority === 'Crítica' || os.priority === 'Alta' || os.priority === 'Média').map(os => ({
                  id: `os-${os.id}`,
                  title: `OS ${os.priority}: ${os.plate}`,
                  description: os.title,
                  severity: os.priority === 'Crítica' || os.priority === 'Alta' ? 'critical' : 'normal',
                  vehicleImage: vehicles.find(v => v.plate === os.plate || v.id === os.vehicleId)?.imageUrl,
                  vehiclePlate: os.plate
                })),
                ...expiredInspections.filter(i => i.type === 'expired' || i.type === 'warning').map(i => ({
                  id: `insp-${i.vehiclePlate}-${i.itemName}`,
                  title: `VEÍCULO: ${i.vehiclePlate}`,
                  description: i.desc.toUpperCase(),
                  severity: 'critical',
                  vehicleImage: i.vehicleImage,
                  vehiclePlate: i.vehiclePlate
                }))
              ].length === 0 ? (
                <div className="p-8 text-center text-white/50 italic text-xs">
                  Nenhum alerta ativo
                </div>
              ) : (
                [
                  ...alerts.map(a => ({
                    ...a,
                    vehicleImage: vehicles.find(v => v.plate === a.plate || v.id === a.vehicleId)?.imageUrl
                  })),
                  ...nextServices.filter(os => os.priority === 'Crítica' || os.priority === 'Alta').map(os => ({
                    id: `os-${os.id}`,
                    title: `OS ${os.priority}: ${os.plate}`,
                    description: os.title,
                    severity: 'critical',
                    vehicleImage: vehicles.find(v => v.plate === os.plate || v.id === os.vehicleId)?.imageUrl,
                    vehiclePlate: os.plate
                  })),
                  ...expiredInspections.filter(i => i.type === 'expired').map(i => ({
                    id: `insp-${i.vehiclePlate}-${i.itemName}`,
                    title: `VEÍCULO: ${i.vehiclePlate}`,
                    description: i.desc.toUpperCase(),
                    severity: 'critical',
                    vehicleImage: i.vehicleImage,
                    vehiclePlate: i.vehiclePlate
                  }))
                ].slice(0, 3).map((alert) => (
                  <div
                    key={alert.id}
                    className="flex gap-4 p-4 bg-white/5 rounded-lg border border-white/10"
                  >
                    <span
                      className={`material-symbols-outlined mt-1 ${alert.severity === "critical" ? "text-error" : "text-primary-fixed"}`}
                      style={{
                        fontVariationSettings:
                          alert.severity === "critical" ? "'FILL' 1" : "",
                      }}
                    >
                      {alert.severity === "critical" ? "warning" : "info"}
                    </span>
                      <div className="w-12 h-12 rounded-lg border border-white/20 bg-white overflow-hidden flex-shrink-0 flex items-center justify-center p-1">
                        <img 
                          src={alert.vehicleImage} 
                          alt="Veículo" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                    <div>
                      <p className="text-sm font-bold text-white">
                        {alert.title.includes(':') ? alert.title.split(':')[0] + ': ' : alert.title}
                        {alert.title.includes(':') ? <PrivateValue value={alert.title.split(':')[1].trim()} /> : null}
                      </p>
                      {alert.vehiclePlate && (
                        <p className="text-xs text-white/70 mt-0.5">
                          Placa: <PrivateValue value={alert.vehiclePlate} />
                        </p>
                      )}
                      <p className="text-xs text-white/70 mt-1">
                        {alert.description}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <button
            onClick={() => setIsAlertCenterOpen(true)}
            className="mt-8 bg-primary-fixed text-on-primary-fixed w-full py-4 rounded-lg font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            Ver Central de Alertas
          </button>
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-12 gap-6" variants={itemVariants}>
        <div className="col-span-12 lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-white z-10">
            <h3 className="text-[24px] font-semibold">Mapa de Manutenção</h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-error animate-pulse"></div>
                <span className="text-xs text-on-surface-variant font-medium">
                  Imediato
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-secondary"></div>
                <span className="text-xs text-on-surface-variant font-medium">
                  Agendado
                </span>
              </div>
            </div>
          </div>
          <div className="relative flex-1 bg-[#1a1a1a] min-h-[400px]">
            {vehicles.length > 0 && typeof window !== 'undefined' ? (
              <MapContainer 
                key="dashboard-fleet-map-instance"
                center={mapCenter} 
                zoom={12} 
                style={{ width: '100%', height: '100%', backgroundColor: '#0a1a3a' }}
                zoomControl={false}
                attributionControl={false}
                scrollWheelZoom={false}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                {vehicles.map(v => {
                  const isExpired = expiredInspections.some(e => e.vehicleId === v.id && (e.type === 'expired' || e.type === 'warning'));
                  const isNextService = nextServices.some(e => e.vehicleId === v.id);
                  
                  let color = "#94a3b8"; // Default color
                  if (isExpired) {
                    color = "#ef4444";
                  } else if (isNextService) {
                    color = "#3b82f6";
                  }

                  if (!v.location || typeof v.location.lat !== 'number') return null;

                  return (
                    <Marker 
                      key={`marker-${v.id}`} 
                      position={[v.location.lat, v.location.lng]}
                      icon={createCustomIcon(color)}
                    >
                      <Popup>
                        <div className="text-xs">
                          {v.imageUrl && <img src={v.imageUrl} alt={v.plate} className="w-16 h-10 object-cover rounded mb-1" />}
                          <strong className="text-primary"><PrivateValue value={v.plate} /></strong><br/>
                          {v.model}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">
                Carregando mapa e veículos...
              </div>
            )}

            <div className="absolute top-6 left-6 p-4 bg-white/90 backdrop-blur border border-outline-variant rounded-xl shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-primary animate-pulse"></div>
                <p className="text-sm font-bold text-on-surface">
                  Rastreamento de Frota Ativo
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-outline-variant bg-white z-10">
            <h3 className="text-[24px] font-semibold">Próximos Serviços</h3>
          </div>
          <div className="divide-y divide-outline-variant flex-1 overflow-y-auto">
            {loadingAlerts ? (
              <div className="py-12 text-center text-on-surface-variant flex flex-col items-center">
                <span className="material-symbols-outlined animate-spin mb-2">
                  progress_activity
                </span>
                Carregando...
              </div>
            ) : [
                ...expiredInspections.filter(
                  (i) => i.type === "expired" || i.type === "warning",
                ),
                ...nextServices,
              ].length === 0 ? (
              <div className="p-12 text-center text-on-surface-variant italic text-sm">
                Nenhuma manutenção ou serviço pendente no momento.
              </div>
            ) : (
              <>
                {expiredInspections
                  .filter((i) => i.type === "expired" || i.type === "warning")
                  .slice(0, 5)
                  .map((insp, idx) => (
                    <div
                      key={`srv-insp-${idx}`}
                      onClick={() => navigate(`/inspections/${insp.vehicleId}`)}
                      className="p-4 hover:bg-surface-container transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg border border-outline-variant bg-white overflow-hidden flex-shrink-0">
                          <img
                            src={
                              insp.vehicleImage ||
                              "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800"
                            }
                            className="w-full h-full object-contain"
                            alt={insp.vehicleModel}
                          />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">
                            <PrivateValue value={insp.vehiclePlate} />
                          </p>
                          <p className="text-xs text-on-surface-variant line-clamp-1">
                            {insp.itemName} • {insp.desc}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase flex-shrink-0 ${insp.type === "expired" ? "bg-error-container text-on-error-container" : "bg-warning-container text-warning-dark"}`}
                      >
                        {insp.type === "expired" ? "Vencido" : "Próximo"}
                      </span>
                    </div>
                  ))}
                {nextServices.map((service: any) => (
                  <div
                    key={service.id}
                    className="p-4 hover:bg-surface-container transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg bg-${service.color || "primary"}-container flex items-center justify-center`}
                      >
                        <span className="material-symbols-outlined text-[20px] text-on-surface">
                          {service.icon || "build"}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-on-surface">
                          <PrivateValue value={service.plate} />
                        </p>
                        <p className="text-xs text-on-surface-variant line-clamp-1">
                          {service.title}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase flex-shrink-0 ${service.priority === "Crítica" ? "bg-error-container text-on-error-container" : "bg-primary-container text-on-primary"}`}
                    >
                      {service.priority}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="p-4 bg-surface-container-low text-center mt-auto border-t border-outline-variant">
            <Link
              to="/maintenance"
              className="text-sm text-secondary font-bold hover:underline"
            >
              Ver Todas as Tarefas de Manutenção
            </Link>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
