const ExcelJS = require('exceljs');

async function findMay21() {
  const filePath = 'example xl/agriledger back up.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet('SALES MAY 2026');
  if (!sheet) { console.log('Sheet not found'); return; }

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
        else if (v.richText !== undefined) v = v.richText.map(rt => rt.text).join('');
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

  const inputVatColIdx = getColIdx(['INPUT VAT', 'INPUTVAT']);
  const vatExemptColIdx = getColIdx(['VAT EXEMPT SALES', 'VATEXEMPT']);
  const dateColIdx = getColIdx(['DATE']);
  const productColIdx = getColIdx(['PRODUCT']);

  console.log('Date col index:', dateColIdx);

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const dateCell = row.getCell(dateColIdx);
    let dateVal = dateCell.value;
    
    // Parse date
    let dateStr = '';
    if (dateCell.type === ExcelJS.ValueType.Date || dateVal instanceof Date) {
      dateStr = dateVal.toISOString().slice(0, 10);
    } else if (dateVal) {
      dateStr = dateVal.toString().trim();
    }

    const getVal = (colIdx) => {
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

    const inputVat = getVal(inputVatColIdx);
    const vatExempt = getVal(vatExemptColIdx);
    const product = row.getCell(productColIdx).value;

    if (dateStr.includes('2026-05-21') || dateStr.includes('21') || (inputVat + vatExempt) === 2940) {
      console.log(`Row ${rowNumber}: Date="${dateStr}" Product="${product}" InputVAT=${inputVat} VATExempt=${vatExempt} Total=${inputVat + vatExempt}`);
    }
  });
}

findMay21().catch(console.error);
