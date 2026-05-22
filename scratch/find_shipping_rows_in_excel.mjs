import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('C:\\projct ni client\\app\\example xl\\agriledger back new.xlsx');

for (const sheet of workbook.worksheets) {
  let found = false;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.map(v => (v && typeof v === 'object' ? ('result' in v ? v.result : v.text || '') : v)).map(v => v === undefined ? '' : String(v).toUpperCase());
    if (values.some(v => v.includes('SHIPPING') || v.includes('SHIPPINGFEE'))) {
      if (!found) {
        console.log(`Sheet: ${sheet.name}`);
        found = true;
      }
      console.log(`  Row ${rowNumber}: ${values.join(' | ')}`);
    }
  });
}
