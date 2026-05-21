const Database = require('better-sqlite3');
const path = require('path');
const ExcelJS = require('exceljs');

const dbPath = path.resolve('C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db');
const db = new Database(dbPath, { readonly: true });

// Get ALL sales from the real DB, ordered by created_at
const dbSales = db.prepare("SELECT date, si_number, gross_amount, input_vat, vat_exempt_amount, status FROM sales ORDER BY created_at ASC").all();
console.log('Total DB sales:', dbSales.length);

// Get ALL sales from Excel
const workbook = new ExcelJS.Workbook();
workbook.xlsx.readFile(path.resolve('example xl/agriledger back up.xlsx')).then(() => {
  const sheet = workbook.getWorksheet('SALES MAY 2026');
  
  const headers = [];
  const row1 = sheet.getRow(1);
  row1.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    let v = cell.value;
    if (v && typeof v === 'object') {
      if (v.result !== undefined) v = v.result;
      else if (v.richText !== undefined) v = v.richText.map(rt => rt.text).join('');
    }
    headers[colNumber] = v ? v.toString().toUpperCase().trim() : '';
  });

  const excelRows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;

    const getVal = (names) => {
      for (const name of names) {
        const cleanName = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const colIdx = headers.findIndex(h => h && h.replace(/[^A-Z0-9]/g, '') === cleanName);
        if (colIdx !== -1) {
          const cell = row.getCell(colIdx);
          if (!cell || cell.value === null || cell.value === undefined) continue;
          let val = cell.value;
          if (val && typeof val === 'object') {
            if (val.result !== undefined) val = val.result;
            else if (val.richText !== undefined) val = val.richText.map(rt => rt.text).join('');
          }
          return val;
        }
      }
      return null;
    };

    const dateVal = getVal(['DATE']);
    if (!dateVal) return;

    const grossRaw = getVal(['GROSS AMOUNT', 'GROSS']);
    const vatExemptRaw = getVal(['VAT EXEMPT SALES', 'VAT EXEMPT SALES ', 'VATEXEMPT']);
    const inputVatRaw = getVal(['INPUT VAT', 'INPUTVAT']);
    const siVal = getVal(['SI NO.', 'SI_NO', 'SI NO', 'SI']);

    const gross = grossRaw !== null ? parseFloat(grossRaw.toString().replace(/[^0-9.-]+/g, '')) || 0 : 0;
    const vatExempt = vatExemptRaw !== null ? parseFloat(vatExemptRaw.toString().replace(/[^0-9.-]+/g, '')) || 0 : 0;
    const inputVat = inputVatRaw !== null ? parseFloat(inputVatRaw.toString().replace(/[^0-9.-]+/g, '')) || 0 : 0;

    // The "total" in Excel is input_vat + vat_exempt
    const excelTotal = inputVat + vatExempt;
    excelRows.push({ rowNumber, si: siVal ? siVal.toString() : '', gross, vatExempt, inputVat, excelTotal });
  });

  console.log('Total Excel rows:', excelRows.length);
  const excelGrandTotal = excelRows.reduce((sum, r) => sum + r.excelTotal, 0);
  console.log('Excel grand total (inputVat + vatExempt):', Math.round(excelGrandTotal * 100) / 100);

  // Now compare DB rows against Excel rows by row index
  console.log('\n--- COMPARING DB rows vs EXCEL rows by index ---');
  let totalDbContrib = 0;
  let totalExcelContrib = 0;
  const diffs = [];
  
  for (let i = 0; i < Math.min(dbSales.length, excelRows.length); i++) {
    const dbRow = dbSales[i];
    const xlRow = excelRows[i];
    
    const dbContrib = dbRow.input_vat + dbRow.vat_exempt_amount;
    const xlContrib = xlRow.excelTotal;
    
    totalDbContrib += dbContrib;
    totalExcelContrib += xlContrib;
    
    const diff = Math.round((dbContrib - xlContrib) * 100) / 100;
    if (Math.abs(diff) > 0.01) {
      diffs.push({ index: i, dbSI: dbRow.si_number, xlSI: xlRow.si, dbDate: dbRow.date, dbContrib, xlContrib, diff });
    }
  }

  console.log(`\nTotal DB contrib: ${Math.round(totalDbContrib * 100) / 100}`);
  console.log(`Total Excel contrib: ${Math.round(totalExcelContrib * 100) / 100}`);
  console.log(`Total diff: ${Math.round((totalDbContrib - totalExcelContrib) * 100) / 100}`);
  
  console.log('\n--- ROWS WITH DIFFERENCES ---');
  for (const d of diffs) {
    console.log(`Index ${d.index}: DB_SI="${d.dbSI}" XL_SI="${d.xlSI}" DB_Date="${d.dbDate}" DB=${d.dbContrib} XL=${d.xlContrib} diff=${d.diff}`);
  }
  
  db.close();
});
