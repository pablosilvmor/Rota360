const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/pages');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  let modified = false;

  const replaceRegex = /deleteDoc\(\s*doc\(\s*db\s*,\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\)\s*\)/g;
  
  if (replaceRegex.test(content)) {
    content = content.replace(replaceRegex, "auditDelete('$1', $2, 'Geral')");
    modified = true;
  }

  if (modified) {
    if (!content.includes("import { auditDelete }")) {
      content = content.replace(/(import.*from 'firebase\/firestore';)/, "$1\nimport { auditDelete } from '../lib/audit';");
    }
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}

