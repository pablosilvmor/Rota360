const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

const target3 = `    id: 'telemetry',
    name: 'Veículos por Telemetria',
    collectionId: 'vehicles',
    icon: 'satellite_alt',
    columns: [
      { key: 'telemetryProvider', label: 'Provedor de Telemetria', renderer: (val) => val || 'Sem Telemetria' },
      { key: 'plate', label: 'Placa', renderer: (val) => <PrivateValue value={val} /> },
      { key: 'brand', label: 'Marca' },
      { key: 'model', label: 'Modelo' },
      { key: 'currentKM', label: 'KM Atual', align: 'center', renderer: (val: any, item: any) => (item?.currentKM || item?.odometer || 0).toLocaleString() },
      { key: 'lastSyncCheck', label: 'Última Atualização', align: 'center', renderer: (val: any) => val ? new Date(val).toLocaleString('pt-BR') : '-' },
      { key: 'status', label: 'Status' }
    ]`;

const replacement3 = `    id: 'telemetry',
    name: 'Veículos por Telemetria',
    collectionId: 'vehicles',
    icon: 'satellite_alt',
    columns: [
      { key: 'telemetryProvider', label: 'Provedor de Telemetria', renderer: (val) => val || 'Sem Telemetria' },
      { key: 'plate', label: 'Placa', renderer: (val) => <PrivateValue value={val} /> },
      { key: 'brand', label: 'Marca' },
      { key: 'model', label: 'Modelo' },
      { 
        key: 'costCenter', 
        label: 'Obra',
        renderer: (val: any) => {
          const clean = (v: any) => String(v || '').replace(/logística - região sul/gi, '').replace(/logístic a - região sul/gi, '').replace(/,? ?$/, '').trim();
          if (Array.isArray(val)) {
            return val.map(clean).filter(Boolean).join(', ') || '-';
          }
          return clean(val) || '-';
        }
      },
      { key: 'currentKM', label: 'KM Atual', align: 'center', renderer: (val: any, item: any) => (item?.currentKM || item?.odometer || 0).toLocaleString() },
      { key: 'lastSyncCheck', label: 'Última Atualização', align: 'center', renderer: (val: any) => val ? new Date(val).toLocaleString('pt-BR') : '-' },
      { key: 'status', label: 'Status' }
    ]`;

code = code.replace(target3, replacement3);
fs.writeFileSync('src/pages/Reports.tsx', code);
console.log('Patched Reports.tsx columns');
