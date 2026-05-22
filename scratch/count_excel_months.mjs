import ExcelJS from 'exceljs';

const excelPath = 'example xl/example.xlsx';

async function run() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  const sheet = workbook.getWorksheet('1ST QTR SALES 2026');
  
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
  
  console.log(`Date index: ${dateColIdx}, SI index: ${siColIdx}`);
  
  const monthCounts = {};
  let totalRowsChecked = 0;
  let unparsedDates = 0;
  
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    
    totalRowsChecked++;
    
    const dateCell = row.getCell(dateColIdx);
    let dateVal = dateCell.value;
    
    // Safely get string representation of dateVal
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
      monthCounts['EMPTY'] = (monthCounts['EMPTY'] || 0) + 1;
      return;
    }
    
    const parsed = Date.parse(dateStr);
    if (isNaN(parsed)) {
      monthCounts['UNPARSED'] = (monthCounts['UNPARSED'] || 0) + 1;
      if (unparsedDates < 10) {
        console.log(`Unparsed date raw value at row ${rowNumber}:`, dateVal);
        unparsedDates++;
      }
      return;
    }
    
    const dateIso = new Date(parsed).toISOString().slice(0, 7); // YYYY-MM
    monthCounts[dateIso] = (monthCounts[dateIso] || 0) + 1;
  });
  
  console.log('\n--- Date Distribution in Excel ---');
  console.log('Total rows checked:', totalRowsChecked);
  console.log(monthCounts);
}

run().catch(console.error);
