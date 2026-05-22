import ExcelJS from 'exceljs';
import path from 'path';

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.join('example xl','example.xlsx'));
const sheet = wb.getWorksheet('2ND QRT EXP 2026');
for (const rowNum of [1,2,3,4,5,6,7,8,9,10]) {
  const row = sheet.getRow(rowNum);
  console.log('\nROW', rowNum);
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    let v = cell.value;
    if (v && typeof v === 'object') {
      if (v.result !== undefined) v = v.result;
      else if (v.richText !== undefined) v = v.richText.map(rt => rt.text).join('');
    }
    console.log(col, v);
  });
}
