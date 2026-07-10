const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

const target = `      matchesStatus = filterStatus.length === 0 || filterStatus.includes('Todos os Status') || 
         filterStatus.includes(item.status);
    }`;

const replacement = `      matchesStatus = filterStatus.length === 0 || filterStatus.includes('Todos os Status') || 
         filterStatus.includes(item.status);
    }
    if (selectedModule?.id === 'telemetry') {
      const provider = item.telemetryProvider || 'Sem Telemetria';
      matchesProvider = filterProvider.length === 0 || filterProvider.includes('Todos os Provedores') || filterProvider.includes(provider);
    }`;

code = code.replace(target, replacement);
fs.writeFileSync('src/pages/Reports.tsx', code);
console.log('Patched');
