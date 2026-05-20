const ExcelJS = require('exceljs');

async function checkReturns() {
  const filePath = 'C:\\projct ni client\\app\\example xl\\agriledger back up.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet('SALES MAY 2026');
  
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

  const statusIdx = getColIndex(['REMARKS', 'STATUS']);
  const grossIdx = getColIndex(['GROSS AMOUNT', 'GROSSAMOUNT', 'GROSS']);
  
  const parseMoney = (raw) => {
    if (raw === undefined || raw === null || raw === '') return 0;
    if (typeof raw === 'string') return parseFloat(raw.replace(/[^0-9.-]+/g, '')) || 0;
    return parseFloat(raw) || 0;
  };

  let sumAll = 0;
  let sumPaidAR = 0;

  for (let i = headerRowIndex + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const dateVal = row.getCell(getColIndex(['DATE'])).value;
    const productVal = row.getCell(getColIndex(['PRODUCT'])).value;
    
    if (!dateVal || !productVal || dateVal.toString().toUpperCase() === 'SALES' || dateVal.toString().toUpperCase() === 'TOTAL COST') {
      continue;
    }

    const statusVal = (row.getCell(statusIdx).value || '').toString().toUpperCase().trim();
    const iv = parseMoney(row.getCell(getColIndex(['INPUT VAT', 'INPUTVAT'])).value);
    const ve = parseMoney(row.getCell(getColIndex(['VAT EXEMPT SALES', 'VAT EXEMPT SALES ', 'VATEXEMPT'])).value);
    
    const rowTotal = iv + ve;
    sumAll += rowTotal;
    
    if (statusVal === 'PAID' || statusVal === '' || statusVal === 'A/R') {
        // App logic right now treats EVERYTHING not "PAID" as "A/R"
    }
    
    if (statusVal.includes('RETURN') || statusVal.includes('VOID') || statusVal.includes('CANCEL')) {
        console.log(`Row ${i}: Status='${statusVal}', RowTotal=${rowTotal}`);
    }
  }
  
  console.log('Total SUM of Input VAT + Exempt:', sumAll.toFixed(2));
}

checkReturns().catch(console.error);
