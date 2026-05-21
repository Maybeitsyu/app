const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const directories = [
  path.resolve('example xl'),
  path.resolve('C:\\Users\\ufuni\\Downloads')
];

async function scanFile(filePath) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (e) {
    return; // skip unreadable files
  }

  workbook.eachSheet((sheet) => {
    let headers = [];
    let headerRowNumber = -1;
    
    // Find headers
    for (let i = 1; i <= Math.min(sheet.rowCount, 10); i++) {
      const row = sheet.getRow(i);
      if (!row || !row.values) continue;
      const vals = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        let v = cell.value;
        if (v && typeof v === 'object') {
          if (v.result !== undefined) v = v.result;
          else if (v.richText !== undefined) v = v.richText.map(rt => rt.text).join('');
        }
        if (v !== null && v !== undefined) {
          const vStr = v.toString().toUpperCase().trim();
          if (vStr) vals[colNumber] = vStr;
        }
      });
      const rowStr = vals.join(' | ');
      if (rowStr.includes('PRODUCT') && rowStr.includes('DATE')) {
        headers = vals;
        headerRowNumber = i;
        break;
      }
    }

    if (headerRowNumber === -1) return;

    // Search rows
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;

      const getVal = (colName) => {
        const colIdx = headers.findIndex(h => h && h.replace(/[^A-Z0-9]/g, '') === colName.toUpperCase().replace(/[^A-Z0-9]/g, ''));
        if (colIdx === -1) return null;
        const cell = row.getCell(colIdx);
        return cell ? cell.value : null;
      };

      const dateVal = getVal('DATE');
      const siVal = getVal('SI NO.') || getVal('SI_NO') || getVal('SI NO') || getVal('SI');
      const grossVal = getVal('GROSS AMOUNT') || getVal('GROSS');

      if (!dateVal) return;

      // Check if it matches Row 74: Walk Inn, gross 1020, or Row 172: SI 0213, gross 1920
      const isWalkInn = siVal && siVal.toString().trim().toUpperCase() === 'WALK INN' && parseFloat(grossVal) === 1020;
      const isSI0213 = siVal && siVal.toString().trim().toUpperCase() === 'SI 0213' && parseFloat(grossVal) === 1920;

      if (isWalkInn || isSI0213) {
        console.log(`\nMatch in File: ${path.basename(filePath)} | Sheet: ${sheet.name} | Row: ${rowNumber}`);
        console.log(`  SI: ${siVal}`);
        console.log(`  Date: ${dateVal}`);
        console.log(`  Gross: ${grossVal}`);
        console.log(`  Input VAT: ${getVal('INPUT VAT')}`);
        console.log(`  Output VAT: ${getVal('OUTPUT VAT')}`);
        console.log(`  VAT Exempt Sales: ${getVal('VAT EXEMPT SALES') || getVal('VAT EXEMPT SALES ') || getVal('VATEXEMPT')}`);
      }
    });
  });
}

async function run() {
  for (const dir of directories) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));
    for (const file of files) {
      const fullPath = path.join(dir, file);
      await scanFile(fullPath);
    }
  }
  console.log('\n--- SCAN COMPLETE ---');
}

run();
