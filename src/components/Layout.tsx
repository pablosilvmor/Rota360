import { ReactNode, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { NavLink, useNavigate, useLocation, Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { usePrivacy } from "../contexts/PrivacyContext";
import { LogOut } from "lucide-react";
import { ConfirmModal } from "./ConfirmModal";
import { KmSyncService } from "./KmSyncService";
import { InvoiceSyncService } from "./InvoiceSyncService";
import { HelpModal } from "./HelpModal";
import { motion, AnimatePresence } from "motion/react";
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit, 
  updateDoc, 
  doc, 
  writeBatch 
} from "firebase/firestore";
import { db } from "../lib/firebase";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, userData, logout, quotaExceeded } = useAuth();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showNotImplemented, setShowNotImplemented] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    }

    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);

    function handleClickOutside(event: MouseEvent) {
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(event.target as Node)
      ) {
        setIsSettingsOpen(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target as Node)
      ) {
        setIsMoreMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    // Fetch real-time auto-alerts for notifications
    const alertsQuery = query(
      collection(db, "auto_alertas"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribeAlerts = onSnapshot(alertsQuery, (snapshot) => {
      const alertsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log("Notifications received:", alertsData.length, "Unread:", alertsData.filter(n => (n as any).status !== 'Lido').length);
      setNotifications(alertsData);
    }, (error) => {
      console.error("Error fetching notifications:", error);
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("mousedown", handleClickOutside);
      unsubscribeAlerts();
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleTheme = () => {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    if (isCurrentlyDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDarkMode(true);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Tipo,Identificador,Nome\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "template_cadastro_massa.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleFileUpload = () => {
    if (selectedFile) {
      setUploadSuccess(true);
      setTimeout(() => {
        setUploadSuccess(false);
        setSelectedFile(null);
        setIsRegistrationModalOpen(false);
      }, 2000);
    }
  };

  const requestLogout = () => {
    setIsSettingsOpen(false);
    setIsLogoutModalOpen(true);
  };

  const navItems = [
    { name: "Painel", path: "/", icon: "dashboard" },
    { name: "Frota", path: "/fleet", icon: "local_shipping" },
    { name: "Inspeções", path: "/inspections", icon: "fact_check" },
    { name: "Checklist", path: "/checklist", icon: "checklist" },
    { name: "Notas Fiscais", path: "/invoices", icon: "receipt_long" },
    { name: "AutoAlerta", path: "/autoalerta", icon: "campaign" },
  ];

  const allowedNavItems = navItems.filter(
    (item) =>
      item.path === "/" ||
      (userData?.allowedScreens || []).includes(item.path) ||
      userData?.role?.toLowerCase() === "admin",
  );

  const unreadNotifications = notifications.filter(n => n.status !== 'Lido');
  const unreadCount = unreadNotifications.length;

  const markAllAsRead = async () => {
    try {
      const unreadItems = notifications.filter(n => n.status !== 'Lido');
      if (unreadItems.length === 0) return;

      setNotifications(prev => prev.map(n => ({ ...n, status: 'Lido' })));

      const batch = writeBatch(db);
      unreadItems.forEach(item => {
        const docRef = doc(db, "auto_alertas", item.id);
        batch.update(docRef, { status: "Lido" });
      });
      await batch.commit();
    } catch (error) {
      console.error("Erro ao marcar como lido:", error);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'Lido' } : n));
      await updateDoc(doc(db, "auto_alertas", id), { status: "Lido" });
    } catch (error) {
      console.error("Erro ao marcar notificação como lida:", error);
    }
  };

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex text-on-background selection:bg-primary/30">
      <KmSyncService />
      <InvoiceSyncService />
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm animate-in fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Side Navigation Bar */}
      <aside
        className={`w-[280px] h-screen fixed left-0 top-0 bg-primary-container border-r border-outline-variant/20 shadow-sm flex flex-col pt-1 pb-8 z-[1000] transition-transform duration-300 ease-in-out lg:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <ConfirmModal
          isOpen={showNotImplemented}
          title="Em desenvolvimento"
          message="Esta funcionalidade estará disponível em breve!"
          onConfirm={() => setShowNotImplemented(false)}
          onCancel={() => setShowNotImplemented(false)}
          confirmLabel="Entendi"
        />
        <div className="px-6 mb-4 flex flex-col items-center border-white/10 pb-4 pt-2 relative">
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden absolute top-2 right-2 text-on-primary-container hover:bg-white/10 rounded-full p-1"
            title="Fechar menu"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          <img
            src="https://i.imgur.com/9gByHVv.png"
            alt="Rota 360"
            className="h-16 object-contain"
          />
          <p className="text-[11px] text-center font-medium text-on-primary-container/80 italic mt-1">
            Inteligência que move sua frota
          </p>
          <p className="text-[10px] text-center font-normal text-on-primary-container uppercase tracking-wider mt-2">
            BEMON ENGENHARIA E MONTAGENS LTDA.
          </p>

          <div className="w-full mt-6 space-y-4 border-t border-b border-white/10 py-6">
            <button
              onClick={() => setIsRegistrationModalOpen(true)}
              className="w-full bg-primary text-on-primary px-4 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-transform"
              title="Novo Registro"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Novo Registro</span>
            </button>
            <div className="flex justify-center items-center gap-4 mt-2">
              <div className="relative" ref={notificationsRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsNotificationsOpen(!isNotificationsOpen);
                  }}
                  className="p-2 text-on-primary-container hover:text-white transition-colors relative rounded-full flex items-center justify-center"
                  title="Notificações"
                >
                  {unreadCount > 0 && (
                    <motion.span
                      animate={{
                        scale: [1, 2.5],
                        opacity: [0.5, 0]
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 1.5,
                        ease: "easeOut"
                      }}
                      className="absolute inset-0 bg-primary/40 rounded-full"
                    />
                  )}
                  <span className="material-symbols-outlined text-[24px] relative z-10">
                    notifications
                  </span>
                  {unreadCount > 0 && (
                    <motion.span 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-1 right-2 w-2.5 h-2.5 bg-error rounded-full border-2 border-primary-container shadow-sm z-20"
                    ></motion.span>
                  )}
                </button>
                <AnimatePresence>
                  {isNotificationsOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute left-0 mt-2 w-80 bg-surface-container-lowest border border-outline-variant shadow-lg rounded-xl overflow-hidden z-[2000] text-on-surface"
                    >
                      <div className="p-4 border-b border-outline-variant flex justify-between items-center">
                        <h4 className="font-semibold text-on-surface">
                          Notificações ({unreadCount})
                        </h4>
                        <button
                          onClick={markAllAsRead}
                          className="text-xs text-primary font-bold hover:underline"
                          title="Marcar todas como lidas"
                        >
                          Marcar tudo lido
                        </button>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {unreadNotifications.length === 0 ? (
                          <div className="p-8 text-center text-on-surface-variant italic text-sm">
                            Nenhuma notificação nova
                          </div>
                        ) : (
                          unreadNotifications.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => {
                                markAsRead(notif.id);
                                setIsNotificationsOpen(false);
                                navigate("/autoalerta-admin");
                              }}
                              className={`p-4 border-b border-outline-variant/30 hover:bg-surface-container transition-colors cursor-pointer flex gap-3 ${notif.status !== 'Lido' ? 'bg-primary/5' : ''}`}
                            >
                              <span className="material-symbols-outlined mt-0.5 text-primary">
                                warning
                              </span>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-on-surface">
                                  {notif.number ? `${notif.number} - ` : ''}{notif.plate}
                                </p>
                                <p className="text-xs text-on-surface-variant font-medium mt-0.5">
                                  {notif.driverName || 'Motorista não informado'}
                                </p>
                                <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">
                                  {notif.observation || 'Nenhuma observação informada.'}
                                </p>
                                <p className="text-[10px] text-on-surface-variant opacity-60 mt-2">
                                  {notif.createdAt?.toDate?.() ? notif.createdAt.toDate().toLocaleString('pt-BR') : 'Agora'}
                                </p>
                              </div>
                              {notif.status !== 'Lido' && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(notif.id);
                                  }}
                                  className="w-2 h-2 bg-primary rounded-full mt-2" 
                                  title="Marcar como lido"
                                />
                              )}
                            </div>
                          ))
                        )}
                      </div>
                      {notifications.length > 0 && (
                        <div className="p-2 border-t border-outline-variant bg-surface-container-low text-center">
                          <button 
                            onClick={() => {
                              setIsNotificationsOpen(false);
                              navigate("/autoalerta-admin");
                            }}
                            className="text-[11px] font-bold text-primary uppercase tracking-widest hover:underline"
                          >
                            Ver todos os alertas
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="relative" ref={settingsMenuRef}>
                <button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className={`p-2 transition-colors rounded-full ${isSettingsOpen ? "bg-white/10 text-white" : "text-on-primary-container hover:bg-white/10 hover:text-white"}`}
                  title="Configurações"
                >
                  <span className="material-symbols-outlined text-[24px]">
                    settings
                  </span>
                </button>

                {isSettingsOpen && (
                  <div className="absolute left-0 mt-2 w-56 bg-surface-container-lowest border border-outline-variant shadow-lg rounded-xl overflow-hidden z-[2000] animate-in fade-in zoom-in-95 duration-200 text-on-surface">
                    <div className="py-2">
                      <Link
                        to="/profile"
                        onClick={() => setIsSettingsOpen(false)}
                        className="flex items-center px-4 py-2 text-sm text-on-surface hover:bg-surface-container transition-colors"
                        title="Meu Perfil"
                      >
                        <span className="material-symbols-outlined text-[20px] mr-3">
                          person
                        </span>
                        Meu Perfil
                      </Link>
                      
                      {(userData?.role?.toLowerCase() === "admin" || (userData?.allowedScreens || []).includes('/admin')) && (
                        <Link
                          to="/admin"
                          onClick={() => setIsSettingsOpen(false)}
                          className="flex items-center px-4 py-2 text-sm text-on-surface hover:bg-surface-container transition-colors"
                          title="Central de Cadastros"
                        >
                          <span className="material-symbols-outlined text-[20px] mr-3">
                            admin_panel_settings
                          </span>
                          Central de Cadastros
                        </Link>
                      )}

                      <div className="h-px bg-outline-variant/50 my-2"></div>

                      <button
                        onClick={requestLogout}
                        className="w-full flex items-center px-4 py-2 text-sm text-error hover:bg-error-container/50 transition-colors"
                        title="Sair do Sistema"
                      >
                        <span className="material-symbols-outlined text-[20px] mr-3">
                          logout
                        </span>
                        Sair do Sistema
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => setIsHelpOpen(true)}
                  className="p-2 transition-colors rounded-full text-on-primary-container hover:bg-white/10 hover:text-white"
                  title="Central de Ajuda Inteligente"
                >
                  <span className="material-symbols-outlined text-[24px]">
                    psychology
                  </span>
                </button>
              </div>

              <div className="relative">
                <button
                  onClick={toggleTheme}
                  className={`p-2 transition-all duration-300 rounded-full flex items-center justify-center text-on-primary-container hover:bg-white/10 hover:text-white`}
                  title={isDarkMode ? "Modo Claro" : "Modo Escuro"}
                >
                  <span className="material-symbols-outlined text-[24px]">
                    {isDarkMode ? "light_mode" : "dark_mode"}
                  </span>
                </button>
              </div>

              <div className="relative">
                <button
                  onClick={togglePrivacyMode}
                  className={`p-2 transition-all duration-300 rounded-full flex items-center justify-center ${isPrivacyMode ? "bg-primary text-on-primary shadow-lg scale-110" : "text-on-primary-container hover:bg-white/10 hover:text-white"}`}
                  title={isPrivacyMode ? "Desativar Modo Privacidade" : "Ativar Modo Privacidade"}
                >
                  <span className="material-symbols-outlined text-[24px]">
                    {isPrivacyMode ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-2 px-2">
          {allowedNavItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/" && location.pathname.startsWith(item.path));

            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={item.name}
                onClick={() => setIsSidebarOpen(false)}
                className={`px-4 py-3 mx-2 rounded-lg flex items-center gap-3 cursor-pointer transition-colors duration-200 ${
                  isActive
                    ? "text-primary-fixed bg-on-primary-fixed-variant font-medium"
                    : "text-on-primary-container hover:bg-white/5 font-medium"
                }`}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                  }}
                >
                  {item.icon}
                </span>
                <span className="text-base font-medium">{item.name}</span>
              </NavLink>
            );
          })}

          {(() => {
            const hasMoreOptions = userData?.role?.toLowerCase() === 'admin' || ['/maintenance', '/fuel', '/tracking', '/reports', '/works', '/autoalerta-admin', '/drivers', '/audit'].some(path => (userData?.allowedScreens || []).includes(path));
            if (!hasMoreOptions) return null;
            return (
            <div className="px-2 pt-2">
              <div className="relative" ref={moreMenuRef}>
                <button
                  onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                  className={`w-full px-4 py-3 rounded-lg flex items-center justify-between transition-colors group ${isMoreMenuOpen ? "bg-white/10 text-white" : "text-on-primary-container hover:bg-white/5"}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined">more_horiz</span>
                    <span className="text-base font-medium">Mais Opções</span>
                  </div>
                  <span
                    className={`material-symbols-outlined text-[18px] transition-transform ${isMoreMenuOpen ? "rotate-90" : ""}`}
                  >
                    chevron_right
                  </span>
                </button>

                <AnimatePresence>
                  {isMoreMenuOpen && (
                    <motion.div 
                      initial={{ opacity: 0, x: -10, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -10, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      className="hidden lg:block static mt-2 lg:absolute lg:left-full lg:bottom-0 lg:pl-2 w-full lg:w-56 z-[2000] lg:mt-0"
                    >
                      <div className="bg-white dark:bg-primary-container opacity-100 rounded-2xl p-2 shadow-2xl border border-outline-variant/30 dark:border-white/20 lg:shadow-2xl shadow-none">
                      {((userData?.allowedScreens || []).includes('/drivers') || userData?.role?.toLowerCase() === 'admin') && (
                      <NavLink
                        to="/drivers"
                        onClick={() => setIsMoreMenuOpen(false)}
                        className="px-4 py-2.5 rounded-xl flex items-center gap-3 text-on-surface-variant dark:text-on-primary-container hover:bg-surface-container dark:hover:bg-white/10 font-medium transition-colors text-base"
                        title="Motoristas"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          group
                        </span>
                        Motoristas
                      </NavLink>
                      )}
                      {((userData?.allowedScreens || []).includes('/maintenance') || userData?.role?.toLowerCase() === 'admin') && (
                      <NavLink
                        to="/maintenance"
                        onClick={() => setIsMoreMenuOpen(false)}
                        className="px-4 py-2.5 rounded-xl flex items-center gap-3 text-on-surface-variant dark:text-on-primary-container hover:bg-surface-container dark:hover:bg-white/10 font-medium transition-colors text-base"
                        title="Manutenção"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          build
                        </span>
                        Manutenção
                      </NavLink>
                      )}
                      {((userData?.allowedScreens || []).includes('/fuel') || userData?.role?.toLowerCase() === 'admin') && (
                      <NavLink
                        to="/fuel"
                        onClick={() => setIsMoreMenuOpen(false)}
                        className="px-4 py-2.5 rounded-xl flex items-center gap-3 text-on-surface-variant dark:text-on-primary-container hover:bg-surface-container dark:hover:bg-white/10 font-medium transition-colors text-base"
                        title="Combustível"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          local_gas_station
                        </span>
                        Combustível
                      </NavLink>
                      )}
                      {((userData?.allowedScreens || []).includes('/tracking') || userData?.role?.toLowerCase() === 'admin') && (
                      <NavLink
                        to="/tracking"
                        onClick={() => setIsMoreMenuOpen(false)}
                        className="px-4 py-2.5 rounded-xl flex items-center gap-3 text-on-surface-variant dark:text-on-primary-container hover:bg-surface-container dark:hover:bg-white/10 font-medium transition-colors text-base"
                        title="Rastreamento"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          map
                        </span>
                        Rastreamento
                      </NavLink>
                      )}
                      {((userData?.allowedScreens || []).includes('/reports') || userData?.role?.toLowerCase() === 'admin') && (
                      <NavLink
                        to="/reports"
                        onClick={() => setIsMoreMenuOpen(false)}
                        className="px-4 py-2.5 rounded-xl flex items-center gap-3 text-on-surface-variant dark:text-on-primary-container hover:bg-surface-container dark:hover:bg-white/10 font-medium transition-colors text-base"
                        title="Relatórios"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          analytics
                        </span>
                        Relatórios
                      </NavLink>
                      )}
                      {((userData?.allowedScreens || []).includes('/autoalerta-admin') || userData?.role?.toLowerCase() === 'admin') && (
                      <NavLink
                        to="/autoalerta-admin"
                        onClick={() => setIsMoreMenuOpen(false)}
                        className="px-4 py-2.5 rounded-xl flex items-center gap-3 text-on-primary-container hover:bg-white/10 font-medium transition-colors text-base"
                        title="Gestão AutoAlerta"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          admin_panel_settings
                        </span>
                        Gestão AutoAlerta
                      </NavLink>
                      )}
                      
                      { (userData?.role?.toLowerCase() === 'admin' || (userData?.allowedScreens || []).includes('/audit')) && (
                      <NavLink
                        to="/audit"
                        onClick={() => setIsMoreMenuOpen(false)}
                        className="px-4 py-2.5 rounded-xl flex items-center gap-3 text-on-primary-container hover:bg-white/10 font-bold transition-colors text-base"
                        title="Auditoria de Ações"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          history
                        </span>
                        Auditoria de Ações
                      </NavLink>
                      )}
                    </div>
                  </motion.div>
                  )}
                </AnimatePresence>
            </div>
          </div>
          );
          })()}
        </nav>

        <div className="p-4 bg-black/30 mt-auto border-t border-white/5 flex flex-col gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/20 shadow-sm">
              {userData?.photoURL ? (
                <img
                  src={userData.photoURL}
                  alt={userData.name}
                  className={`w-full h-full object-cover transition-all duration-300 ${isPrivacyMode ? 'blur-[6px]' : ''}`}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="material-symbols-outlined text-white text-[20px]">
                  person
                </span>
              )}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-semibold truncate text-white">
                {userData?.name || user?.displayName || "Admin"}
              </p>
              <p className="text-xs text-on-primary-container truncate capitalize">
                {userData?.role || "Gestor"}
              </p>
            </div>
            <button
              onClick={requestLogout}
              className="text-on-primary-container hover:text-white transition-colors"
              title="Sair"
            >
              <span className="material-symbols-outlined text-[20px]">
                logout
              </span>
            </button>
          </div>
          <div className="text-center pt-2 border-t border-white/10">
            <span className="text-[10px] text-on-primary-container/60">
              Desenvolvido por{" "}
              <a
                href="https://pablosilvmor.github.io/site/1"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white transition-colors"
              >
                Pablo Moreira
              </a>
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="lg:ml-[280px] flex-1 flex flex-col min-h-screen w-full">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-xl shadow-sm border-b border-outline-variant h-14 px-4 flex items-center justify-between lg:hidden text-on-surface">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 hover:bg-surface-container rounded-lg"
            title="Abrir menu"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <div className="flex items-center justify-center">
            <img 
              src="https://i.imgur.com/9iZCsf6.png" 
              alt="Rota 360" 
              className="h-8 max-h-9 w-auto object-contain"
            />
          </div>
          <div className="w-10"></div>
        </header>

        {/* Content Canvas */}
        <div className="flex-1 p-4 md:p-8 overflow-x-hidden">
          {quotaExceeded && (
            <div className="mb-6 p-5 bg-red-50 border-2 border-red-200 dark:bg-red-950/20 dark:border-red-900/50 rounded-xl text-red-800 dark:text-red-200 flex flex-col sm:flex-row gap-4 items-start shadow-sm animate-in fade-in duration-300">
              <span className="material-symbols-outlined text-[32px] text-red-600 dark:text-red-400 shrink-0 select-none">warning</span>
              <div className="space-y-1">
                <h4 className="font-bold text-base">Limite de Cota do Firestore Excedido (Quota Exceeded)</h4>
                <p className="text-sm opacity-90 leading-relaxed text-slate-600 dark:text-slate-300">
                  O banco de dados atingiu o limite da cota gratuita diária de leitura no Firebase. Os limites são renovados diariamente pelo Firebase ou você pode fazer o upgrade/remover os limites abaixo:
                </p>
                <div className="pt-2 flex flex-wrap gap-2">
                  <a 
                    href="https://console.firebase.google.com/project/gen-lang-client-0705535266/firestore/databases/ai-studio-6b861078-d6df-4a6c-8244-9c8ab9cbc3a6/data?openUpgradeDialog=true" 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                    Acessar Console do Firebase (Upgrade Plan)
                  </a>
                  <button 
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-red-300 text-red-700 dark:bg-slate-900 dark:border-red-900 dark:text-red-300 font-semibold text-xs rounded-lg hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">refresh</span>
                    Recarregar Página
                  </button>
                </div>
              </div>
            </div>
          )}
          {children}
        </div>
      </main>

      {/* Central de Cadastros / Mass Registration Modal */}
      {isRegistrationModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
              <h3 className="text-xl font-semibold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">
                  data_object
                </span>
                Central de Cadastros
              </h3>
              <button
                onClick={() => setIsRegistrationModalOpen(false)}
                className="text-on-surface-variant hover:text-error transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  onClick={() => {
                    setIsRegistrationModalOpen(false);
                    navigate("/fleet");
                  }}
                  className="border border-outline-variant rounded-xl p-4 hover:bg-surface-container-low transition-colors cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="material-symbols-outlined text-primary text-[28px]">
                      local_shipping
                    </span>
                    <span className="material-symbols-outlined justify-self-end text-on-surface-variant group-hover:text-primary">
                      arrow_forward
                    </span>
                  </div>
                  <h4 className="font-semibold text-on-surface">Veículos</h4>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Frota própria e agregados.
                  </p>
                </div>
                <div
                  onClick={() => {
                    setIsRegistrationModalOpen(false);
                    navigate("/drivers");
                  }}
                  className="border border-outline-variant rounded-xl p-4 hover:bg-surface-container-low transition-colors cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="material-symbols-outlined text-primary text-[28px]">
                      group
                    </span>
                    <span className="material-symbols-outlined justify-self-end text-on-surface-variant group-hover:text-primary">
                      arrow_forward
                    </span>
                  </div>
                  <h4 className="font-semibold text-on-surface">Motoristas</h4>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Ativos e inativos.
                  </p>
                </div>
                <div
                  onClick={() => {
                    setIsRegistrationModalOpen(false);
                    navigate("/works");
                  }}
                  className="border border-outline-variant rounded-xl p-4 hover:bg-surface-container-low transition-colors cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="material-symbols-outlined text-primary text-[28px]">
                      architecture
                    </span>
                    <span className="material-symbols-outlined justify-self-end text-on-surface-variant group-hover:text-primary">
                      arrow_forward
                    </span>
                  </div>
                  <h4 className="font-semibold text-on-surface">
                    Obras (Geral)
                  </h4>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Locais de destino de operação.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-surface-container-low border-t border-outline-variant flex justify-end items-center gap-4">
              <button
                onClick={() => {
                  setIsRegistrationModalOpen(false);
                  setSelectedFile(null);
                }}
                className="px-6 py-2 border border-outline-variant bg-transparent rounded-lg font-semibold hover:bg-surface-container transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-error-container text-on-error-container rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-[32px]">
                  logout
                </span>
              </div>
              <h3 className="text-xl font-semibold text-on-surface mb-2">
                Sair do sistema?
              </h3>
              <p className="text-sm text-on-surface-variant">
                Tem certeza que deseja desconectar sua conta? Você precisará
                fazer login novamente para acessar o sistema.
              </p>
            </div>
            <div className="p-6 bg-surface-container-low border-t border-outline-variant flex gap-4">
              <button
                onClick={() => setIsLogoutModalOpen(false)}
                className="flex-1 px-4 py-2 border border-outline-variant rounded-lg font-semibold hover:bg-surface-container transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 px-4 py-2 bg-error text-white rounded-lg font-semibold hover:bg-error/90 transition-colors"
              >
                Confirmar Saída
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 p-4 bg-primary text-on-primary rounded-full shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center justify-center group animate-in fade-in slide-in-from-bottom-8"
          title="Voltar ao Topo"
        >
          <span className="material-symbols-outlined group-hover:scale-110 transition-transform">
            arrow_upward
          </span>
        </button>
      )}

      {/* Mobile Bottom Sheet for Mais Opções */}
      <AnimatePresence>
        {isMoreMenuOpen && (
          <div className="fixed inset-0 z-[2500] lg:hidden flex flex-col justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMoreMenuOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            {/* Bottom Sheet Modal */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative bg-white dark:bg-surface-container-low rounded-t-[32px] border-t border-outline-variant/30 p-6 pb-12 shadow-[0_-12px_40px_rgba(0,0,0,0.15)] flex flex-col gap-6"
            >
              {/* Drag Handle */}
              <div aria-hidden="true" className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto cursor-pointer" onClick={() => setIsMoreMenuOpen(false)} />
              
              <div className="flex justify-between items-center px-1">
                <h3 className="text-[11px] font-black tracking-widest uppercase text-slate-500 dark:text-slate-400 font-sans">
                  Mais Opções
                </h3>
                <button
                  onClick={() => setIsMoreMenuOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Grid container with modern visual design */}
              <div className="grid grid-cols-2 gap-3 mt-2">
                {((userData?.allowedScreens || []).includes('/drivers') || userData?.role?.toLowerCase() === 'admin') && (
                  <Link
                    to="/drivers"
                    onClick={(e) => { setIsMoreMenuOpen(false); setIsSidebarOpen(false); }}
                    className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-center gap-2 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[28px] opacity-80">group</span>
                    <span className="text-[10px] font-black tracking-widest uppercase opacity-90">
                      Motoristas
                    </span>
                  </Link>
                )}
                {((userData?.allowedScreens || []).includes('/maintenance') || userData?.role?.toLowerCase() === 'admin') && (
                  <Link
                    to="/maintenance"
                    onClick={(e) => { setIsMoreMenuOpen(false); setIsSidebarOpen(false); }}
                    className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-center gap-2 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[28px] opacity-80">build</span>
                    <span className="text-[10px] font-black tracking-widest uppercase opacity-90">
                      Manutenção
                    </span>
                  </Link>
                )}
                {((userData?.allowedScreens || []).includes('/fuel') || userData?.role?.toLowerCase() === 'admin') && (
                  <Link
                    to="/fuel"
                    onClick={(e) => { setIsMoreMenuOpen(false); setIsSidebarOpen(false); }}
                    className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-center gap-2 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[28px] opacity-80">local_gas_station</span>
                    <span className="text-[10px] font-black tracking-widest uppercase opacity-90">
                      Combustível
                    </span>
                  </Link>
                )}
                {((userData?.allowedScreens || []).includes('/tracking') || userData?.role?.toLowerCase() === 'admin') && (
                  <Link
                    to="/tracking"
                    onClick={(e) => { setIsMoreMenuOpen(false); setIsSidebarOpen(false); }}
                    className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-center gap-2 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[28px] opacity-80">map</span>
                    <span className="text-[10px] font-black tracking-widest uppercase opacity-90">
                      Rastreamento
                    </span>
                  </Link>
                )}
                {((userData?.allowedScreens || []).includes('/reports') || userData?.role?.toLowerCase() === 'admin') && (
                  <Link
                    to="/reports"
                    onClick={(e) => { setIsMoreMenuOpen(false); setIsSidebarOpen(false); }}
                    className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-center gap-2 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[28px] opacity-80">analytics</span>
                    <span className="text-[10px] font-black tracking-widest uppercase opacity-90">
                      Relatórios
                    </span>
                  </Link>
                )}
                {((userData?.allowedScreens || []).includes('/autoalerta-admin') || userData?.role?.toLowerCase() === 'admin') && (
                  <Link
                    to="/autoalerta-admin"
                    onClick={(e) => { setIsMoreMenuOpen(false); setIsSidebarOpen(false); }}
                    className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-center gap-2 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[28px] opacity-80">admin_panel_settings</span>
                    <span className="text-[10px] font-black tracking-widest uppercase opacity-90">
                      Gestão Autoalerta
                    </span>
                  </Link>
                )}
                {(userData?.role?.toLowerCase() === 'admin' || (userData?.allowedScreens || []).includes('/audit')) && (
                  <Link
                    to="/audit"
                    onClick={(e) => { setIsMoreMenuOpen(false); setIsSidebarOpen(false); }}
                    className="flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-center gap-2 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[28px] opacity-80">history</span>
                    <span className="text-[10px] font-black tracking-widest uppercase opacity-90">
                      Auditoria de Ações
                    </span>
                  </Link>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
