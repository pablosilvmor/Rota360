import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router';

export function Login() {
  const { user, loginWithGoogle } = useAuth();

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-primary-container flex items-center justify-center relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-fixed/5 rounded-full -mr-48 -mt-48 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-secondary-fixed/5 rounded-full -ml-48 -mb-48 blur-3xl"></div>
      
      <div className="z-10 bg-surface/10 backdrop-blur-xl border border-white/10 p-10 rounded-2xl shadow-2xl max-w-md w-full">
        <div className="text-center mb-10 flex flex-col items-center">
          <img src="https://i.imgur.com/tIPJCgH.png" alt="Rota 360" className="h-64 object-contain mb-4" />
          <p className="text-on-primary-container/70 tracking-widest uppercase text-xs font-semibold mb-8">
            Inteligência que move sua frota
          </p>
        </div>
        
        <button 
          onClick={loginWithGoogle}
          className="w-full bg-primary-fixed text-on-primary-fixed font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg"
        >
          <span className="material-symbols-outlined text-[20px]">login</span>
          Acessar com Google
        </button>

        <div className="flex flex-col items-center justify-center gap-2 mt-6">
          <a href="https://pablosilvmor.github.io/site/1" target="_blank" rel="noopener noreferrer" className="text-xs text-white/50 hover:text-primary transition-colors">DESENVOLVIDO POR PABLO MOREIRA</a>
          <img src="https://i.imgur.com/iG8dI7r.png" alt="Company Logo" className="h-16 object-contain rounded" />
        </div>
      </div>
    </div>
  );
}
