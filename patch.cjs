const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

const target = `              <div 
                ref={scrollRef}
                {...events}`;

const replacement = `              {selectedModule?.id === 'telemetry' && data.length > 0 && (
                <div className="p-6 border-b border-outline-variant/30 bg-surface-container-low/30">
                   <div className="flex gap-2 items-center mb-4">
                      <span className="material-symbols-outlined text-primary text-[20px]">insights</span>
                      <h4 className="font-bold text-on-surface text-sm uppercase tracking-wide">Resumo da Frota</h4>
                   </div>
                   <div className="flex flex-wrap gap-4">
                     {Object.entries(sortedData.reduce((acc, curr) => {
                         const prov = curr.telemetryProvider || 'Sem Telemetria';
                         acc[prov] = (acc[prov] || 0) + 1;
                         return acc;
                     }, {} as Record<string, number>)).sort((a: any, b: any) => b[1] - a[1]).map(([prov, count]: any) => (
                         <div key={prov} className="bg-white dark:bg-surface-container-low border border-outline-variant/50 rounded-2xl px-5 py-4 flex flex-col min-w-[140px] shadow-sm animate-in fade-in zoom-in-95 duration-300">
                            <span className="text-3xl font-black text-primary">{count}</span>
                            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mt-1 truncate">{prov}</span>
                         </div>
                     ))}
                   </div>
                </div>
              )}

              <div 
                ref={scrollRef}
                {...events}`;

code = code.replace(target, replacement);
fs.writeFileSync('src/pages/Reports.tsx', code);
console.log('Patched Reports.tsx');
