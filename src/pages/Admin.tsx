import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserData, useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

import { IntegrationsTab } from '../components/IntegrationsTab';

interface Work {
  id: string;
  name: string;
  createdAt: number;
}

export function Admin() {
  const { userData } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
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

  useEffect(() => {
    if (userData?.role?.toLowerCase() !== 'admin') {
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
      unsubscribeWorks();
      unsubscribeVehicles();
      unsubscribeDrivers();
      unsubscribeStatuses();
    };
  }, [userData]);

  if (userData?.role?.toLowerCase() !== 'admin') {
    return <Navigate to="/" replace />;
  }

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
        screens = ['/', '/fleet', '/maintenance', '/inspections', '/drivers', '/settings', '/admin', '/fuel', '/tracking', '/reports', '/checklist', '/works', '/suppliers', '/parts', '/fuel-stations'];
      } else if (newRole === 'gestor') {
        screens = ['/', '/fleet', '/maintenance', '/inspections', '/drivers', '/reports', '/fuel', '/tracking', '/works'];
      } else if (newRole === 'operador') {
        screens = ['/', '/inspections', '/checklist'];
      }
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        role: newRole,
        isActive: true, // Automatically activate user when role is assigned
        allowedScreens: screens,
        updatedAt: Date.now()
      });
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
    { path: '/admin', label: 'Admin' },
    { path: '/suppliers', label: 'Fornecedores' },
    { path: '/parts', label: 'Peças/Estoque' },
    { path: '/fuel-stations', label: 'Postos' },
  ];

  const tabs = [
    { id: 'obras', label: 'Obras' },
    { id: 'veiculos', label: 'Veículos' },
    { id: 'motoristas', label: 'Motoristas' },
    { id: 'status', label: 'Status' },
    { id: 'adm', label: 'ADM' },
    { id: 'integracoes', label: 'Integrações' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-[32px] font-bold text-on-surface tracking-tight mb-2">Central de Cadastros</h2>
          <p className="text-on-surface-variant font-medium">Controle o acesso e regras dos usuários no sistema Rota 360.</p>
        </div>
        {activeTab !== 'adm' && (
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

      {(activeTab === 'adm') && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/50 border-b border-outline-variant max-w-full">
                  <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Usuário</th>
                  <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">E-mail</th>
                  <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Função</th>
                  <th className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-wider min-w-[200px]">Acesso às Telas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-on-surface-variant">
                      Carregando usuários...
                    </td>
                  </tr>
                ) : (
                  users.map(u => (
                    <tr key={u.uid} className="hover:bg-surface-container-low/20 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-sm">
                            {u.name?.charAt(0).toUpperCase() || u.email.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-sm text-on-surface">{u.name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-on-surface-variant">{u.email}</td>
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
                          <option value="operador">Operador</option>
                          <option value="gestor">Gestor</option>
                          <option value="admin">Admin</option>
                        </select>
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
                    <span className="font-semibold text-on-surface">{v.plate}</span>
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
                    <span className="font-semibold text-on-surface">{d.name}</span>
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
