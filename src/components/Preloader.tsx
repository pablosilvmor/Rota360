import { motion } from 'framer-motion';

export function Preloader() {
  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-surface overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
        <div className="w-[800px] h-[800px] border-[100px] border-primary rounded-full" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02]">
        <div className="w-[1200px] h-[1200px] border-[100px] border-primary rounded-full" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Vehicle Container */}
        <div className="relative flex flex-col items-center">
          <motion.div 
            className="relative text-primary z-10"
            animate={{ y: [0, -10, 0], rotate: [0, -1, 1, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="material-symbols-outlined text-[96px] drop-shadow-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              local_shipping
            </span>
            
            {/* Speed Lines */}
            <motion.div 
              className="absolute top-[40%] -left-12 w-8 h-1.5 bg-primary rounded-full opacity-50"
              animate={{ x: [-40, 0], opacity: [0, 0.6, 0] }}
              transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
            />
            <motion.div 
              className="absolute top-[20%] -left-16 w-5 h-1.5 bg-primary rounded-full opacity-30"
              animate={{ x: [-60, 0], opacity: [0, 0.4, 0] }}
              transition={{ duration: 0.7, repeat: Infinity, ease: "linear", delay: 0.2 }}
            />
            <motion.div 
              className="absolute bottom-[30%] -left-8 w-10 h-1.5 bg-primary rounded-full opacity-40"
              animate={{ x: [-30, 0], opacity: [0, 0.5, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "linear", delay: 0.4 }}
            />
          </motion.div>

          {/* Shadow */}
          <motion.div 
            className="w-20 h-3 bg-on-surface/10 rounded-[100%] mt-3 filter blur-[4px]"
            animate={{ scale: [1, 0.8, 1], opacity: [0.4, 0.2, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        {/* Animated Road */}
        <div className="mt-10 relative w-64 h-1.5 overflow-hidden rounded-full">
           {/* We use a mask or just opacity fading to make the edges blend */}
           <div className="absolute inset-0 bg-gradient-to-r from-surface via-transparent to-surface z-10" />
           <motion.div 
             className="absolute left-0 top-0 h-full w-[200%] flex"
             animate={{ x: ['0%', '-50%'] }}
             transition={{ duration: 1, ease: 'linear', repeat: Infinity }}
           >
              {[...Array(12)].map((_, i) => (
                <div key={i} className="h-full w-12 flex items-center pr-4 shrink-0">
                   <div className="h-full w-full bg-primary/20 rounded-full" />
                </div>
              ))}
           </motion.div>
        </div>

        {/* Text */}
        <motion.div 
          className="mt-8 flex flex-col items-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <div className="flex items-center">
            <h2 className="text-xl font-black text-on-surface uppercase tracking-[0.2em] ml-2">
              CARREGANDO
            </h2>
            <div className="flex w-6 ml-1 mt-1">
              <motion.div className="w-1.5 h-1.5 bg-on-surface rounded-full mx-0.5" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} />
              <motion.div className="w-1.5 h-1.5 bg-on-surface rounded-full mx-0.5" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }} />
              <motion.div className="w-1.5 h-1.5 bg-on-surface rounded-full mx-0.5" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }} />
            </div>
          </div>
          <p className="mt-2 text-sm font-bold text-primary/60 tracking-widest uppercase">
            Preparando Frota
          </p>
        </motion.div>
      </div>
    </div>
  );
}
