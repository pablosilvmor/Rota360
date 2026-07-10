const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

code = code.replace(/rowPageBreak: 'avoid',/g, '');

fs.writeFileSync('src/pages/Reports.tsx', code);
console.log('Removed rowPageBreak');
