const fs = require('fs');
let code = fs.readFileSync('src/pages/Inspections.tsx', 'utf8');

// We will replace exportToPDF completely
code = code.replace(
  `const exportToPDF = async () => {`,
  `// Unified PDF generation
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportConfig, setExportConfig] = useState({
    inspection: true,
    checklist: false,
    maintenance: false,
    date: new Date().toISOString().split('T')[0]
  });

  const exportToPDF = async () => {
    setShowExportModal(true);
  };

  const confirmExportUnifiedPDF = async () => {
    setShowExportModal(false);`
);

fs.writeFileSync('src/pages/Inspections.tsx', code);
