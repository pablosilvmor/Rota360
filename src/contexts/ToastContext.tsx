import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logAudit } from '../lib/audit';

type ToastContextType = {
  showUndoToast: (message: string, onUndo: () => Promise<void>) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const windowToastManager = {
  showUndoToast: null as ((message: string, onUndo: () => Promise<void>) => void) | null
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; onUndo: () => Promise<void> } | null>(null);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const showUndoToast = (message: string, onUndo: () => Promise<void>) => {
    if (timeoutId) clearTimeout(timeoutId);
    setToast({ message, onUndo });
    
    const id = setTimeout(() => {
      setToast(null);
    }, 8000);
    setTimeoutId(id);
  };

  windowToastManager.showUndoToast = showUndoToast;

  const handleUndo = async () => {
    if (toast) {
      if (timeoutId) clearTimeout(timeoutId);
      await toast.onUndo();
      setToast(null);
    }
  };

  return (
    <ToastContext.Provider value={{ showUndoToast }}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 bg-surface-container-highest border border-outline-variant rounded-xl shadow-2xl p-4 flex items-center gap-4 text-on-surface"
          >
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={handleUndo}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold shadow-md hover:opacity-90 transition-all ml-2"
            >
              DESFAZER
            </button>
            <button 
              onClick={() => {
                if (timeoutId) clearTimeout(timeoutId);
                setToast(null);
              }}
              className="p-1 text-on-surface-variant hover:bg-surface-container/50 rounded-full transition-colors ml-2"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
