const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

const target2 = `      { key: 'status', label: 'Status' },
      { key: 'observation', label: 'Observações', renderer: (val: any, item: any) => item?.observation || item?.observations || val || '-' },
    ]
  },
  {
    id: 'drivers',`;

const replacement2 = `      { key: 'status', label: 'Status' },
      { key: 'observation', label: 'Observações', renderer: (val: any, item: any) => item?.observation || item?.observations || val || '-' },
    ]
  },
  {
    id: 'telemetry',
    name: 'Veículos por Telemetria',
    collectionId: 'vehicles',
    icon: 'satellite_alt',
    columns: [
      { key: 'telemetryProvider', label: 'Provedor de Telemetria', renderer: (val) => val || 'Sem Telemetria' },
      { key: 'plate', label: 'Placa', renderer: (val) => <PrivateValue value={val} /> },
      { key: 'brand', label: 'Marca' },
      { key: 'model', label: 'Modelo' },
      { key: 'currentKM', label: 'KM Atual', align: 'center', renderer: (val: any, item: any) => (item?.currentKM || item?.odometer || 0).toLocaleString() },
      { key: 'lastSyncCheck', label: 'Última Atualização', align: 'center', renderer: (val: any) => val ? new Date(val).toLocaleDateString('pt-BR') : '-' },
      { key: 'status', label: 'Status' }
    ]
  },
  {
    id: 'drivers',`;

code = code.replace(target2, replacement2);
fs.writeFileSync('src/pages/Reports.tsx', code);
console.log('Patched Reports.tsx module');
