const fs = require('fs');

let code = fs.readFileSync('src/pages/Inspections.tsx', 'utf8');

const startStr = "const confirmExportUnifiedPDF = async () => {";
const endStr = "setIsExporting(false);\n    }\n  };";

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `const confirmExportUnifiedPDF = async () => {
    setIsExporting(true);
    setShowExportModal(false);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.setFont("helvetica");

      let hasPages = false;

      // Garantir que a imagem do veículo esteja carregada
      let finalImgDataUrl = vehicleImgDataUrl;
      if (!finalImgDataUrl && vehicle.imageUrl) {
        try {
          const imgUrl = vehicle.imageUrl;
          const proxyUrl = \`https://wsrv.nl/?url=\${encodeURIComponent(imgUrl)}&w=400&output=jpeg\`;
          const resp = await fetch(proxyUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            finalImgDataUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
          }
        } catch (e) {
          console.warn("Could not load image for PDF:", e);
        }
      }

      // Função helper para desenhar a Inspeção / Checklist
      const drawInspectionPage = async (isChecklistHistory) => {
        if (hasPages) {
           pdf.addPage();
        }
        
        let localHistoryKM = null;
        let localConcludedMaintenanceOrders = [];
        let dateLabel = isChecklistHistory ? exportConfig.date.split('-').reverse().join('/') : "-";

        if (isChecklistHistory) {
          // Fetch historical records for exportConfig.date
          const qKm = query(
            collection(db, "checklist_history"),
            where("vehicleId", "==", resolvedVehicleId),
            where("date", "==", exportConfig.date),
            where("status", "==", "Concluído"),
            orderBy("createdAt", "desc"),
            limit(1)
          );
          const snapKm = await getDocs(qKm);
          if (!snapKm.empty) {
            localHistoryKM = snapKm.docs[0].data().vehicleKM;
          }

          const qOs = query(
            collection(db, "maintenance"),
            where("vehicleId", "==", resolvedVehicleId)
          );
          const snapOs = await getDocs(qOs);
          const orders = snapOs.docs.map(d => ({ id: d.id, ...d.data() }));
          localConcludedMaintenanceOrders = orders.filter(os => {
            const createdAt = os.createdAt?.toDate ? os.createdAt.toDate() : (os.createdAt ? new Date(os.createdAt) : null);
            if (!createdAt) return false;
            const y = createdAt.getFullYear();
            const m = String(createdAt.getMonth() + 1).padStart(2, "0");
            const d = String(createdAt.getDate()).padStart(2, "0");
            return \`\${y}-\${m}-\${d}\` === exportConfig.date;
          });
        } else {
          localHistoryKM = historyKM; // from state if any, but actually for "current state" it's typically null
          localConcludedMaintenanceOrders = concludedMaintenanceOrders;
        }

        const checkServiceExecuted = (itemId) => {
          return localConcludedMaintenanceOrders.some(os => 
              os.inspectionItems?.some((i) => i.id === itemId || i.itemId === itemId)
          ) ? "SIM" : "NÃO";
        };

        const tableData = [];
        sortedItems.forEach((item) => {
          if (!item || !item.id) return;
          const record = records[item.id] || { conformity: "", serviceExecuted: "", lastMaintenanceKM: 0, nextMaintenanceKM: 0, lastMaintenanceDate: null, nextMaintenanceDate: null };
          const currentVehicleKM = vehicle.currentKM || vehicle.odometer || 0;

          let conformityVal = record.conformity || "-";
          
          const { progressPercent, remainingNumber, isOutdated, descRemaining } = calculateProgress(item, record, currentVehicleKM);
          const progressText = \`\${Math.round(progressPercent)}%\`;

          const rawServiceExec = (isChecklistHistory ? checkServiceExecuted(item.id) : (record.serviceExecuted || "-"));
          const serviceExecText = ["SIM", "NÃO", "NaKM"].includes(rawServiceExec) ? rawServiceExec : (rawServiceExec === "CONTROLEAR" || rawServiceExec === "Controlar" ? "-" : rawServiceExec);

          tableData.push([
            \`\${item.name}\\nPeriodicidade: \${item.periodicityKM.toLocaleString('pt-BR')} \${item.unit || "km"}\`,
            conformityVal,
            serviceExecText,
            isTimeBasedUnit(item.unit)
              ? record.lastMaintenanceDate ? new Date(record.lastMaintenanceDate + "T12:00:00").toLocaleDateString("pt-BR") : "-"
              : record.lastMaintenanceKM?.toLocaleString('pt-BR') || '0',
            \`Próx: \${isTimeBasedUnit(item.unit) ? (record.nextMaintenanceDate ? new Date(record.nextMaintenanceDate + "T12:00:00").toLocaleDateString("pt-BR") : "-") : record.nextMaintenanceKM?.toLocaleString('pt-BR') || '0'}\\n\${descRemaining}\\nProgresso: \${progressText}\\n\`,
          ]);
        });

        autoTable(pdf, {
          startY: 40,
          margin: { top: 40, bottom: 20, left: 14, right: 14 },
          head: [["ITEM", "AÇÕES EM CONFORMIDADE", "SERVIÇO EXECUTADO", "ÚLTIMA MANUT.", "PROGRESSO"]],
          body: tableData,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 4, right: 4, bottom: 6, left: 4 }, valign: "middle" },
          headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: "bold", fontSize: 7, halign: "left", lineColor: [226, 232, 240], lineWidth: 0.1 },
          bodyStyles: { lineColor: [226, 232, 240], lineWidth: 0.1 },
          columnStyles: { 0: { cellWidth: 55 }, 1: { halign: "center", cellWidth: 35 }, 2: { halign: "center", cellWidth: 35 }, 3: { halign: "center", cellWidth: 25 }, 4: { halign: "left", fontStyle: "bold" } },
          didDrawPage: function (data) {
            let startY = 15;
            if (finalImgDataUrl) {
              pdf.addImage(finalImgDataUrl, "JPEG", 14, startY, 35, 20);
              pdf.setFontSize(16);
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(0, 0, 0);
              pdf.text(\`Inspeção: \${vehicle.plate}\`, 54, startY + 8);
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(100, 100, 100);
              pdf.text(\`\${vehicle.model}\`, 54, startY + 14);
            } else {
              pdf.setFontSize(16);
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(0, 0, 0);
              pdf.text(\`Inspeção: \${vehicle.plate}\`, 14, startY + 8);
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(100, 100, 100);
              pdf.text(\`\${vehicle.model}\`, 14, startY + 14);
            }

            const infoBoxWidth = 24;
            const infoBoxHeight = 16;
            const infoSpacing = 2;
            const rightMargin = 10;
            
            // KM Atual
            pdf.setFillColor(241, 245, 249);
            pdf.roundedRect(pageWidth - infoBoxWidth - rightMargin, startY, infoBoxWidth, infoBoxHeight, 2, 2, "F");
            pdf.setFontSize(5);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(100, 116, 139);
            pdf.text("KM ATUAL", pageWidth - infoBoxWidth - rightMargin + 3, startY + 5);
            pdf.setFontSize(8);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(30, 41, 59);
            pdf.text((vehicle.currentKM || vehicle.odometer || 0).toLocaleString('pt-BR'), pageWidth - infoBoxWidth - rightMargin + 3, startY + 12);

            // Data Checklist
            const dateBoxX = pageWidth - (infoBoxWidth * 2) - infoSpacing - rightMargin;
            pdf.setFillColor(241, 245, 249);
            pdf.roundedRect(dateBoxX, startY, infoBoxWidth, infoBoxHeight, 2, 2, "F");
            pdf.setFontSize(5);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(100, 116, 139);
            pdf.text("DATA CHECKLIST", dateBoxX + 3, startY + 5);
            pdf.setFontSize(8);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(30, 41, 59);
            pdf.text(dateLabel, dateBoxX + 3, startY + 12);

            // KM Checklist
            const kmChecklistX = pageWidth - (infoBoxWidth * 3) - (infoSpacing * 2) - rightMargin;
            pdf.setFillColor(241, 245, 249);
            pdf.roundedRect(kmChecklistX, startY, infoBoxWidth, infoBoxHeight, 2, 2, "F");
            pdf.setFontSize(5);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(100, 116, 139);
            pdf.text("KM CHECKLIST", kmChecklistX + 3, startY + 5);
            pdf.setFontSize(8);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(30, 41, 59);
            pdf.text(localHistoryKM !== null ? localHistoryKM.toLocaleString('pt-BR') : "-", kmChecklistX + 3, startY + 12);
          },
          didDrawCell: function (data) {
            if (data.section === "body" && data.column.index === 4) {
              const rowIndex = data.row.index;
              const item = sortedItems[rowIndex];
              if (!item) return;

              const record = records[item.id] || { lastMaintenanceKM: 0 };
              const currentVehicleKM = vehicle.currentKM || vehicle.odometer || 0;
              const { progressPercent } = calculateProgress(item, record, currentVehicleKM);

              const cell = data.cell;
              const barWidth = cell.width - 8;
              const barHeight = 4;
              const x = cell.x + 4;
              const y = cell.y + cell.height - 6;

              pdf.setFillColor(226, 232, 240);
              pdf.rect(x, y, barWidth, barHeight, "F");

              if (progressPercent > 0) {
                if (progressPercent >= 100) pdf.setFillColor(239, 68, 68);
                else pdf.setFillColor(14, 165, 233);
                const filledWidth = (Math.min(progressPercent, 100) / 100) * barWidth;
                pdf.rect(x, y, filledWidth, barHeight, "F");
              }
              pdf.setTextColor(0, 0, 0);
            }
          },
        });
        
        hasPages = true;
      };

      // Função helper para desenhar Manutenção (OS Automática)
      const drawMaintenancePage = async () => {
        const qOs = query(
          collection(db, "maintenance"),
          where("vehicleId", "==", resolvedVehicleId)
        );
        const snapOs = await getDocs(qOs);
        const orders = snapOs.docs.map(d => ({ id: d.id, ...d.data() }));
        const os = orders.find(o => {
          const createdAt = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt ? new Date(o.createdAt) : null);
          if (!createdAt) return false;
          if (!o.title?.includes("OS Automática")) return false;

          const y = createdAt.getFullYear();
          const m = String(createdAt.getMonth() + 1).padStart(2, "0");
          const d = String(createdAt.getDate()).padStart(2, "0");
          return \`\${y}-\${m}-\${d}\` === exportConfig.date;
        });

        if (!os) {
          alert(\`Não foi encontrada OS Automática para a data \${exportConfig.date.split('-').reverse().join('/')}\`);
          return;
        }

        if (hasPages) {
           pdf.addPage();
        }

        const tableData = [];
        let totalItems = 0;
        const isFirestoreId = (str) => typeof str === 'string' && str.length >= 20 && /^[a-zA-Z0-9]+$/.test(str);

        const itemsWithValidTitles = os.inspectionItems?.filter(i => {
          const label = i.itemTitle || i.description || i.title || i.item || (items.find(it => it.id === i.itemId)?.name);
          return label && !isFirestoreId(label);
        }) || [];

        if (itemsWithValidTitles.length > 0) {
          itemsWithValidTitles.forEach((i) => {
            const label = i.itemTitle || i.description || i.title || i.item || (items.find(it => it.id === i.itemId)?.name) || "Item Indefinido";
            tableData.push([label, "Manutenção Solicitada", os.status, ""]);
            totalItems++;
          });
        } else {
          const descItems = os.description?.split('\\n') || [os.description];
          descItems.forEach((itemLine) => {
            const trimmed = itemLine.trim();
            if (trimmed !== '' && trimmed !== 'Gerado a partir do checklist diário.' && trimmed !== 'Itens:' && !trimmed.match(/^[a-zA-Z0-9]{20}$/)) {
              let label = trimmed.replace(/^- /, '');
              const matchedItem = items.find(it => it.id === label);
              if (isFirestoreId(label) && matchedItem) {
                label = matchedItem.name;
              }
              tableData.push([label, "Manutenção Solicitada", os.status, ""]);
              totalItems++;
            }
          });
        }

        autoTable(pdf, {
          startY: 55,
          margin: { top: 55, bottom: 20, left: 14, right: 14 },
          head: [["ITEM / SERVIÇO", "CATEGORIA", "STATUS", "OBSERVAÇÕES"]],
          body: tableData,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 4, right: 4, bottom: 4, left: 4 }, valign: "middle" },
          headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: "bold", fontSize: 7, halign: "left", lineColor: [226, 232, 240], lineWidth: 0.1 },
          bodyStyles: { lineColor: [226, 232, 240], lineWidth: 0.1 },
          didDrawPage: function (data) {
            let startY = 15;
            if (finalImgDataUrl) {
              pdf.addImage(finalImgDataUrl, "JPEG", 14, startY, 35, 20);
              pdf.setFontSize(16);
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(0, 0, 0);
              pdf.text(\`OS: \${os.plate}\`, 54, startY + 8);
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(100, 100, 100);
              pdf.text(\`\${vehicle.brand} \${vehicle.model}\`, 54, startY + 14);
            } else {
              pdf.setFontSize(16);
              pdf.setFont("helvetica", "bold");
              pdf.setTextColor(0, 0, 0);
              pdf.text(\`OS: \${os.plate}\`, 14, startY + 8);
              pdf.setFontSize(10);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(100, 100, 100);
              pdf.text(\`\${vehicle.brand} \${vehicle.model}\`, 14, startY + 14);
            }

            pdf.setFontSize(8);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(30, 41, 59);
            pdf.text(\`TOTAL ITENS: \${totalItems}\`, 14, startY + 22);

            pdf.setFillColor(241, 245, 249);
            pdf.roundedRect(pageWidth - 94, startY, 80, 20, 2, 2, "F");

            pdf.setFontSize(7);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(100, 116, 139);
            pdf.text("DATA DE CRIAÇÃO", pageWidth - 90, startY + 6);

            pdf.setFontSize(9);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(30, 41, 59);
            
            let cleanDate = new Date(os.createdAt).toLocaleDateString().replace(/(\\d{4})-(\\d{2})-(\\d{2})/, "$3/$2/$1");
            if (os.title && os.title.startsWith("OS Automática: Checklist ")) {
              const extractedDate = os.title.replace("OS Automática: Checklist ", "").trim();
              cleanDate = extractedDate.replace(/-/g, "/");
            }
            pdf.text(cleanDate, pageWidth - 90, startY + 11);
            pdf.text(\`Prestador: \${os.provider || 'Não informado'}\`, pageWidth - 90, startY + 16);
          },
        });
        hasPages = true;
      };

      // Execution sequence
      if (exportConfig.inspection) await drawInspectionPage(false);
      if (exportConfig.checklist) await drawInspectionPage(true);
      if (exportConfig.maintenance) await drawMaintenancePage();

      if (!hasPages) {
         setIsExporting(false);
         return;
      }

      // Pagination and Signature
      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.setFont("helvetica", "normal");
        pdf.text("ROTA 360 - Gestão de Frota", 14, pageHeight - 10);
        const pageStr = \`Pág. \${i}/\${totalPages}\`;
        pdf.text(pageStr, pageWidth - 14 - pdf.getTextWidth(pageStr), pageHeight - 10);
      }

      pdf.setPage(totalPages);
      const finalY = pdf.lastAutoTable?.finalY || 40;
      let signatureY = finalY + 20;
      let signatureHeight = 40;

      if (signatureY + signatureHeight > pageHeight - 20) {
        pdf.addPage();
        signatureY = 30;
      }

      // Generate digital signature
      const signatureId = await createSignature({
         documentType: 'Relatório Unificado',
         documentTitle: \`Inspeção / Manutenção - Veículo \${vehicle.plate}\`
      });

      if (signatureId) {
        const verifyUrl = generateVerificationUrl(signatureId);
        const qrCodeDataUrl = await getQRCodeDataUrl(verifyUrl);
        
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(14, signatureY, pageWidth - 28, signatureHeight, 3, 3, "F");
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.1);
        pdf.roundedRect(14, signatureY, pageWidth - 28, signatureHeight, 3, 3, "S");
        
        if (qrCodeDataUrl) pdf.addImage(qrCodeDataUrl, "JPEG", 20, signatureY + 5, 30, 30);
        
        pdf.setFontSize(10);
        pdf.setTextColor(30, 41, 59);
        pdf.setFont("helvetica", "bold");
        pdf.text("DOCUMENTO ASSINADO DIGITALMENTE", 56, signatureY + 8);
        
        const userName = userData?.signatureInfo?.fullName || userData?.name || 'USUÁRIO DO SISTEMA';
        pdf.setFontSize(11);
        pdf.setTextColor(0, 0, 0);
        pdf.text(\`por \${userName.toUpperCase()}\`, 56, signatureY + 14);
        
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100, 116, 139);
        pdf.text(\`Para verificar a autenticidade deste documento, aponte a câmera para o QR Code\\nou acesse a URL abaixo:\`, 56, signatureY + 20);
        
        pdf.setTextColor(37, 99, 235);
        pdf.text(verifyUrl, 56, signatureY + 28);
        
        pdf.setTextColor(100, 116, 139);
        pdf.setFontSize(7);
        pdf.text(\`Código de Validação: \${signatureId}\`, 56, signatureY + 36);

        try {
          const sealUrl = "https://i.imgur.com/1DaE4Bm.png";
          const sealResp = await fetch(sealUrl);
          const sealBlob = await sealResp.blob();
          const sealDataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(sealBlob);
          });
            
          const h = 14;
          const w = h * (1.0);
          pdf.addImage(sealDataUrl, 'PNG', pageWidth - 14 - w - 10, signatureY + 6, w, h, '', 'FAST');
        } catch (sealErr) {
          console.warn("Could not add seal logo to Inspections PDF", sealErr);
        }
      }

      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = String(today.getFullYear()).slice(-2);
      const dateStr = \`\${day}.\${month}.\${year}\`;

      pdf.save(\`\${dateStr}_\${vehicle.plate}_UNIFICADO.pdf\`);
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      alert("Houve um problema ao gerar o PDF. Se o erro persistir, atualize a página.");
    } finally {
      setIsExporting(false);
    }
  };`;

  code = code.substring(0, startIndex) + replacement + code.substring(endIndex + endStr.length);
  fs.writeFileSync('src/pages/Inspections.tsx', code);
}
