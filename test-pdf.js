const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable").default || require("jspdf-autotable");

const doc = new jsPDF('landscape');
autoTable(doc, {
  head: [['A', 'B']],
  body: [
    ['1', '2'],
    ['3', '4'],
    ['5', '6']
  ],
  styles: {
    fontSize: 7.5,
    cellPadding: 3,
    valign: 'middle'
  }
});
doc.save("test.pdf");
