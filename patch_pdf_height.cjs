const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

const target = `      styles: {
        fontSize: isFleetReport ? 7.5 : 9,
        cellPadding: 3,
        valign: 'middle'
      },`;
const replacement = `      styles: {
        fontSize: isFleetReport ? 7.5 : 9,
        cellPadding: 3,
        valign: 'middle',
        minCellHeight: 15
      },`;

code = code.replace(target, replacement);
fs.writeFileSync('src/pages/Reports.tsx', code);
console.log('Patched minCellHeight');
