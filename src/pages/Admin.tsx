import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserData, useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { PrivateValue, usePrivacy } from '../contexts/PrivacyContext';

import { IntegrationsTab } from '../components/IntegrationsTab';
import { TelemetryTab } from '../components/TelemetryTab';
import { NotasFiscaisTab } from '../components/NotasFiscaisTab';

const Countdown = ({ expiresAt, onExtend }: { expiresAt: number, onExtend: () => void }) => {
  const [timeLeft, setTimeLeft] = useState(expiresAt - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(expiresAt - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const isExpired = timeLeft <= 0;
  const hours = Math.floor(Math.max(0, timeLeft) / (1000 * 60 * 60));
  const minutes = Math.floor((Math.max(0, timeLeft) % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((Math.max(0, timeLeft) % (1000 * 60)) / 1000);

  return (
    <div className="flex flex-col gap-1 mt-2 p-2 bg-surface-container-low border border-outline-variant rounded-lg">
      <div className="flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px] text-secondary">timer</span>
        <span className={`font-mono text-xs font-bold ${isExpired ? 'text-error' : 'text-secondary'}`}>
          {isExpired ? 'Expirado' : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
        </span>
      </div>
      <button
        onClick={onExtend}
        title="Prolongar tempo"
        className="text-[10px] bg-secondary-container text-on-secondary-container px-2 py-1 flex items-center justify-center gap-1 rounded font-bold hover:opacity-80 transition-opacity"
      >
        <span className="material-symbols-outlined text-[12px]">add</span>
        Alterar Prazo (+24h)
      </button>
    </div>
  );
};

interface Work {
  id: string;
  name: string;
  createdAt: number;
}

export function Admin() {
  const { isPrivacyMode } = usePrivacy();
  const { userData } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [preApproved, setPreApproved] = useState<any[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useLocalStorageState('admin_activeTab', 'obras');
  
  // Batch states
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  
  const [integrationPassword, setIntegrationPassword] = useState('');
  const [integrationUnlocked, setIntegrationUnlocked] = useState(false);
  const [authError, setAuthError] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('operador');

  const isAdmin = userData?.role?.toLowerCase() === 'admin';
  const canAccessAdmin = isAdmin || (userData?.allowedScreens || []).includes('/admin');

  useEffect(() => {
    if (!canAccessAdmin) {
      return;
    }

    // Listen to users
    const qUsers = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(
      qUsers,
      (snapshot) => {
        const usersData = snapshot.docs.map((doc) => ({
          uid: doc.id,
          ...doc.data(),
        })) as UserData[];
        setUsers(usersData);
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );

    // Listen to preApproved
    const qPre = query(collection(db, 'preApprovedAccess'));
    const unsubscribePre = onSnapshot(
      qPre,
      (snapshot) => {
        const preData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPreApproved(preData);
      },
      (error) => console.error("Error loading pre-approved:", error)
    );

    // Listen to works
    const qWorks = query(collection(db, 'works'));
    const unsubscribeWorks = onSnapshot(
      qWorks,
      (snapshot) => {
        const worksData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Work[];
        setWorks([...worksData].sort((a, b) => 
          (a.name || "").localeCompare((b.name || ""), undefined, { numeric: true, sensitivity: 'base' })
        ));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'works')
    );

    // Listen to vehicles
    const qVehicles = query(collection(db, 'vehicles'));
    const unsubscribeVehicles = onSnapshot(
      qVehicles,
      (snapshot) => {
        setVehicles(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => 
          (a.plate || "").localeCompare((b.plate || ""), undefined, { numeric: true, sensitivity: 'base' })
        ));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'vehicles')
    );

    // Listen to drivers
    const qDrivers = query(collection(db, 'drivers'));
    const unsubscribeDrivers = onSnapshot(
      qDrivers,
      (snapshot) => {
        setDrivers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => 
          (a.name || "").localeCompare((b.name || ""), undefined, { numeric: true, sensitivity: 'base' })
        ));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'drivers')
    );

    // Listen to statuses
    const qStatuses = query(collection(db, 'statuses'));
    const unsubscribeStatuses = onSnapshot(
      qStatuses,
      (snapshot) => {
        setStatuses(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => 
          (a.name || "").localeCompare((b.name || ""), undefined, { numeric: true, sensitivity: 'base' })
        ));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'statuses')
    );

    return () => {
      unsubscribeUsers();
      unsubscribePre();
      unsubscribeWorks();
      unsubscribeVehicles();
      unsubscribeDrivers();
      unsubscribeStatuses();
    };
  }, [userData]);

  if (!canAccessAdmin) {
    return <Navigate to="/" replace />;
  }

  // Se não for admin, não deve acessar a aba adm (Central de Cadastros -> adm)
  if (!isAdmin && activeTab === 'adm') {
    setActiveTab('obras');
  }

  const deleteUser = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
    }
  };

  const [expiredVisitor, setExpiredVisitor] = useState<UserData | null>(null);

  useEffect(() => {
    if (!isAdmin || !users.length) return;

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const expired = users.find(u => u.role === 'visitante' && u.expiresAt && u.expiresAt <= now);
      if (expired && expiredVisitor?.uid !== expired.uid) {
        setExpiredVisitor(expired);
      }
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [isAdmin, users, expiredVisitor]);

  const handleExtendVisitor = async (user: UserData) => {
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, { expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    setExpiredVisitor(null);
  };

  const handleDeleteVisitor = async (uid: string) => {
    await deleteUser(uid);
    setExpiredVisitor(null);
  };

  const deletePreApproved = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'preApprovedAccess', id));
    } catch (error) {
      console.error('Error deleting pre-approved:', error);
    }
  };

  const addPreApproved = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      alert('Endereço de e-mail inválido ou fora dos padrões corretos.');
      return;
    }
    
    // Check if email already exists in users or preApproved
    if (preApproved.some(p => p.email.toLowerCase() === newEmail.trim().toLowerCase())) {
      alert('Este e-mail já está na lista de acessos prévios.');
      return;
    }

    try {
      await addDoc(collection(db, 'preApprovedAccess'), {
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        createdAt: Date.now()
      });
      setNewEmail('');
      setNewRole('operador');
    } catch (error) {
      console.error('Error adding pre-approved:', error);
    }
  };

  const toggleStatus = async (user: UserData) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        isActive: !user.isActive,
        updatedAt: Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const updateRole = async (user: UserData, newRole: string) => {
    try {
      let screens = user.allowedScreens || ['/'];
      if (newRole === 'admin') {
        screens = ['/', '/fleet', '/maintenance', '/inspections', '/drivers', '/settings', '/admin', '/fuel', '/tracking', '/reports', '/checklist', '/works', '/autoalerta', '/autoalerta-admin'];
      } else if (newRole === 'gestor') {
        screens = ['/', '/fleet', '/maintenance', '/inspections', '/drivers', '/reports', '/fuel', '/tracking', '/works', '/autoalerta', '/autoalerta-admin'];
      } else if (newRole === 'auditor') {
        screens = ['/', '/fleet', '/maintenance', '/inspections', '/drivers', '/reports', '/fuel', '/tracking', '/works', '/checklist'];
      } else if (newRole === 'operador') {
        screens = ['/', '/inspections', '/checklist', '/autoalerta'];
      } else if (newRole === 'visitante') {
        screens = ['/', '/fleet', '/maintenance', '/inspections', '/drivers', '/reports', '/fuel', '/tracking', '/works', '/checklist'];
      }
      
      const userRef = doc(db, 'users', user.uid);
      const updateData: any = {
        role: newRole,
        isActive: true, // Automatically activate user when role is assigned
        allowedScreens: screens,
        updatedAt: Date.now()
      };
      
      if (newRole === 'visitante') {
        updateData.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      } else {
        updateData.expiresAt = null;
      }
      
      await updateDoc(userRef, updateData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const toggleScreenAccess = async (user: UserData, screen: string) => {
    if (user.role?.toLowerCase() === 'admin') return; 
    
    try {
      let currentScreens = [...(user.allowedScreens || [])];
      if (currentScreens.includes(screen)) {
        currentScreens = currentScreens.filter(s => s !== screen);
      } else {
        currentScreens.push(screen);
      }
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        role: user.role, // Maintain existing role
        isActive: user.isActive,
        allowedScreens: currentScreens,
        updatedAt: Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const saveWorksBatch = async () => {
    if (!importText.trim()) return;
    
    setIsSaving(true);
    try {
      const lines = importText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const batch = writeBatch(db);
      
      lines.forEach(name => {
        const newDocRef = doc(collection(db, 'works'));
        batch.set(newDocRef, {
          name,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      });
      
      await batch.commit();
      setImportText('');
      setShowImport(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'works');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteWork = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'works', id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `works/${id}`);
    }
  };

  const saveVehiclesBatch = async () => {
    if (!importText.trim()) return;
    setIsSaving(true);
    try {
      const lines = importText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const batch = writeBatch(db);
      lines.forEach(plate => {
        const newDocRef = doc(collection(db, 'vehicles'));
        batch.set(newDocRef, {
          plate,
          status: 'Ativo',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      });
      await batch.commit();
      setImportText('');
      setShowImport(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'vehicles');
    } finally {
      setIsSaving(false);
    }
  };

  const saveDriversBatch = async () => {
    if (!importText.trim()) return;
    setIsSaving(true);
    try {
      const lines = importText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const batch = writeBatch(db);
      lines.forEach(name => {
        const newDocRef = doc(collection(db, 'drivers'));
        batch.set(newDocRef, {
          name,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      });
      await batch.commit();
      setImportText('');
      setShowImport(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'drivers');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteVehicle = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'vehicles', id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `vehicles/${id}`);
    }
  };

  const deleteDriver = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'drivers', id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `drivers/${id}`);
    }
  };

  const saveStatusesBatch = async () => {
    if (!importText.trim()) return;
    setIsSaving(true);
    try {
      const lines = importText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const batch = writeBatch(db);
      lines.forEach(name => {
        const newDocRef = doc(collection(db, 'statuses'));
        batch.set(newDocRef, {
          name,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      });
      await batch.commit();
      setImportText('');
      setShowImport(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'statuses');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteStatus = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'statuses', id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `statuses/${id}`);
    }
  };

  const availableScreens = [
    { path: '/', label: 'Dashboard' },
    { path: '/fleet', label: 'Frota' },
    { path: '/inspections', label: 'Inspeções' },
    { path: '/maintenance', label: 'Manutenção' },
    { path: '/drivers', label: 'Motoristas' },
    { path: '/reports', label: 'Relatórios' },
    { path: '/checklist', label: 'Checklist' },
    { path: '/fuel', label: 'Combustível' },
    { path: '/tracking', label: 'Rastreamento' },
    { path: '/works', label: 'Obras' },
    { path: '/autoalerta', label: 'AutoAlerta' },
    { path: '/autoalerta-admin', label: 'Gestão AutoAlerta' },
    { path: '/admin', label: 'Central de Cadastros' },
    { path: '/profile', label: 'Meu Perfil' },
  ];

  const tabs = [
    { id: 'obras', label: 'Obras' },
    { id: 'veiculos', label: 'Veículos' },
    { id: 'motoristas', label: 'Motoristas' },
    { id: 'status', label: 'Status' },
    ...(isAdmin ? [{ id: 'adm', label: 'ADM' }] : []),
    { id: 'integracoes', label: 'Integrações' },
    { id: 'telemetria', label: 'Telemetria' },
    { id: 'notas_fiscais', label: 'Notas Fiscais' },
  ];

  return (
    <div className="space-y-6">
      {expiredVisitor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-6 max-w-md w-full shadow-lg">
            <h3 className="text-xl font-bold text-on-surface mb-2">Acesso de Visitante Expirado</h3>
            <p className="text-on-surface-variant text-sm mb-6">
              O tempo de acesso do visitante <strong className="text-on-surface">{expiredVisitor.name || expiredVisitor.email}</strong> expirou. Deseja prolongar o acesso por mais 24 horas? Caso negativo, a conta será excluída.
            </p>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => handleDeleteVisitor(expiredVisitor.uid)}
                className="px-4 py-2 bg-error text-on-error rounded-lg font-bold shadow-sm"
              >
                Não, Excluir
              </button>
              <button 
                onClick={() => handleExtendVisitor(expiredVisitor)}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg font-bold shadow-sm flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Sim, Prolongar (+24h)
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-[32px] font-bold text-on-surface tracking-tight mb-2">Central de Cadastros</h2>
          <p className="text-on-surface-variant font-medium">Controle o acesso e regras dos usuários no sistema Rota 360.</p>
        </div>
        {activeTab !== 'adm' && activeTab !== 'notas_fiscais' && activeTab !== 'integracoes' && activeTab !== 'telemetria' && (
          <button 
            onClick={() => setShowImport(true)}
            className="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold shadow-lg hover:opacity-90 transition-all active:scale-95 flex items-center gap-2"
          >
            <span className="material-symbols-outlined">add</span>
            Adicionar {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
          </button>
        )}
      </div>

      <div className="flex border-b border-outline-variant mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 text-sm font-bold transition-all border-b-2 -mb-[1px] ${
              activeTab === tab.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(activeTab === 'integracoes') && (
        !integrationUnlocked ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden p-6 max-w-sm mx-auto mt-8 animate-in fade-in zoom-in-95">
            <h3 className="text-xl font-bold text-on-surface mb-4">Autenticação Necessária</h3>
            <p className="text-sm text-on-surface-variant mb-6">Insira a senha de acesso para visualizar as integrações.</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (integrationPassword === 'asd11224') {
                setIntegrationUnlocked(true);
                setAuthError('');
              } else {
                setAuthError('Senha incorreta.');
              }
            }}>
              <input
                type="password"
                placeholder="Senha"
                value={integrationPassword}
                onChange={e => setIntegrationPassword(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary outline-none mb-4"
              />
              {authError && <p className="text-error text-sm mb-4">{authError}</p>}
              <button 
                type="submit"
                className="w-full px-4 py-2 bg-primary text-on-primary rounded-xl font-bold shadow-sm hover:opacity-90 transition-all text-sm"
              >
                Acessar
              </button>
            </form>
          </div>
        ) : (
          <IntegrationsTab />
        )
      )}

      {(activeTab === 'telemetria') && (
        <TelemetryTab />
      )}

      {(activeTab === 'notas_fiscais') && (
        <NotasFiscaisTab />
      )}

      {(activeTab === 'adm' && isAdmin) && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          {/* Acessos Prévios Section */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm p-6">
            <h3 className="text-[20px] font-bold text-on-surface mb-2">Liberação de Acesso Prévia</h3>
            <p className="text-sm text-on-surface-variant mb-6">Cadastre e-mails para garantir acesso automático quando os usuários fizerem login pela primeira vez.</p>
            
            <div className="flex flex-col md:flex-row gap-4 mb-8">
              <input 
                type="email" 
                placeholder="Digite o e-mail para conceder acesso..."
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="flex-1 bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none"
              />
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none w-full md:w-48"
              >
                <option value="visitante">Visitante</option>
                <option value="operador">Operador</option>
                <option value="auditor">Auditor</option>
                <option value="gestor">Gestor</option>
                <option value="admin">Admin</option>
              </select>
              <button 
                onClick={addPreApproved}
                disabled={!newEmail}
                className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold shadow-md hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
              >
                + Adicionar Acesso
              </button>
            </div>

            {preApproved.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-4">Usuários com Acesso Prévio</h4>
                <div className="flex flex-col gap-2">
                  {preApproved.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-4 bg-surface-container-low rounded-xl border border-outline-variant">
                      <div className="flex items-center gap-4">
                        <span className="font-medium text-on-surface"><PrivateValue value={p.email} /></span>
                        <span className="text-[10px] uppercase font-bold px-2 py-1 bg-secondary-container text-on-secondary-container rounded">
                          {p.role}
                        </span>
                      </div>
                      <button 
                        onClick={() => deletePreApproved(p.id)}
                        className="text-on-surface-variant hover:text-error transition-colors p-2"
                        title="Remover acesso"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50 border-b border-outline-variant max-w-full">
                    <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Usuário</th>
                    <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">E-mail</th>
                    <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
                    <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Função</th>
                    <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider min-w-[200px]">Acesso às Telas</th>
                    <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-on-surface-variant">
                        Carregando usuários...
                      </td>
                    </tr>
                  ) : (
                    users.map(u => (
                      <tr key={u.uid} className="hover:bg-surface-container-low/20 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {u.photoURL ? (
                              <img 
                                src={u.photoURL} 
                                alt={u.name || u.email} 
                                className={`w-8 h-8 rounded-full object-cover border border-outline-variant shadow-sm transition-all duration-300 ${isPrivacyMode ? 'blur-[6px]' : ''}`}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center border border-outline-variant shadow-sm overflow-hidden">
                                <span className="material-symbols-outlined text-[20px]">person</span>
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="font-bold text-sm text-on-surface leading-none"><PrivateValue value={u.name || 'Sem Nome'} /></span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-sm text-on-surface-variant"><PrivateValue value={u.email} /></td>
                        <td className="p-4">
                          <button
                            onClick={() => toggleStatus(u)}
                            disabled={userData.uid === u.uid}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                              u.isActive 
                                ? 'bg-success-container/30 text-success hover:bg-success-container disabled:opacity-50' 
                                : 'bg-error-container/30 text-error hover:bg-error-container disabled:opacity-50'
                            }`}
                          >
                            {u.isActive ? 'Ativo' : 'Bloqueado'}
                          </button>
                        </td>
                        <td className="p-4">
                          <select 
                            value={u.role}
                            onChange={(e) => updateRole(u, e.target.value)}
                            disabled={userData.uid === u.uid}
                            className="bg-surface-container-low border border-outline-variant rounded-md text-sm px-2 py-1 focus:ring-primary outline-none disabled:opacity-50"
                          >
                            <option value="visitante">Visitante</option>
                            <option value="operador">Operador</option>
                            <option value="auditor">Auditor</option>
                            <option value="gestor">Gestor</option>
                            <option value="admin">Admin</option>
                          </select>
                          {u.role === 'visitante' && u.expiresAt && (
                            <Countdown expiresAt={u.expiresAt} onExtend={() => handleExtendVisitor(u)} />
                          )}
                        </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-2">
                          {u.role?.toLowerCase() === 'admin' ? (
                            <span className="text-xs font-medium text-primary bg-primary-container px-2 py-1 rounded">Acesso Total</span>
                          ) : (
                            availableScreens.map(screen => (
                              <button
                                key={screen.path}
                                onClick={() => toggleScreenAccess(u, screen.path)}
                                className={`text-[10px] px-2 py-1 rounded font-bold border transition-colors ${
                                  (u.allowedScreens || []).includes(screen.path)
                                    ? 'bg-secondary-container text-on-secondary-container border-secondary-container'
                                    : 'bg-transparent text-outline border-outline hover:border-on-surface-variant'
                                }`}
                              >
                                {screen.label}
                              </button>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          {deletingId === u.uid ? (
                            <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                              <button 
                                onClick={() => setDeletingId(null)} 
                                className="px-2 py-1 text-[10px] font-bold text-on-surface-variant hover:bg-surface-container-low rounded transition-all"
                              >
                                Cancelar
                              </button>
                              <button 
                                onClick={() => deleteUser(u.uid)} 
                                className="px-2 py-1 text-[10px] font-bold bg-error text-on-error rounded shadow-sm hover:opacity-90 transition-all"
                              >
                                {u.isActive ? 'Confirmar' : 'Confirmar Recusa'}
                              </button>
                            </div>
                          ) : (
                            userData.uid !== u.uid && (
                              <div className="flex items-center gap-1">
                                {!u.isActive && (
                                  <button 
                                    onClick={() => setDeletingId(u.uid)}
                                    className="px-2 py-1 text-[10px] font-bold text-error hover:bg-error/10 border border-error/20 rounded transition-all flex items-center gap-1"
                                    title="Recusar Acesso"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">person_remove</span>
                                    RECUSAR
                                  </button>
                                )}
                                <button 
                                  onClick={() => setDeletingId(u.uid)}
                                  className="text-on-surface-variant hover:text-error hover:bg-error/10 p-1.5 rounded-full transition-all"
                                  title="Excluir Usuário"
                                >
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {activeTab === 'obras' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-outline-variant bg-surface-container-low/50">
              <h3 className="font-bold text-on-surface text-sm uppercase tracking-wider">Obras Cadastradas</h3>
            </div>
            <div className="divide-y divide-outline-variant">
              {works.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant">Nenhuma obra cadastrada.</div>
              ) : (
                works.map(work => (
                  <div key={work.id} className="p-4 flex justify-between items-center hover:bg-surface-container-low/20 transition-colors">
                    <span className="font-semibold text-on-surface">{work.name}</span>
                    <div className="flex items-center gap-2">
                      {deletingId === work.id ? (
                        <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                          <button onClick={() => setDeletingId(null)} className="px-3 py-1 text-xs font-bold text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-all">Cancelar</button>
                          <button onClick={() => deleteWork(work.id)} className="px-3 py-1 text-xs font-bold bg-error text-on-error rounded-lg shadow-sm hover:opacity-90 transition-all">Confirmar</button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setDeletingId(work.id)}
                          className="text-error hover:bg-error/10 p-2 rounded-full transition-all"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'veiculos' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-outline-variant bg-surface-container-low/50">
              <h3 className="font-bold text-on-surface text-sm uppercase tracking-wider">Veículos Cadastrados</h3>
            </div>
            <div className="divide-y divide-outline-variant">
              {vehicles.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant">Nenhum veículo cadastrado.</div>
              ) : (
                vehicles.map(v => (
                  <div key={v.id} className="p-4 flex justify-between items-center hover:bg-surface-container-low/20 transition-colors">
                    <span className="font-semibold text-on-surface"><PrivateValue value={v.plate} /></span>
                    <div className="flex items-center gap-2">
                      {deletingId === v.id ? (
                        <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                          <button onClick={() => setDeletingId(null)} className="px-3 py-1 text-xs font-bold text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-all">Cancelar</button>
                          <button onClick={() => deleteVehicle(v.id)} className="px-3 py-1 text-xs font-bold bg-error text-on-error rounded-lg shadow-sm hover:opacity-90 transition-all">Confirmar</button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setDeletingId(v.id)}
                          className="text-error hover:bg-error/10 p-2 rounded-full transition-all"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'motoristas' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-outline-variant bg-surface-container-low/50">
              <h3 className="font-bold text-on-surface text-sm uppercase tracking-wider">Motoristas Cadastrados</h3>
            </div>
            <div className="divide-y divide-outline-variant">
              {drivers.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant">Nenhum motorista cadastrado.</div>
              ) : (
                drivers.map(d => (
                  <div key={d.id} className="p-4 flex justify-between items-center hover:bg-surface-container-low/20 transition-colors">
                    <span className="font-semibold text-on-surface"><PrivateValue value={d.name} /></span>
                    <div className="flex items-center gap-2">
                      {deletingId === d.id ? (
                        <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                          <button onClick={() => setDeletingId(null)} className="px-3 py-1 text-xs font-bold text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-all">Cancelar</button>
                          <button onClick={() => deleteDriver(d.id)} className="px-3 py-1 text-xs font-bold bg-error text-on-error rounded-lg shadow-sm hover:opacity-90 transition-all">Confirmar</button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setDeletingId(d.id)}
                          className="text-error hover:bg-error/10 p-2 rounded-full transition-all"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'status' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-outline-variant bg-surface-container-low/50">
              <h3 className="font-bold text-on-surface text-sm uppercase tracking-wider">Status Cadastrados</h3>
            </div>
            <div className="divide-y divide-outline-variant">
              {statuses.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant">Nenhum status cadastrado.</div>
              ) : (
                statuses.map(s => (
                  <div key={s.id} className="p-4 flex justify-between items-center hover:bg-surface-container-low/20 transition-colors">
                    <span className="font-semibold text-on-surface">{s.name}</span>
                    <div className="flex items-center gap-2">
                      {deletingId === s.id ? (
                        <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                          <button onClick={() => setDeletingId(null)} className="px-3 py-1 text-xs font-bold text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-all">Cancelar</button>
                          <button onClick={() => deleteStatus(s.id)} className="px-3 py-1 text-xs font-bold bg-error text-on-error rounded-lg shadow-sm hover:opacity-90 transition-all">Confirmar</button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setDeletingId(s.id)}
                          className="text-error hover:bg-error/10 p-2 rounded-full transition-all"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant p-6 max-w-lg w-full animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-on-surface text-capitalize">Importar {activeTab}</h3>
              <button onClick={() => setShowImport(false)} className="text-on-surface-variant hover:text-error transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <p className="text-sm text-on-surface-variant mb-4">Insira um nome por linha para realizar o cadastro em lote.</p>
            
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`Exemplo:\n${activeTab === 'veiculos' ? 'ABC-1234' : 'Novo Item'}\n${activeTab === 'veiculos' ? 'XYZ-5678' : 'Outro Item'}`}
              className="w-full h-48 bg-surface-container-low border border-outline-variant rounded-xl p-4 text-sm focus:ring-2 focus:ring-primary outline-none resize-none mb-6 font-mono"
            />
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowImport(false)}
                className="px-6 py-2.5 text-on-surface-variant font-bold hover:bg-surface-container rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (activeTab === 'obras') saveWorksBatch();
                  else if (activeTab === 'veiculos') saveVehiclesBatch();
                  else if (activeTab === 'motoristas') saveDriversBatch();
                  else if (activeTab === 'status') saveStatusesBatch();
                }}
                disabled={isSaving || !importText.trim()}
                className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold shadow-lg hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">done_all</span>
                )}
                {isSaving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
