const fs = require('fs');
let code = fs.readFileSync('src/pages/Inspections.tsx', 'utf8');

const modalUI = `    <>
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface dark:bg-surface-container rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-outline-variant/30"
            >
              <div className="px-6 py-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low/50">
                <h3 className="text-lg font-bold text-on-surface">Exportar PDF Unificado</h3>
                <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <p className="text-sm text-on-surface-variant mb-4">Selecione quais documentos deseja incluir no PDF unificado:</p>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant/50 hover:bg-surface-container-low/50 cursor-pointer transition-colors">
                      <input type="checkbox" className="w-5 h-5 rounded border-outline text-primary focus:ring-primary" checked={exportConfig.inspection} onChange={e => setExportConfig({...exportConfig, inspection: e.target.checked})} />
                      <div>
                        <p className="font-semibold text-on-surface text-sm">Inspeção (Estado Atual)</p>
                        <p className="text-xs text-on-surface-variant">O status técnico da frota com base na última auditoria.</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant/50 hover:bg-surface-container-low/50 cursor-pointer transition-colors">
                      <input type="checkbox" className="w-5 h-5 rounded border-outline text-primary focus:ring-primary" checked={exportConfig.checklist} onChange={e => setExportConfig({...exportConfig, checklist: e.target.checked})} />
                      <div>
                        <p className="font-semibold text-on-surface text-sm">Histórico de Checklist</p>
                        <p className="text-xs text-on-surface-variant">O registro diário do checklist realizado numa data específica.</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant/50 hover:bg-surface-container-low/50 cursor-pointer transition-colors">
                      <input type="checkbox" className="w-5 h-5 rounded border-outline text-primary focus:ring-primary" checked={exportConfig.maintenance} onChange={e => setExportConfig({...exportConfig, maintenance: e.target.checked})} />
                      <div>
                        <p className="font-semibold text-on-surface text-sm">Manutenção (OS Automática)</p>
                        <p className="text-xs text-on-surface-variant">A OS automática vinculada ao checklist selecionado.</p>
                      </div>
                    </label>
                  </div>
                </div>

                {(exportConfig.checklist || exportConfig.maintenance) && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Data de Referência (Checklist/OS)</label>
                    <input
                      type="date"
                      value={exportConfig.date}
                      onChange={e => setExportConfig({...exportConfig, date: e.target.value})}
                      className="w-full bg-surface-container-lowest dark:bg-surface-variant/30 border border-outline-variant dark:border-outline/50 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>
                )}
              </div>
              <div className="p-4 bg-surface-container-low border-t border-outline-variant/30 flex justify-end gap-3">
                <button onClick={() => setShowExportModal(false)} className="px-5 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-all">
                  Cancelar
                </button>
                <button onClick={confirmExportUnifiedPDF} disabled={isExporting || (!exportConfig.inspection && !exportConfig.checklist && !exportConfig.maintenance)} className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold shadow-sm hover:shadow hover:opacity-90 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                  {isExporting ? "Gerando..." : "Exportar PDF"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div className="space-y-6">`;

const modalToRemoveStr = `    <>
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface dark:bg-surface-container rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-outline-variant/30"
            >
              <div className="px-6 py-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low/50">
                <h3 className="text-lg font-bold text-on-surface">Exportar PDF Unificado</h3>
                <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <p className="text-sm text-on-surface-variant mb-4">Selecione quais documentos deseja incluir no PDF unificado:</p>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant/50 hover:bg-surface-container-low/50 cursor-pointer transition-colors">
                      <input type="checkbox" className="w-5 h-5 rounded border-outline text-primary focus:ring-primary" checked={exportConfig.inspection} onChange={e => setExportConfig({...exportConfig, inspection: e.target.checked})} />
                      <div>
                        <p className="font-semibold text-on-surface text-sm">Inspeção (Estado Atual)</p>
                        <p className="text-xs text-on-surface-variant">O status técnico da frota com base na última auditoria.</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant/50 hover:bg-surface-container-low/50 cursor-pointer transition-colors">
                      <input type="checkbox" className="w-5 h-5 rounded border-outline text-primary focus:ring-primary" checked={exportConfig.checklist} onChange={e => setExportConfig({...exportConfig, checklist: e.target.checked})} />
                      <div>
                        <p className="font-semibold text-on-surface text-sm">Histórico de Checklist</p>
                        <p className="text-xs text-on-surface-variant">O registro diário do checklist realizado numa data específica.</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant/50 hover:bg-surface-container-low/50 cursor-pointer transition-colors">
                      <input type="checkbox" className="w-5 h-5 rounded border-outline text-primary focus:ring-primary" checked={exportConfig.maintenance} onChange={e => setExportConfig({...exportConfig, maintenance: e.target.checked})} />
                      <div>
                        <p className="font-semibold text-on-surface text-sm">Manutenção (OS Automática)</p>
                        <p className="text-xs text-on-surface-variant">A OS automática vinculada ao checklist selecionado.</p>
                      </div>
                    </label>
                  </div>
                </div>

                {(exportConfig.checklist || exportConfig.maintenance) && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-sm font-semibold text-on-surface-variant mb-2">Data de Referência (Checklist/OS)</label>
                    <input
                      type="date"
                      value={exportConfig.date}
                      onChange={e => setExportConfig({...exportConfig, date: e.target.value})}
                      className="w-full bg-surface-container-lowest dark:bg-surface-variant/30 border border-outline-variant dark:border-outline/50 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>
                )}
              </div>
              <div className="p-4 bg-surface-container-low border-t border-outline-variant/30 flex justify-end gap-3">
                <button onClick={() => setShowExportModal(false)} className="px-5 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-all">
                  Cancelar
                </button>
                <button onClick={confirmExportUnifiedPDF} disabled={isExporting || (!exportConfig.inspection && !exportConfig.checklist && !exportConfig.maintenance)} className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold shadow-sm hover:shadow hover:opacity-90 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                  {isExporting ? "Gerando..." : "Exportar PDF"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div className="space-y-6">`;

// Remove from `Inspections()`
const replacePos = code.lastIndexOf(modalToRemoveStr);
if (replacePos !== -1) {
  code = code.substring(0, replacePos) + '    <div className="space-y-6">' + code.substring(replacePos + modalToRemoveStr.length);
}

// Add to `InspectionForm()`
// To find the right return:
// We look for `  if (loadingVehicle) {` -> this is in `InspectionForm`.
// Wait, `return (` of `InspectionForm` comes right after the final effects and handlers.
// The easiest is to find `  return (\n    <div className="bg-surface dark:bg-surface-container-lowest rounded-2xl` inside `InspectionForm`.
// Let's check where it is.
const formReturnIndex = code.indexOf(`  return (
    <div className="bg-surface dark:bg-surface-container-lowest rounded-2xl`);

if (formReturnIndex !== -1) {
  code = code.substring(0, formReturnIndex) + `  return (\n` + modalUI.replace('<div className="space-y-6">', '<div className="bg-surface dark:bg-surface-container-lowest rounded-2xl') + code.substring(formReturnIndex + 11 + `\n    <div className="bg-surface dark:bg-surface-container-lowest rounded-2xl`.length);
  // Also we need to close `</>` at the end of `InspectionForm`.
  const endOfFormIdx = code.indexOf('export function Inspections() {');
  const closingDiv = code.lastIndexOf('    </div>\n  );\n}', endOfFormIdx);
  if (closingDiv !== -1) {
     code = code.substring(0, closingDiv) + '    </div>\n    </>\n  );\n}' + code.substring(closingDiv + 15);
  }
}

fs.writeFileSync('src/pages/Inspections.tsx', code);
