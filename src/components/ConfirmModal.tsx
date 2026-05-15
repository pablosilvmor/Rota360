import { motion } from 'framer-motion';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar'
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-error-container text-on-error-container rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[32px]">warning</span>
          </div>
          <h3 className="text-xl font-semibold text-on-surface mb-2">{title}</h3>
          <p className="text-sm text-on-surface-variant">{message}</p>
        </div>
        <div className="p-6 bg-surface-container-low border-t border-outline-variant flex gap-4">
          <button 
            onClick={onCancel} 
            className="flex-1 px-4 py-2 border border-outline-variant rounded-lg font-semibold hover:bg-surface-container transition-colors text-on-surface"
          >
            {cancelLabel}
          </button>
          <button 
            onClick={onConfirm} 
            className="flex-1 px-4 py-2 bg-error text-white rounded-lg font-semibold hover:bg-error/90 transition-colors shadow-sm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
