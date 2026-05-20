import ExcelJS from 'exceljs';

async function checkExcelErrors() {
  const filePath = 'C:\\projct ni client\\app\\example xl\\agriledger back up.xlsx';
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

  const grossIdx = getColIndex(['GROSS AMOUNT', 'GROSSAMOUNT', 'GROSS']);
  const inputVatIdx = getColIndex(['INPUT VAT', 'INPUTVAT']);
  const outputVatIdx = getColIndex(['OUTPUT VAT', 'OUTPUTVAT']);
  const vatExemptIdx = getColIndex(['VAT EXEMPT SALES', 'VAT EXEMPT SALES ', 'VATEXEMPT']);
  const dateIdx = getColIndex(['DATE']);
  const productIdx = getColIndex(['PRODUCT']);
  const receiptIdx = getColIndex(['RECEIPT #', 'RECEIPT']);

  const parseMoney = (raw) => {
    if (raw === undefined || raw === null || raw === '') return 0;
    if (typeof raw === 'string') return parseFloat(raw.replace(/[^0-9.-]+/g, '')) || 0;
    return parseFloat(raw) || 0;
  };

  console.log('====================================');
  console.log('SCANNING EXCEL FILE FOR MATHEMATICAL ERRORS...');
  console.log('====================================');

  let errorFound = false;

  for (let i = headerRowIndex + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const dateVal = row.getCell(dateIdx).value;
    const productVal = row.getCell(productIdx).value;
    if (!dateVal || !productVal || dateVal.toString().toUpperCase() === 'SALES' || dateVal.toString().toUpperCase() === 'TOTAL COST') {
      continue;
    }

    const gross = parseMoney(row.getCell(grossIdx).value);
    const iv = parseMoney(row.getCell(inputVatIdx).value);
    const ov = parseMoney(row.getCell(outputVatIdx).value);
    const ve = parseMoney(row.getCell(vatExemptIdx).value);

    // Rule 1: Input VAT + Output VAT + VAT Exempt should equal Gross
    const totalParts = iv + ov + ve;
    const difference = Math.abs(gross - totalParts);

    // Allow a small rounding difference of 1 cent
    if (difference > 0.05) {
      console.log(`\n❌ ERROR ON ROW ${i} (Receipt: ${row.getCell(receiptIdx).value || 'N/A'}, Product: ${productVal})`);
      console.log(`   Your Gross Amount is: ₱${gross.toFixed(2)}`);
      console.log(`   But the sum of your taxes (Input: ₱${iv.toFixed(2)} + Output: ₱${ov.toFixed(2)} + Exempt: ₱${ve.toFixed(2)}) equals ₱${totalParts.toFixed(2)}`);
      console.log(`   Difference: ₱${difference.toFixed(2)}`);
      errorFound = true;
    }
  }

  if (!errorFound) {
    console.log('\n✅ No mathematical errors found! Every row adds up perfectly.');
  }
  console.log('====================================');
}

checkExcelErrors().catch(console.error);
