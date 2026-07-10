const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

const target = `      bodyStyles: {
        minCellHeight: imageColIdx !== -1 ? 20 : undefined
      },`;

const replacement = `      bodyStyles: imageColIdx !== -1 ? { minCellHeight: 20 } : {},`;

code = code.replace(target, replacement);
fs.writeFileSync('src/pages/Reports.tsx', code);
console.log('Patched PDF bodyStyles');
