const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

const target1 = `  const [filterWork, setFilterWork] = useLocalStorageState<string[]>('reports_filterWork', []);
  const [filterStatus, setFilterStatus] = useLocalStorageState<string[]>('reports_filterStatus', []);`;

const replacement1 = `  const [filterWork, setFilterWork] = useLocalStorageState<string[]>('reports_filterWork', []);
  const [filterStatus, setFilterStatus] = useLocalStorageState<string[]>('reports_filterStatus', []);
  const [filterProvider, setFilterProvider] = useLocalStorageState<string[]>('reports_filterProvider', []);`;

const target2 = `    let matchesWork = true;
    let matchesStatus = true;
    if (selectedModule?.id === 'vehicles' || selectedModule?.id === 'drivers' || selectedModule?.id === 'telemetry') {`;

const replacement2 = `    let matchesWork = true;
    let matchesStatus = true;
    let matchesProvider = true;
    if (selectedModule?.id === 'vehicles' || selectedModule?.id === 'drivers' || selectedModule?.id === 'telemetry') {`;

const target3 = `      matchesStatus = filterStatus.length === 0 || filterStatus.includes('Todos os Status') || 
         filterStatus.includes(item.status);
    }`;

const replacement3 = `      matchesStatus = filterStatus.length === 0 || filterStatus.includes('Todos os Status') || 
         filterStatus.includes(item.status);
    }
    if (selectedModule?.id === 'telemetry') {
      const provider = item.telemetryProvider || 'Sem Telemetria';
      matchesProvider = filterProvider.length === 0 || filterProvider.includes('Todos os Provedores') || filterProvider.includes(provider);
    }`;

const target4 = `    return matchesSearch && matchesWork && matchesStatus;
  });`;

const replacement4 = `    return matchesSearch && matchesWork && matchesStatus && matchesProvider;
  });`;

const target5 = `                  {(selectedModule?.id === 'vehicles' || selectedModule?.id === 'drivers') && (
                    <>
                      <MultiSelect 
                        label="Obras"`;

const replacement5 = `                  {(selectedModule?.id === 'vehicles' || selectedModule?.id === 'drivers' || selectedModule?.id === 'telemetry') && (
                    <>
                      {selectedModule?.id === 'telemetry' && (
                        <MultiSelect 
                          label="Provedor"
                          placeholder="Provedor de Telemetria"
                          options={[
                            { name: 'Todos os Provedores' },
                            { name: 'GaussFleet' },
                            { name: 'Solusat' },
                            { name: 'Sem Telemetria' }
                          ]}
                          selected={filterProvider}
                          onChange={setFilterProvider}
                        />
                      )}
                      <MultiSelect 
                        label="Obras"`;

const target6 = `                    <button 
                      onClick={() => {
                        setFilterWork([]);
                        setFilterStatus([]);
                        setReportSearchTerm('');
                      }}`;

const replacement6 = `                    <button 
                      onClick={() => {
                        setFilterWork([]);
                        setFilterStatus([]);
                        setFilterProvider([]);
                        setReportSearchTerm('');
                      }}`;

code = code.replace(target1, replacement1);
code = code.replace(target2, replacement2);
code = code.replace(target3, replacement3);
code = code.replace(target4, replacement4);
code = code.replace(target5, replacement5);
code = code.replace(target6, replacement6);

fs.writeFileSync('src/pages/Reports.tsx', code);
console.log('Patched filters');
