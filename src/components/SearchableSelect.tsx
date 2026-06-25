import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Option {
  value: string;
  label: string;
  imageUrl?: string;
}

interface SearchableSelectProps {
  label?: string;
  placeholder: string;
  options: Option[];
  value: string | string[];
  onChange: (val: any) => void;
  error?: string;
  className?: string;
  size?: "sm" | "md";
  multiple?: boolean;
  icon?: string;
  forceLightBg?: boolean;
}

export function SearchableSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  error,
  className = "",
  size = "md",
  multiple = false,
  icon,
  forceLightBg = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterTerm, setFilterTerm] = useState("");
  const [direction, setDirection] = useState<"down" | "up">("down");
  const containerRef = useRef<HTMLDivElement>(null);

  // Add missing values to uniqueOptions so they can be rendered and deselected
  let allOptions = [...options];
  if (multiple) {
    (value as string[]).forEach((v) => {
      if (!allOptions.find((o) => o.value === v)) {
        allOptions.push({ value: v, label: v });
      }
    });
  } else if (value && !allOptions.find((o) => o.value === value)) {
    allOptions.push({ value: value as string, label: value as string });
  }

  const uniqueOptions = allOptions.filter(
    (opt, index, self) => self.findIndex((o) => o.value === opt.value) === index
  );

  const selectedOption = multiple
    ? undefined
    : uniqueOptions.find((o) => o.value === value);
  const selectedOptions = multiple
    ? (value as string[]).map(v => uniqueOptions.find((o) => o.value === v)!)
    : [];

  const filteredOptions = uniqueOptions.filter(
    (o) =>
      o.label.toLowerCase().includes(filterTerm.toLowerCase()) ||
      o.value.toLowerCase().includes(filterTerm.toLowerCase()),
  );

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < 300 && spaceAbove > spaceBelow) {
        setDirection("up");
      } else {
        setDirection("down");
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const heightClass =
    size === "sm"
      ? "h-[36px] px-3 py-1 text-[13px]"
      : "h-[50px] px-4 py-3 text-base";

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-sm font-semibold text-on-surface-variant mb-2">
          {label}
        </label>
      )}
      <div
        className={`w-full ${forceLightBg ? "!bg-white dark:!bg-white" : "!bg-white dark:!bg-surface-container"} border ${error ? "border-error" : isOpen ? "border-primary ring-2 ring-primary/20" : "border-outline-variant"} rounded-lg ${heightClass} cursor-pointer flex items-center justify-between hover:border-primary transition-all shadow-sm`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div
          className={`flex items-center gap-3 truncate ${(!multiple && selectedOption) || (multiple && selectedOptions.length > 0) ? (forceLightBg ? "text-slate-800 dark:text-slate-800 font-medium" : "text-on-surface font-medium") : (forceLightBg ? "text-slate-400 dark:text-slate-400" : "text-on-surface-variant/50")}`}
        >
          {icon && (
             <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
          )}
          {!multiple && selectedOption?.imageUrl && (
            <img
              src={selectedOption.imageUrl}
              alt=""
              className="w-6 h-6 object-contain rounded drop-shadow-sm bg-white"
            />
          )}
          <span className="truncate">
            {!multiple && selectedOption
              ? selectedOption.label
              : multiple && selectedOptions.length > 0
                ? selectedOptions.map((o) => o.label).join(", ")
                : placeholder}
          </span>
        </div>
        <span
          className={`material-symbols-outlined ${forceLightBg ? "text-slate-500" : "text-on-surface-variant"} ${size === "sm" ? "text-[18px]" : "text-[20px]"} transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          expand_more
        </span>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{
              opacity: 0,
              y: direction === "down" ? -10 : 10,
              scale: 0.95,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: direction === "down" ? -10 : 10,
              scale: 0.95,
            }}
            transition={{ duration: 0.1 }}
            className={`absolute left-0 right-0 ${direction === "down" ? "top-[calc(100%+4px)]" : "bottom-[calc(100%+4px)]"} ${forceLightBg ? "!bg-white dark:!bg-white" : "!bg-white dark:!bg-surface-container-high"} border border-outline-variant dark:border-white/10 rounded-xl shadow-2xl z-[1000] overflow-hidden flex flex-col max-h-72 ring-1 ring-black/5`}
          >
            <div className={`p-3 border-b border-outline-variant dark:border-white/10 ${forceLightBg ? "!bg-white dark:!bg-white" : "!bg-white dark:!bg-surface-container"} sticky top-0`}>
              <div className="relative">
                <span className={`material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 ${forceLightBg ? "text-slate-400" : "text-on-surface-variant"} text-[20px]`}>
                  search
                </span>
                <input
                  autoFocus
                  type="text"
                  className={`w-full ${forceLightBg ? "!bg-white dark:!bg-white text-slate-800 dark:text-slate-800" : "!bg-white dark:bg-surface-variant/30 text-on-surface"} border border-outline-variant dark:border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-all`}
                  placeholder="Pesquisar..."
                  value={filterTerm}
                  onChange={(e) => setFilterTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className={`overflow-y-auto py-2 scroll-smooth ${forceLightBg ? "!bg-white dark:!bg-white" : "!bg-white dark:!bg-surface-container-high"}`}>
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => (
                  <div
                    key={opt.value}
                    className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-primary/10 transition-colors flex items-center justify-between group ${(!multiple && value === opt.value) || (multiple && (value as string[]).includes(opt.value)) ? "bg-primary/5 dark:bg-primary/10 font-bold text-primary dark:text-blue-400" : (forceLightBg ? "text-slate-700 dark:text-slate-700 hover:text-primary dark:hover:text-primary" : "text-on-surface")}`}
                    onClick={() => {
                      if (multiple) {
                        const arr = (value as string[]) || [];
                        if (arr.includes(opt.value)) {
                          onChange(arr.filter((v) => v !== opt.value));
                        } else {
                          onChange([...arr, opt.value]);
                        }
                      } else {
                        onChange(opt.value);
                        setIsOpen(false);
                      }
                      setFilterTerm("");
                    }}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {opt.imageUrl && (
                        <img
                          src={opt.imageUrl}
                          alt=""
                          className="w-8 h-8 object-contain rounded bg-white border border-outline-variant/30 drop-shadow-sm"
                        />
                      )}
                      <span>{opt.label}</span>
                    </div>
                    {((!multiple && value === opt.value) ||
                      (multiple &&
                        (value as string[]).includes(opt.value))) && (
                      <span className="material-symbols-outlined text-primary text-[18px]">
                        check
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center">
                  <span className="material-symbols-outlined text-on-surface-variant/30 text-4xl mb-2">
                    search_off
                  </span>
                  <p className="text-xs text-on-surface-variant font-medium">
                    Nenhum resultado encontrado
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <p className="mt-1 text-[10px] text-error font-semibold uppercase ml-1">
          {error}
        </p>
      )}
    </div>
  );
}
