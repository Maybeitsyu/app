import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const files = [
  'example xl/agriledger back up FIXED.xlsx',
  'example xl/example.xlsx'
];

async function run() {
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.log(`File not found: ${file}`);
      continue;
    }
    console.log(`\n========================================`);
    console.log(`Analyzing file: ${file}`);
    console.log(`========================================`);
    
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.readFile(file);
      console.log('Sheets in workbook:', workbook.worksheets.map(w => w.name));
      
      for (const sheet of workbook.worksheets) {
        // Find header row
        let headers = [];
        let headerRowNumber = -1;
        for (let i = 1; i <= sheet.rowCount; i++) {
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
          continue;
        }
        
        // Get columns
        const cleanHeaders = headers.map(h => h ? h.replace(/[^A-Z0-9]/g, '') : '');
        const dateIdx = cleanHeaders.findIndex(h => h === 'DATE');
        const totalCostIdx = cleanHeaders.findIndex(h => h === 'TOTALCOST' || h === 'COST');
        
        let minDate = null;
        let maxDate = null;
        let totalCostSum = 0;
        let rowCount = 0;
        
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber <= headerRowNumber) return;
          
          const dateCell = row.getCell(dateIdx);
          let dateVal = dateCell.value;
          let dateStr = '';
          if (dateCell.type === ExcelJS.ValueType.Date || dateVal instanceof Date) {
            dateStr = dateVal.toISOString().slice(0, 10);
          } else if (dateVal) {
            dateStr = dateVal.toString().trim();
          }
          
          if (!dateStr || dateStr.toUpperCase() === 'DATE') return;
          
          rowCount++;
          if (!minDate || dateStr < minDate) minDate = dateStr;
          if (!maxDate || dateStr > maxDate) maxDate = dateStr;
          
          const costCell = row.getCell(totalCostIdx);
          let costVal = costCell.value;
          if (costVal && typeof costVal === 'object' && costVal.result !== undefined) costVal = costVal.result;
          if (typeof costVal === 'string') costVal = parseFloat(costVal.replace(/[₱,\s]/g, '')) || 0;
          if (typeof costVal === 'number') totalCostSum += costVal;
        });
        
        console.log(`Sheet: "${sheet.name}"`);
        console.log(`  Row count:     ${rowCount}`);
        console.log(`  Date range:    ${minDate} to ${maxDate}`);
        console.log(`  Total Cost:    ₱${totalCostSum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
      }
    } catch (err) {
      console.error(`Error reading ${file}:`, err.message);
    }
  }
}

run().catch(console.error);
