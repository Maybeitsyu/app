import ExcelJS from 'exceljs';
import path from 'path';

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.join('example xl','example.xlsx'));
const sheet = wb.getWorksheet('2ND QRT EXP 2026');
for (let i = 1; i <= 4; i++) {
  const row = sheet.getRow(i);
  console.log('Row', i, row.values.map(v => {
    if (v && typeof v === 'object') {
      if (v.result !== undefined) return {formula: v.formula, result: v.result};
      if (v.richText) return v.richText.map(t => t.text).join('');
    }
    return v;
  }));
}
