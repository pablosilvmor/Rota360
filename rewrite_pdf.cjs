const fs = require('fs');
let code = fs.readFileSync('src/pages/Inspections.tsx', 'utf8');

// The replacement:
const replacement = `  const [showExportModal, setShowExportModal] = useState(false);
  const [exportConfig, setExportConfig] = useState({
    inspection: true,
    checklist: false,
    maintenance: false,
    date: new Date().toISOString().split('T')[0]
  });

  const exportToPDF = async () => {
    setShowExportModal(true);
  };

  const confirmExportUnifiedPDF = async () => {`;

code = code.replace(`  const exportToPDF = async () => {`, replacement);

fs.writeFileSync('src/pages/Inspections.tsx', code);
