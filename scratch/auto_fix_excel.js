import ExcelJS from 'exceljs';

async function fixExcel() {
  const filePath = 'C:\\projct ni client\\app\\example xl\\agriledger back up.xlsx';
  const outPath = 'C:\\projct ni client\\app\\example xl\\agriledger back up FIXED.xlsx';

  console.log('Loading Excel file...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('SALES MAY 2026');

  // Find Headers
  let headerRowIndex = -1;
  let headers = [];
  for (let i = 1; i <= 5; i++) {
    const row = sheet.getRow(i);
    let foundHeaders = false;
    row.eachCell((cell, colNumber) => {
      const val = cell.value ? cell.value.toString().toUpperCase().trim() : '';
      if (val === 'DATE' || val === 'PRODUCT') foundHeaders = true;
      headers[colNumber] = val;
    });
    if (foundHeaders) { headerRowIndex = i; break; }
  }

  const getColIndex = (names) => {
    for (let i = 1; i < headers.length; i++) {
      if (names.includes(headers[i])) return i;
    }
    return -1;
  };

  // Resolve a cell value - handle plain numbers, strings, dates, AND formula objects
  const resolveCell = (cell) => {
    const val = cell.value;
    if (val === null || val === undefined || val === '') return null;
    // Date objects - return them as-is
    if (val instanceof Date) return val;
    // Formula cell: { formula: '=...', result: 123 }
    if (typeof val === 'object') {
      if (val.result !== undefined) return val.result;
      if (val.richText !== undefined) return val.richText.map(rt => rt.text).join('');
      return null;
    }
    return val;
  };

  const parseMoney = (raw) => {
    if (raw === null || raw === undefined || raw === '') return 0;
    if (typeof raw === 'string') return parseFloat(raw.replace(/[^0-9.-]+/g, '')) || 0;
    return parseFloat(raw) || 0;
  };

  const inputVatIdx = getColIndex(['INPUT VAT', 'INPUTVAT']);
  const vatExemptIdx = getColIndex(['VAT EXEMPT SALES', 'VAT EXEMPT SALES ', 'VATEXEMPT']);
  const dateIdx = getColIndex(['DATE']);
  const productIdx = getColIndex(['PRODUCT']);

  let totalInputVat = 0;
  let totalVatExempt = 0;
  let rows = 0;

  for (let i = headerRowIndex + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const dateVal = resolveCell(row.getCell(dateIdx));
    const productVal = resolveCell(row.getCell(productIdx));
    if (!dateVal || !productVal || dateVal.toString().toUpperCase() === 'SALES' || dateVal.toString().toUpperCase() === 'TOTAL COST') {
      continue;
    }

    const rawIv = resolveCell(row.getCell(inputVatIdx));
    const rawVe = resolveCell(row.getCell(vatExemptIdx));

    const iv = parseMoney(rawIv);
    const ve = parseMoney(rawVe);

    // Write back as plain numbers (remove any formulas so import reads them cleanly)
    row.getCell(inputVatIdx).value = iv;
    row.getCell(vatExemptIdx).value = ve;

    totalInputVat += iv;
    totalVatExempt += ve;
    rows++;
  }

  console.log('====================================');
  console.log('Rows processed:', rows);
  console.log('Total INPUT VAT (Net of VAT):', totalInputVat);
  console.log('Total VAT EXEMPT SALES:', totalVatExempt);
  console.log('TOTAL (Input + Exempt):', totalInputVat + totalVatExempt);
  console.log('Your Target:', 2257402.01);
  console.log('Difference:', (totalInputVat + totalVatExempt) - 2257402.01);
  console.log('Saving fixed file...');

  await workbook.xlsx.writeFile(outPath);
  console.log(`Saved to: ${outPath}`);
  console.log('====================================');
}

fixExcel().catch(console.error);
