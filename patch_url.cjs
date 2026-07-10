const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

const target1 = `              if (url.includes('solusat')) {`;
const rep1 = `              if (url.toLowerCase().includes('solusat') || provider.name.toLowerCase().includes('solusat')) {`;

const target2 = `              } else if (url.includes('gaussfleet')) {`;
const rep2 = `              } else if (url.toLowerCase().includes('gaussfleet') || provider.name.toLowerCase().includes('gaussfleet')) {`;

code = code.replace(target1, rep1);
code = code.replace(target2, rep2);
fs.writeFileSync('src/pages/Reports.tsx', code);
console.log('Patched URL conditions');
