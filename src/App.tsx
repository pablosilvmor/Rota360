import { ReactNode, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { ConfirmModal } from './components/ConfirmModal';
import { Preloader } from './components/Preloader';

// Otimização: Code Splitting
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Fleet = lazy(() => import('./pages/Fleet').then(m => ({ default: m.Fleet })));
const Drivers = lazy(() => import('./pages/Drivers').then(m => ({ default: m.Drivers })));
const Maintenance = lazy(() => import('./pages/Maintenance').then(m => ({ default: m.Maintenance })));
const Admin = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const Fuel = lazy(() => import('./pages/Fuel').then(m => ({ default: m.Fuel })));
const Tracking = lazy(() => import('./pages/Tracking').then(m => ({ default: m.Tracking })));
const Works = lazy(() => import('./pages/Works').then(m => ({ default: m.Works })));
const Inspections = lazy(() => import('./pages/Inspections').then(m => ({ default: m.Inspections })));
const Reports = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));

function ProtectedRoute({ children, path }: { children: ReactNode, path: string }) {
  const { user, userData, loading, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (userData && !userData.isActive) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
        <span className="material-symbols-outlined text-[64px] text-error mb-4">block</span>
        <h1 className="text-2xl font-bold text-on-surface mb-2">Acesso Bloqueado</h1>
        <p className="text-on-surface-variant font-medium mb-6">Sua conta foi desativada pelo administrador.</p>
        <button 
          onClick={() => setShowLogoutConfirm(true)} 
          className="px-6 py-2 bg-primary text-on-primary rounded-lg font-bold shadow-sm"
        >
          Sair
        </button>
        <ConfirmModal 
          isOpen={showLogoutConfirm}
          title="Sair do sistema?"
          message="Deseja realmente sair do sistema?"
          onConfirm={logout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      </div>
    );
  }
  if (userData && path !== '/' && !userData.allowedScreens.includes(path) && userData.role !== 'admin') {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-full text-center">
          <span className="material-symbols-outlined text-[64px] text-on-surface-variant mb-4">lock</span>
          <h2 className="text-xl font-bold text-on-surface mb-2">Acesso Negado</h2>
          <p className="text-on-surface-variant">Você não tem permissão para acessar esta tela.</p>
        </div>
      </Layout>
    );
  }
  return <Layout>{children}</Layout>;
}

function PlaceholderPage({ title, description, icon }: { title: string, description: string, icon: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center h-full animate-in fade-in duration-300">
      <span className="material-symbols-outlined text-[64px] text-primary mb-4">{icon}</span>
      <h2 className="text-3xl font-bold text-on-surface mb-2">{title}</h2>
      <p className="text-on-surface-variant font-medium max-w-md">{description}</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Preloader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute path="/"><Dashboard /></ProtectedRoute>} />
            <Route path="/fleet" element={<ProtectedRoute path="/fleet"><Fleet /></ProtectedRoute>} />
            <Route path="/drivers" element={<ProtectedRoute path="/drivers"><Drivers /></ProtectedRoute>} />
            <Route path="/maintenance" element={<ProtectedRoute path="/maintenance"><Maintenance /></ProtectedRoute>} />
            <Route path="/inspections" element={<ProtectedRoute path="/inspections"><Inspections /></ProtectedRoute>} />
            <Route path="/inspections/:id" element={<ProtectedRoute path="/inspections"><Inspections /></ProtectedRoute>} />
            <Route path="/fuel" element={<ProtectedRoute path="/fuel"><Fuel /></ProtectedRoute>} />
            <Route path="/tracking" element={<ProtectedRoute path="/tracking"><Tracking /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute path="/admin"><Admin /></ProtectedRoute>} />
            <Route path="/works" element={<ProtectedRoute path="/"><Works /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute path="/reports"><Reports /></ProtectedRoute>} />
            
            <Route path="/suppliers" element={<ProtectedRoute path="/"><PlaceholderPage title="Fornecedores e Oficinas" description="Gestão de parceiros de manutenção e serviços externos." icon="build" /></ProtectedRoute>} />
            <Route path="/parts" element={<ProtectedRoute path="/"><PlaceholderPage title="Peças e Estoque" description="Controle de Insumos e peças de manutenção." icon="inventory" /></ProtectedRoute>} />
            <Route path="/fuel-stations" element={<ProtectedRoute path="/"><PlaceholderPage title="Postos de Combustível" description="Gestão de postos credenciados e relatórios de abastecimento." icon="local_gas_station" /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
