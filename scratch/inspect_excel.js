import ExcelJS from 'exceljs';

async function checkExcel() {
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

  const inputVatIdx = getColIndex(['INPUT VAT', 'INPUTVAT']);
  const vatExemptIdx = getColIndex(['VAT EXEMPT SALES', 'VAT EXEMPT SALES ', 'VATEXEMPT']);
  const dateIdx = getColIndex(['DATE']);
  const productIdx = getColIndex(['PRODUCT']);

  let sumInputVat = 0;
  let sumVatExempt = 0;

  const parseMoney = (raw) => {
    if (raw === undefined || raw === null || raw === '') return 0;
    if (typeof raw === 'string') return parseFloat(raw.replace(/[^0-9.-]+/g, '')) || 0;
    return parseFloat(raw) || 0;
  };

  for (let i = headerRowIndex + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const dateVal = row.getCell(dateIdx).value;
    const productVal = row.getCell(productIdx).value;
    if (!dateVal || !productVal || dateVal.toString().toUpperCase() === 'SALES' || dateVal.toString().toUpperCase() === 'TOTAL COST') {
      continue;
    }

    const iv = parseMoney(row.getCell(inputVatIdx).value);
    const ve = parseMoney(row.getCell(vatExemptIdx).value);

    sumInputVat += iv;
    sumVatExempt += ve;
  }

  console.log('====================================');
  console.log('Total INPUT VAT column sum:', sumInputVat);
  console.log('Total VAT EXEMPT SALES column sum:', sumVatExempt);
  console.log('TOTAL OF BOTH (Your App Sales Output):', sumInputVat + sumVatExempt);
  console.log('YOUR EXPECTED TARGET:', 2257402.01);
  console.log('DIFFERENCE:', (sumInputVat + sumVatExempt) - 2257402.01);
  console.log('====================================');
}

checkExcel().catch(console.error);
