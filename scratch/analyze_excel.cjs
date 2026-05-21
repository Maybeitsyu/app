const ExcelJS = require('exceljs');
const path = require('path');

async function analyzeExcel() {
  const filePath = 'example xl/agriledger back up.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  console.log('=== SHEETS ===');
  workbook.eachSheet(sheet => console.log('-', sheet.name));

  let grandTotal = 0;

  workbook.eachSheet((sheet) => {
    // Find header row
    let headerRowNumber = -1;
    let headers = [];
    let sheetType = '';

    for (let i = 1; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (!row || !row.values) continue;
      const rowVals = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        let v = cell.value;
        if (v && typeof v === 'object') {
          if (v.result !== undefined) v = v.result;
          else if (v.richText !== undefined) v = v.richText.map(rt => rt.text).join('');
        }
        if (v !== null && v !== undefined) {
          const vStr = v.toString().toUpperCase().trim();
          if (vStr) rowVals[colNumber] = vStr;
        }
      });
      const rowStr = rowVals.join(' | ');
      if (rowStr.includes('PRODUCT') && rowStr.includes('DATE')) {
        headers = rowVals;
        headerRowNumber = i;
        sheetType = 'SALES';
        break;
      }
    }

    if (sheetType !== 'SALES') return;

    console.log(`\n=== SHEET: ${sheet.name} (SALES, header row: ${headerRowNumber}) ===`);

    // Find column indices
    const getColIdx = (keys) => {
      for (const k of keys) {
        const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const idx = headers.findIndex(h => h && h.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanK);
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const inputVatCol = getColIdx(['INPUT VAT', 'INPUTVAT']);
    const vatExemptCol = getColIdx(['VAT EXEMPT SALES', 'VATEXEMPT']);
    const grossCol = getColIdx(['GROSS AMOUNT', 'GROSSAMOUNT', 'GROSS']);
    const productCol = getColIdx(['PRODUCT']);
    const dateCol = getColIdx(['DATE']);
    const statusCol = getColIdx(['REMARKS', 'STATUS']);

    console.log(`Columns -> InputVAT:${inputVatCol}, VATExempt:${vatExemptCol}, Gross:${grossCol}, Product:${productCol}, Date:${dateCol}`);

    let sheetTotal = 0;
    let rowCount = 0;
    let suspiciousRows = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;

      const getVal = (colIdx) => {
        if (colIdx === -1) return null;
        const cell = row.getCell(colIdx);
        if (!cell || cell.value === null || cell.value === undefined) return null;
        let val = cell.value;
        if (val && typeof val === 'object') {
          if (val.result !== undefined) val = val.result;
          else if (val.richText !== undefined) val = val.richText.map(rt => rt.text).join('');
        }
        if (typeof val === 'string') return parseFloat(val.replace(/[₱,\s]/g, '')) || 0;
        return parseFloat(val) || 0;
      };

      const getStrVal = (colIdx) => {
        if (colIdx === -1) return '';
        const cell = row.getCell(colIdx);
        if (!cell || cell.value === null) return '';
        let val = cell.value;
        if (val && typeof val === 'object') {
          if (val.result !== undefined) val = val.result;
          else if (val.richText !== undefined) val = val.richText.map(rt => rt.text).join('');
        }
        return val ? val.toString().trim() : '';
      };

      const product = getStrVal(productCol);
      const date = getStrVal(dateCol);
      if (!product && !date) return;
      if (product.toUpperCase() === 'TOTAL' || date.toUpperCase() === 'TOTAL' || date.toUpperCase() === 'DATE') return;

      const inputVat = getVal(inputVatCol) || 0;
      const vatExempt = getVal(vatExemptCol) || 0;
      const gross = getVal(grossCol) || 0;
      const lineTotalExcel = inputVat + vatExempt;

      // Flag suspicious rows (e.g. no product, total rows, etc)
      if (!product || product.toUpperCase().includes('TOTAL') || date.toUpperCase().includes('TOTAL')) {
        suspiciousRows.push({ rowNumber, date, product, inputVat, vatExempt, gross, lineTotalExcel });
      }

      sheetTotal += lineTotalExcel;
      rowCount++;
    });

    grandTotal += sheetTotal;
    console.log(`Rows processed: ${rowCount}`);
    console.log(`Sheet total (inputVat + vatExempt): ${sheetTotal.toFixed(2)}`);
    if (suspiciousRows.length > 0) {
      console.log(`\nSUSPICIOUS ROWS IN ${sheet.name}:`);
      suspiciousRows.forEach(r => console.log(JSON.stringify(r)));
    }
  });

  console.log(`\n=== EXCEL GRAND TOTAL (all SALES sheets) ===`);
  console.log(`Total: ${grandTotal.toFixed(2)}`);
}

analyzeExcel().catch(console.error);
