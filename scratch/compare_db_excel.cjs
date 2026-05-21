const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function compareDbExcel() {
  const excelPath = 'example xl/agriledger back up.xlsx';
  const dbSalesPath = 'scratch/real_db_sales.json';

  if (!fs.existsSync(dbSalesPath)) {
    console.log('real_db_sales.json not found!');
    return;
  }

  const dbSales = JSON.parse(fs.readFileSync(dbSalesPath, 'utf8'));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  const sheet = workbook.getWorksheet('SALES MAY 2026');

  // Find header row
  let headers = [];
  let headerRowNumber = -1;
  for (let i = 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const rowVals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      let v = cell.value;
      if (v && typeof v === 'object') {
        if (v.result !== undefined) v = v.result;
      }
      if (v !== null && v !== undefined) {
        rowVals[colNumber] = v.toString().toUpperCase().trim();
      }
    });
    if (rowVals.join(' | ').includes('PRODUCT') && rowVals.join(' | ').includes('DATE')) {
      headers = rowVals;
      headerRowNumber = i;
      break;
    }
  }

  const getColIdx = (keys) => {
    for (const k of keys) {
      const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const idx = headers.findIndex(h => h && h.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanK);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const dateColIdx = getColIdx(['DATE']);
  const siColIdx = getColIdx(['SI NUMBER', 'SINUMBER']);
  const customerColIdx = getColIdx(['CUSTOMER']);
  const productColIdx = getColIdx(['PRODUCT']);
  const grossColIdx = getColIdx(['GROSS AMOUNT', 'GROSS']);
  const inputVatColIdx = getColIdx(['INPUT VAT', 'INPUTVAT']);
  const vatExemptColIdx = getColIdx(['VAT EXEMPT SALES', 'VATEXEMPT']);
  const companyColIdx = getColIdx(['COMPANY NAME', 'COMPANYNAME']);

  const getVal = (row, colIdx) => {
    if (colIdx === -1) return 0;
    const cell = row.getCell(colIdx);
    if (!cell || cell.value === null || cell.value === undefined) return 0;
    let val = cell.value;
    if (val && typeof val === 'object') {
      if (val.result !== undefined) val = val.result;
    }
    if (typeof val === 'string') return parseFloat(val.replace(/[₱,\s]/g, '')) || 0;
    return parseFloat(val) || 0;
  };

  const getString = (row, colIdx) => {
    if (colIdx === -1) return '';
    const cell = row.getCell(colIdx);
    if (!cell || cell.value === null || cell.value === undefined) return '';
    let val = cell.value;
    if (val && typeof val === 'object') {
      if (val.result !== undefined) val = val.result;
    }
    return val.toString().trim();
  };

  // Parse excel rows
  const excelRows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    
    const dateCell = row.getCell(dateColIdx);
    let dateVal = dateCell.value;
    let dateStr = '';
    if (dateCell.type === ExcelJS.ValueType.Date || dateVal instanceof Date) {
      dateStr = dateVal.toISOString().slice(0, 10);
    } else if (dateVal) {
      dateStr = dateVal.toString().trim();
    }

    const siNumber = getString(row, siColIdx);
    const companyName = getString(row, companyColIdx);
    const gross = getVal(row, grossColIdx);
    const inputVat = getVal(row, inputVatColIdx);
    const vatExempt = getVal(row, vatExemptColIdx);

    excelRows.push({
      rowNumber,
      date: dateStr,
      si_number: siNumber,
      company_name: companyName,
      gross,
      input_vat: inputVat,
      vat_exempt: vatExempt,
      total: inputVat + vatExempt
    });
  });

  console.log(`Comparing ${dbSales.length} DB sales with ${excelRows.length} Excel rows...`);

  // We can try to pair them by index since they should be in the same order
  for (let i = 0; i < Math.max(dbSales.length, excelRows.length); i++) {
    const db = dbSales[i];
    const xl = excelRows[i];

    if (!db || !xl) {
      console.log(`Mismatch at index ${i}: DB=${db ? db.si_number : 'NONE'}, XL=${xl ? xl.si_number : 'NONE'}`);
      continue;
    }

    const dbTotal = db.input_vat + db.vat_exempt_amount;
    const xlTotal = xl.total;
    const diff = Math.abs(dbTotal - xlTotal);

    if (diff > 0.01) {
      console.log(`\nRow Diff at Index ${i} (Excel Row ${xl.rowNumber}):`);
      console.log(`  SI: DB="${db.si_number}" vs XL="${xl.si_number}"`);
      console.log(`  Date: DB="${db.date}" vs XL="${xl.date}"`);
      console.log(`  Company: DB="${db.company_name}" vs XL="${xl.company_name}"`);
      console.log(`  Gross: DB=${db.gross_amount} vs XL=${xl.gross}`);
      console.log(`  Input VAT: DB=${db.input_vat} vs XL=${xl.input_vat}`);
      console.log(`  VAT Exempt: DB=${db.vat_exempt_amount} vs XL=${xl.vat_exempt}`);
      console.log(`  Total: DB=${dbTotal} vs XL=${xlTotal} (Diff: ${dbTotal - xlTotal})`);
    }
  }
}

compareDbExcel().catch(console.error);
