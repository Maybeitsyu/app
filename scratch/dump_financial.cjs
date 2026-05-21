const ExcelJS = require('exceljs');

async function dumpFinancialSheet() {
  const filePath = 'example xl/agriledger back up.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  // Dump the FINANCIAL STATEMENT sheet raw content
  const sheet = workbook.getWorksheet('FINANCIAL STATEMENT');
  if (!sheet) {
    console.log('No FINANCIAL STATEMENT sheet found');
    return;
  }

  console.log(`=== FINANCIAL STATEMENT SHEET (${sheet.rowCount} rows) ===`);
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const vals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      let v = cell.value;
      if (v && typeof v === 'object') {
        if (v.result !== undefined) v = `FORMULA(${v.result})`;
        else if (v.richText !== undefined) v = v.richText.map(rt => rt.text).join('');
      }
      if (v !== null && v !== undefined) vals.push(`[col${colNumber}:${v}]`);
    });
    if (vals.length > 0) console.log(`Row ${rowNumber}: ${vals.join(' ')}`);
  });

  // Also check: does any row in this sheet match SALES header pattern?
  console.log('\n=== CHECKING IF ANY ROW LOOKS LIKE SALES HEADER ===');
  sheet.eachRow((row, rowNumber) => {
    const rowVals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      let v = cell.value;
      if (v && typeof v === 'object') {
        if (v.result !== undefined) v = v.result;
        else if (v.richText !== undefined) v = v.richText.map(rt => rt.text).join('');
      }
      if (v) rowVals[colNumber] = v.toString().toUpperCase().trim();
    });
    const rowStr = rowVals.join(' | ');
    if (rowStr.includes('PRODUCT') && rowStr.includes('DATE')) {
      console.log(`!! SALES HEADER FOUND at row ${rowNumber}: ${rowStr}`);
    }
    if (rowStr.includes('SUPPLIER') && rowStr.includes('GROSS')) {
      console.log(`!! PURCHASE HEADER FOUND at row ${rowNumber}: ${rowStr}`);
    }
  });
}

dumpFinancialSheet().catch(console.error);
