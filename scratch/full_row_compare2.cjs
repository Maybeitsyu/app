const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('path');
const ExcelJS = require('exceljs');
const fs = require('fs');

app.whenReady().then(async () => {
  try {
    const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
    const db = new Database(dbPath, { readonly: true });

    // Get ALL sales from the real DB, ordered by created_at
    const dbSales = db.prepare("SELECT date, si_number, gross_amount, input_vat, vat_exempt_amount, status FROM sales ORDER BY created_at ASC").all();
    console.log('Total DB sales:', dbSales.length);

    // Get ALL sales from Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.resolve('example xl/agriledger back up.xlsx'));
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
            if (typeof val === 'string') return val.replace(/[₱,]/g, '').trim();
            return val.toString();
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

      const gross = grossRaw !== null ? parseFloat(grossRaw) || 0 : 0;
      const vatExempt = vatExemptRaw !== null ? parseFloat(vatExemptRaw) || 0 : 0;
      const inputVat = inputVatRaw !== null ? parseFloat(inputVatRaw) || 0 : 0;

      excelRows.push({ rowNumber, si: siVal ? siVal.toString() : '', gross, vatExempt, inputVat, excelTotal: inputVat + vatExempt });
    });

    console.log('Total Excel rows:', excelRows.length);
    const excelGrandTotal = excelRows.reduce((sum, r) => sum + r.excelTotal, 0);
    console.log('Excel grand total (inputVat + vatExempt):', Math.round(excelGrandTotal * 100) / 100);

    // Row-by-row comparison
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
        diffs.push({ index: i + 1, dbSI: dbRow.si_number, xlSI: xlRow.si, dbDate: dbRow.date, dbContrib: Math.round(dbContrib * 100) / 100, xlContrib: Math.round(xlContrib * 100) / 100, diff });
      }
    }

    console.log(`\nTotal DB contrib: ${Math.round(totalDbContrib * 100) / 100}`);
    console.log(`Total Excel contrib: ${Math.round(totalExcelContrib * 100) / 100}`);
    console.log(`Total diff: ${Math.round((totalDbContrib - totalExcelContrib) * 100) / 100}`);

    console.log('\n--- ROWS WITH DIFFERENCES ---');
    for (const d of diffs) {
      console.log(`Row ${d.index}: DB_SI="${d.dbSI}" DB_Date="${d.dbDate}" DB=${d.dbContrib} XL_SI="${d.xlSI}" XL=${d.xlContrib} DIFF=${d.diff}`);
    }

    const sumOfDiffs = diffs.reduce((sum, d) => sum + d.diff, 0);
    console.log(`\nSum of all diffs: ${Math.round(sumOfDiffs * 100) / 100}`);

    db.close();
  } catch (e) {
    console.error('ERROR:', e.stack);
  }
  app.quit();
});
