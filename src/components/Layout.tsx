import { ReactNode, useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation, Link } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { LogOut } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, userData, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [showNotImplemented, setShowNotImplemented] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    
    function handleClickOutside(event: MouseEvent) {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
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
    { name: 'Painel', path: '/', icon: 'dashboard' },
    { name: 'Frota', path: '/fleet', icon: 'local_shipping' },
    { name: 'Inspeções', path: '/inspections', icon: 'fact_check' },
    { name: 'Motoristas', path: '/drivers', icon: 'group' },
    { name: 'Relatórios', path: '/reports', icon: 'analytics' },
  ];

  const allowedNavItems = navItems.filter(item => 
    item.path === '/' || (userData?.allowedScreens || []).includes(item.path) || (userData?.role === 'admin')
  );

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background text-on-background flex">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm animate-in fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Side Navigation Bar */}
      <aside className={`w-[280px] h-screen fixed left-0 top-0 bg-primary-container border-r border-outline-variant/20 shadow-sm flex flex-col pt-1 pb-8 z-50 transition-transform duration-300 ease-in-out lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
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
          <img src="https://i.imgur.com/9gByHVv.png" alt="Rota 360" className="h-16 object-contain" />
          <p className="text-[10px] text-center font-normal text-on-primary-container uppercase tracking-wider mt-2">BEMON ENGENHARIA E MONTAGENS LTDA.</p>
          
          <div className="w-full mt-6 space-y-4 border-t border-b border-white/10 py-6">
            <button onClick={() => setIsRegistrationModalOpen(true)} className="w-full bg-primary text-on-primary px-4 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-transform" title="Novo Registro">
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Novo Registro</span>
            </button>
            <div className="flex justify-center items-center gap-4 mt-2">
              <div className="relative" ref={notificationsRef}>
                <button onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} className="p-2 text-on-primary-container hover:text-white transition-colors relative" title="Notificações">
                  <span className="material-symbols-outlined text-[24px]">notifications</span>
                  <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border-2 border-white"></span>
                </button>
                {isNotificationsOpen && (
                  <div className="absolute left-0 mt-2 w-80 bg-surface-container-lowest border border-outline-variant shadow-lg rounded-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 text-on-surface">
                    <div className="p-4 border-b border-outline-variant flex justify-between items-center">
                      <h4 className="font-semibold text-on-surface">Notificações</h4>
                      <span className="text-xs text-primary font-bold cursor-pointer" title="Marcar como lido">Marcar como lido</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      <div className="p-4 border-b border-outline-variant/30 hover:bg-surface-container transition-colors cursor-pointer flex gap-3" title="Detalhes da notificação">
                        <span className="material-symbols-outlined text-error mt-0.5">warning</span>
                        <div>
                          <p className="text-sm font-semibold text-on-surface">Falha no motor (TRK-019)</p>
                          <p className="text-xs text-on-surface-variant mt-1">Alerta gerado há 10 min. Manutenção necessária.</p>
                        </div>
                      </div>
                      <div className="p-4 hover:bg-surface-container transition-colors cursor-pointer flex gap-3" title="Detalhes da notificação">
                        <span className="material-symbols-outlined text-primary mt-0.5">check_circle</span>
                        <div>
                          <p className="text-sm font-semibold text-on-surface">Documento aprovado</p>
                          <p className="text-xs text-on-surface-variant mt-1">O CRLV do veículo ABC-1234 foi validado pelo OCR.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={settingsMenuRef}>
                <button 
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className={`p-2 transition-colors rounded-full ${isSettingsOpen ? 'bg-white/10 text-white' : 'text-on-primary-container hover:bg-white/10 hover:text-white'}`}
                  title="Configurações"
                >
                  <span className="material-symbols-outlined text-[24px]">settings</span>
                </button>
                
                {isSettingsOpen && (
                  <div className="absolute left-0 mt-2 w-56 bg-surface-container-lowest border border-outline-variant shadow-lg rounded-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 text-on-surface">
                    <div className="py-2">
                      <Link 
                        to="/settings" 
                        onClick={() => setIsSettingsOpen(false)}
                        className="flex items-center px-4 py-2 text-sm text-on-surface hover:bg-surface-container transition-colors"
                        title="Configurações"
                      >
                        <span className="material-symbols-outlined text-[20px] mr-3">settings_applications</span>
                        Configurações
                      </Link>
                      
                      {userData?.role === 'admin' && (
                        <Link 
                          to="/admin" 
                          onClick={() => setIsSettingsOpen(false)}
                          className="flex items-center px-4 py-2 text-sm text-on-surface hover:bg-surface-container transition-colors"
                          title="Painel de Admin"
                        >
                          <span className="material-symbols-outlined text-[20px] mr-3">admin_panel_settings</span>
                          Painel de Admin
                        </Link>
                      )}
                      
                      <div className="h-px bg-outline-variant/50 my-2"></div>
                      
                      <button 
                        onClick={requestLogout}
                        className="w-full flex items-center px-4 py-2 text-sm text-error hover:bg-error-container/50 transition-colors"
                        title="Sair do Sistema"
                      >
                        <span className="material-symbols-outlined text-[20px] mr-3">logout</span>
                        Sair do Sistema
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 space-y-2 px-2">
          {allowedNavItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            
            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={item.name}
                className={`px-4 py-3 mx-2 rounded-lg flex items-center gap-3 cursor-pointer transition-colors duration-200 ${
                  isActive 
                    ? 'text-primary-fixed bg-on-primary-fixed-variant font-medium'
                    : 'text-on-primary-container hover:bg-white/5 font-medium'
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>{item.icon}</span>
                <span className="text-base font-medium">{item.name}</span>
              </NavLink>
            );
          })}
          
          <div className="px-2 pt-2">
            <div className="relative group/more">
              <button className="w-full px-4 py-3 rounded-lg flex items-center justify-between text-on-primary-container hover:bg-white/5 font-medium transition-colors group">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined">more_horiz</span>
                  <span className="text-base font-medium">Mais Opções</span>
                </div>
                <span className="material-symbols-outlined text-[18px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
              </button>
              
              <div className="absolute left-full top-0 ml-2 w-56 bg-primary-container rounded-2xl p-2 opacity-0 group-hover/more:opacity-100 transition-all duration-200 pointer-events-none group-hover/more:pointer-events-auto shadow-2xl border border-white/10 z-[100] translate-y-[-10px] group-hover/more:translate-y-0">
                <NavLink to="/maintenance" className="px-4 py-2.5 rounded-xl flex items-center gap-3 text-on-primary-container hover:bg-white/10 font-medium transition-colors text-base" title="Manutenção">
                  <span className="material-symbols-outlined text-[20px]">build</span>
                  Manutenção
                </NavLink>
                <NavLink to="/fuel" className="px-4 py-2.5 rounded-xl flex items-center gap-3 text-on-primary-container hover:bg-white/10 font-medium transition-colors text-base" title="Combustível">
                  <span className="material-symbols-outlined text-[20px]">local_gas_station</span>
                  Combustível
                </NavLink>
                <NavLink to="/tracking" className="px-4 py-2.5 rounded-xl flex items-center gap-3 text-on-primary-container hover:bg-white/10 font-medium transition-colors text-base" title="Rastreamento">
                  <span className="material-symbols-outlined text-[20px]">map</span>
                  Rastreamento
                </NavLink>
              </div>
            </div>
          </div>
        </nav>
        
        <div className="p-4 bg-black/30 mt-auto border-t border-white/5 flex flex-col gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-white">person</span>
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-semibold truncate text-white">{userData?.name || user?.displayName || 'Admin'}</p>
              <p className="text-xs text-on-primary-container truncate capitalize">{userData?.role || 'Gestor'}</p>
            </div>
            <button onClick={requestLogout} className="text-on-primary-container hover:text-white transition-colors" title="Sair">
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
          <div className="text-center pt-2 border-t border-white/10">
            <span className="text-[10px] text-on-primary-container/60">
              Desenvolvido por <a href="https://pablosilvmor.github.io/site/1" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition-colors">Pablo Moreira</a>
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
            <div className="font-bold text-sm">Rota 360</div>
            <div className="w-10"></div>
        </header>

        {/* Content Canvas */}
        <div className="flex-1 p-4 md:p-8 overflow-x-hidden">
          {children}
        </div>
      </main>

      {/* Central de Cadastros / Mass Registration Modal */}
      {isRegistrationModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
              <h3 className="text-xl font-semibold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">data_object</span>
                Central de Cadastros
              </h3>
              <button onClick={() => setIsRegistrationModalOpen(false)} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div onClick={() => { setIsRegistrationModalOpen(false); navigate('/fleet'); }} className="border border-outline-variant rounded-xl p-4 hover:bg-surface-container-low transition-colors cursor-pointer group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="material-symbols-outlined text-primary text-[28px]">local_shipping</span>
                    <span className="material-symbols-outlined justify-self-end text-on-surface-variant group-hover:text-primary">arrow_forward</span>
                  </div>
                  <h4 className="font-semibold text-on-surface">Veículos</h4>
                  <p className="text-xs text-on-surface-variant mt-1">Frota própria e agregados.</p>
                </div>
                <div onClick={() => { setIsRegistrationModalOpen(false); navigate('/drivers'); }} className="border border-outline-variant rounded-xl p-4 hover:bg-surface-container-low transition-colors cursor-pointer group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="material-symbols-outlined text-primary text-[28px]">group</span>
                    <span className="material-symbols-outlined justify-self-end text-on-surface-variant group-hover:text-primary">arrow_forward</span>
                  </div>
                  <h4 className="font-semibold text-on-surface">Motoristas</h4>
                  <p className="text-xs text-on-surface-variant mt-1">Ativos e inativos.</p>
                </div>
                <div onClick={() => { setIsRegistrationModalOpen(false); navigate('/works'); }} className="border border-outline-variant rounded-xl p-4 hover:bg-surface-container-low transition-colors cursor-pointer group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="material-symbols-outlined text-primary text-[28px]">architecture</span>
                    <span className="material-symbols-outlined justify-self-end text-on-surface-variant group-hover:text-primary">arrow_forward</span>
                  </div>
                  <h4 className="font-semibold text-on-surface">Obras (Geral)</h4>
                  <p className="text-xs text-on-surface-variant mt-1">Locais de destino de operação.</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-surface-container-low border-t border-outline-variant flex justify-end items-center gap-4">
              <button onClick={() => { setIsRegistrationModalOpen(false); setSelectedFile(null); }} className="px-6 py-2 border border-outline-variant bg-transparent rounded-lg font-semibold hover:bg-surface-container transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-error-container text-on-error-container rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-[32px]">logout</span>
              </div>
              <h3 className="text-xl font-semibold text-on-surface mb-2">Sair do sistema?</h3>
              <p className="text-sm text-on-surface-variant">Tem certeza que deseja desconectar sua conta? Você precisará fazer login novamente para acessar o sistema.</p>
            </div>
            <div className="p-6 bg-surface-container-low border-t border-outline-variant flex gap-4">
              <button onClick={() => setIsLogoutModalOpen(false)} className="flex-1 px-4 py-2 border border-outline-variant rounded-lg font-semibold hover:bg-surface-container transition-colors">Cancelar</button>
              <button onClick={handleLogout} className="flex-1 px-4 py-2 bg-error text-white rounded-lg font-semibold hover:bg-error/90 transition-colors">Confirmar Saída</button>
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
          <span className="material-symbols-outlined group-hover:scale-110 transition-transform">arrow_upward</span>
        </button>
      )}
    </div>
  );
}
