import fs from 'fs';
const content = fs.readFileSync('src/pages/Drivers.tsx', 'utf8').split('\n');
content.splice(473, 16); // lines 474 to 489 (0-indexed: 473 to 488)
fs.writeFileSync('src/pages/Drivers.tsx', content.join('\n'));
