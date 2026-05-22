import ExcelJS from 'exceljs';

const excelPath = 'example xl/example.xlsx';

async function run() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  const sheet = workbook.getWorksheet('1ST QTR SALES 2026');
  console.log(`Sheet Row Count: ${sheet.rowCount}`);
  
  const headerRowNumber = 2;
  const headers = [];
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    let v = cell.value;
    if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
    if (v !== null && v !== undefined) headers[colNumber] = v.toString().toUpperCase().trim();
  });

  const getColIdx = (keys) => {
    for (const k of keys) {
      const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const idx = headers.findIndex(h => h && h.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanK);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const dateColIdx = getColIdx(['DATE']);
  const siColIdx = getColIdx(['SI NO.', 'SI NO', 'SI_NO', 'SI']);
  
  let validDateCount = 0;
  let emptyDateCount = 0;
  const monthCounts = {};
  
  for (let r = 3; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const dateCell = row.getCell(dateColIdx);
    const dateVal = dateCell.value;
    
    let dateStr = '';
    if (dateCell.type === ExcelJS.ValueType.Date || dateVal instanceof Date) {
      dateStr = dateVal.toISOString().slice(0, 10);
    } else if (dateVal) {
      if (typeof dateVal === 'object' && dateVal.result instanceof Date) {
        dateStr = dateVal.result.toISOString().slice(0, 10);
      } else if (typeof dateVal === 'object' && dateVal.result) {
        dateStr = dateVal.result.toString().trim();
      } else {
        dateStr = dateVal.toString().trim();
      }
    }
    
    if (!dateStr) {
      emptyDateCount++;
      continue;
    }
    
    const parsed = Date.parse(dateStr);
    if (isNaN(parsed)) {
      monthCounts['UNPARSED'] = (monthCounts['UNPARSED'] || 0) + 1;
      continue;
    }
    
    validDateCount++;
    const dateIso = new Date(parsed).toISOString().slice(0, 7); // YYYY-MM
    monthCounts[dateIso] = (monthCounts[dateIso] || 0) + 1;
  }
  
  console.log('--- Loop Results ---');
  console.log('Valid dates found:', validDateCount);
  console.log('Empty dates found:', emptyDateCount);
  console.log('Month counts:', monthCounts);
}

run().catch(console.error);
