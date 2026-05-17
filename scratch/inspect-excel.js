import ExcelJS from 'exceljs';
import path from 'path';

async function main() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.resolve('example xl/example.xlsx');
  await workbook.xlsx.readFile(filePath);

  console.log('Sheets in workbook:', workbook.worksheets.map(w => w.name));

  workbook.worksheets.forEach(worksheet => {
    console.log(`\n=== Worksheet: ${worksheet.name} (Rows: ${worksheet.rowCount}, Cols: ${worksheet.columnCount}) ===`);
    
    // Print first 30 rows
    const rows = [];
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber <= 30) {
        const values = Array.isArray(row.values) ? row.values.slice(1) : []; // Row values has 1-based index
        rows.push({ rowNumber, values });
      }
    });

    rows.forEach(r => {
      console.log(`${r.rowNumber}:`, JSON.stringify(r.values));
    });
  });
}

main().catch(err => {
  console.error(err);
});
