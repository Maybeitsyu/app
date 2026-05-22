import ExcelJS from 'exceljs';

const excelPath = 'example xl/example.xlsx';

async function run() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  const sheet = workbook.getWorksheet('2ND QRT SALES');
  if (!sheet) {
    console.log('Sheet 2ND QRT SALES not found!');
    return;
  }
  console.log(`Sheet Row Count: ${sheet.rowCount}`);
  
  // Find header row (usually row 2)
  let headers = [];
  let headerRowNumber = -1;
  for (let i = 1; i <= Math.min(sheet.rowCount, 10); i++) {
    const row = sheet.getRow(i);
    const rowVals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      let v = cell.value;
      if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
      if (v !== null && v !== undefined) rowVals[colNumber] = v.toString().toUpperCase().trim();
    });
    if (rowVals.join(' | ').includes('PRODUCT') && rowVals.join(' | ').includes('DATE')) {
      headers = rowVals;
      headerRowNumber = i;
      break;
    }
  }

  if (headerRowNumber === -1) {
    console.log('No headers found on 2ND QRT SALES');
    return;
  }
  
  console.log('Header row:', headerRowNumber);

  const getColIdx = (keys) => {
    for (const k of keys) {
      const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const idx = headers.findIndex(h => h && h.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanK);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const dateColIdx = getColIdx(['DATE']);
  
  let validDateCount = 0;
  let emptyDateCount = 0;
  const monthCounts = {};
  
  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
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
  
  console.log('--- 2ND QRT Loop Results ---');
  console.log('Valid dates found:', validDateCount);
  console.log('Empty dates found:', emptyDateCount);
  console.log('Month counts:', monthCounts);
}

run().catch(console.error);
