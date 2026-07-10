const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

const target = `      margin: { top: 45, bottom: 30, left: 8, right: 8 },`;
const replacement = `      margin: { top: 45, bottom: 30, left: 8, right: 8 },
      rowPageBreak: 'avoid',`;

code = code.replace(target, replacement);
fs.writeFileSync('src/pages/Reports.tsx', code);
console.log('Restored rowPageBreak');
