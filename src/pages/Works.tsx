import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

interface Work {
  id: string;
  name: string;
  createdAt: number;
}

export function Works() {
  const { userData } = useAuth();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    // Listen to works
    const qWorks = query(collection(db, 'works'));
    const unsubscribeWorks = onSnapshot(
      qWorks,
      (snapshot) => {
        const worksData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Work[];
        // Natural sort (handles numbers correctly)
        const sorted = [...worksData].sort((a, b) => 
          (a.name || "").localeCompare((b.name || ""), undefined, { numeric: true, sensitivity: 'base' })
        );
        setWorks(sorted);
        setLoading(false);
      },
      (error) => {
        console.error("Works listener error:", error);
        handleFirestoreError(error, OperationType.LIST, 'works');
        setLoading(false);
      }
    );

    return () => unsubscribeWorks();
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-[32px] font-bold text-on-surface tracking-tight mb-2">Gerenciamento de Obras</h2>
          <p className="text-on-surface-variant font-medium">Cadastre e gerencie os locais de operação da Bemon.</p>
        </div>
      </div>

      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {!showImport ? (
          <button 
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold shadow-sm hover:opacity-90 transition-all"
          >
            <span className="material-symbols-outlined">add</span>
            Novo Cadastro
          </button>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-on-surface">Importar Lista (um item por linha)</h3>
              <button onClick={() => setShowImport(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Cole sua lista aqui..."
              className="w-full h-40 bg-surface-container-low border border-outline-variant rounded-xl p-4 text-on-surface resize-none focus:ring-2 focus:ring-primary outline-none transition-all mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowImport(false)}
                className="px-6 py-2 text-on-surface-variant font-bold hover:bg-surface-container-low rounded-lg transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={saveWorksBatch}
                disabled={isSaving || !importText.trim()}
                className="px-6 py-2 bg-primary text-on-primary rounded-lg font-bold shadow-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? 'Salvando...' : 'Salvar Lista'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-outline-variant bg-surface-container-low/50">
            <h3 className="font-bold text-on-surface text-sm uppercase tracking-wider">Obras Cadastradas</h3>
          </div>
          <div className="divide-y divide-outline-variant">
            {loading ? (
              <div className="p-8 text-center text-on-surface-variant">Carregando obras...</div>
            ) : works.length === 0 ? (
              <div className="p-8 text-center text-on-surface-variant">Nenhuma obra cadastrada.</div>
            ) : (
              works.map(work => (
                <div key={work.id} className="p-4 flex justify-between items-center hover:bg-surface-container-low/20 transition-colors">
                  <span className="font-semibold text-on-surface">{work.name}</span>
                  <div className="flex items-center gap-2">
                    {deletingId === work.id ? (
                      <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                        <button 
                          onClick={() => setDeletingId(null)}
                          className="px-3 py-1 text-xs font-bold text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-all"
                        >
                          Cancelar
                        </button>
                        <button 
                          onClick={() => deleteWork(work.id)}
                          className="px-3 py-1 text-xs font-bold bg-error text-on-error rounded-lg shadow-sm hover:opacity-90 transition-all"
                        >
                          Confirmar
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setDeletingId(work.id)}
                        className="text-error hover:bg-error/10 p-2 rounded-full transition-all flex items-center justify-center"
                        title="Excluir"
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
    </div>
  );
}
