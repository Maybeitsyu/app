const ExcelJS = require('exceljs');

async function getUniqueDates() {
  const filePath = 'example xl/agriledger back up.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet('SALES MAY 2026');
  if (!sheet) { console.log('Sheet not found'); return; }

  let dates = new Set();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const dateCell = row.getCell(1);
    let dateVal = dateCell.value;
    let dateStr = '';
    if (dateCell.type === ExcelJS.ValueType.Date || dateVal instanceof Date) {
      dateStr = dateVal.toISOString().slice(0, 10);
    } else if (dateVal) {
      dateStr = dateVal.toString().trim();
    }
    if (dateStr) dates.add(dateStr);
  });

  console.log('Unique dates in SALES MAY 2026 sheet:', Array.from(dates).sort());
}

getUniqueDates().catch(console.error);
