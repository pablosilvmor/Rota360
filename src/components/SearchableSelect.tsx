import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  label?: string;
  placeholder: string;
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  error?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function SearchableSelect({ 
  label, 
  placeholder, 
  options, 
  value, 
  onChange,
  error,
  className = "",
  size = 'md'
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterTerm, setFilterTerm] = useState('');
  const [direction, setDirection] = useState<'down' | 'up'>('down');
  const containerRef = useRef<HTMLDivElement>(null);
  
  const selectedOption = options.find(o => o.value === value);
  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(filterTerm.toLowerCase()) ||
    o.value.toLowerCase().includes(filterTerm.toLowerCase())
  );

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      if (spaceBelow < 300 && spaceAbove > spaceBelow) {
        setDirection('up');
      } else {
        setDirection('down');
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const heightClass = size === 'sm' ? 'h-[36px] px-3 py-1 text-[13px]' : 'h-[50px] px-4 py-3 text-base';

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && <label className="block text-sm font-semibold text-on-surface-variant mb-2">{label}</label>}
      <div 
        className={`w-full bg-white border ${error ? 'border-error' : 'border-outline-variant'} rounded-lg ${heightClass} cursor-pointer flex items-center justify-between hover:border-primary transition-colors shadow-sm`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={`truncate ${selectedOption ? 'text-on-surface font-medium' : 'text-on-surface-variant/50'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className={`material-symbols-outlined ${size === 'sm' ? 'text-[18px]' : 'text-[20px]'} transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: direction === 'down' ? -10 : 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: direction === 'down' ? -10 : 10, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className={`absolute left-0 right-0 ${direction === 'down' ? 'top-[calc(100%+4px)]' : 'bottom-[calc(100%+4px)]'} bg-white border border-outline-variant rounded-xl shadow-2xl z-[100] overflow-hidden flex flex-col max-h-72 ring-1 ring-black/5`}
          >
            <div className="p-3 border-b border-outline-variant bg-surface-container-lowest sticky top-0">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                <input 
                  autoFocus
                  type="text"
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-all"
                  placeholder="Pesquisar..."
                  value={filterTerm}
                  onChange={(e) => setFilterTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="overflow-y-auto py-2 scroll-smooth">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => (
                  <div 
                    key={opt.value}
                    className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-primary/10 transition-colors flex items-center justify-between group ${value === opt.value ? 'bg-primary/5 font-bold text-primary' : 'text-on-surface'}`}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                      setFilterTerm('');
                    }}
                  >
                    <span className="flex-1">{opt.label}</span>
                    {value === opt.value && (
                      <span className="material-symbols-outlined text-primary text-[18px]">check</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center">
                  <span className="material-symbols-outlined text-on-surface-variant/30 text-4xl mb-2">search_off</span>
                  <p className="text-xs text-on-surface-variant font-medium">Nenhum resultado encontrado</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="mt-1 text-[10px] text-error font-semibold uppercase ml-1">{error}</p>}
    </div>
  );
}
