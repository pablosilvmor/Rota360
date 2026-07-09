const fs = require('fs');
let code = fs.readFileSync('src/pages/Inspections.tsx', 'utf8');

// fix finalImgDataUrl Promise
code = code.replace('reader.result);', 'reader.result as string);');
code = code.replace('reader.result);', 'reader.result as string);'); // there are two FileReader results

// fix map(d => ({ id: d.id, ...d.data() }))
code = code.replace(/snapOs\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \}\)\)/g, 'snapOs.docs.map(d => ({ id: d.id, ...d.data() } as any))');

// fix records fallback
code = code.replace(
  'const record = records[item.id] || { conformity: "", serviceExecuted: "", lastMaintenanceKM: 0, nextMaintenanceKM: 0, lastMaintenanceDate: null, nextMaintenanceDate: null };',
  'const record = (records[item.id] || { conformity: "", serviceExecuted: "", lastMaintenanceKM: 0, nextMaintenanceKM: 0, lastMaintenanceDate: null, nextMaintenanceDate: null, id: "", itemId: "" }) as InspectionRecord;'
);

// second records fallback
code = code.replace(
  'const record = records[item.id] || { lastMaintenanceKM: 0 };',
  'const record = (records[item.id] || { lastMaintenanceKM: 0, conformity: "", serviceExecuted: "", nextMaintenanceKM: 0, id: "", itemId: "" }) as InspectionRecord;'
);

// fix pdf.internal.getNumberOfPages()
code = code.replace('pdf.internal.getNumberOfPages();', '(pdf as any).internal.getNumberOfPages();');

// fix pdf.lastAutoTable
code = code.replace('pdf.lastAutoTable?.finalY', '(pdf as any).lastAutoTable?.finalY');

fs.writeFileSync('src/pages/Inspections.tsx', code);
