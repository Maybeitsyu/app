import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const files = [
  'example xl/agriledger back up.xlsx',
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
          const rowStr = rowVals.join(' | ');
          if (rowStr.includes('PRODUCT') && rowStr.includes('DATE')) {
            headers = rowVals;
            headerRowNumber = i;
            break;
          }
        }
        
        if (headerRowNumber === -1) {
          continue;
        }
        
        // Get columns
        const cleanHeaders = headers.map(h => h ? h.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');
        const dateIdx = cleanHeaders.findIndex(h => h === 'DATE');
        const productIdx = cleanHeaders.findIndex(h => h === 'PRODUCT');
        const qtyIdx = cleanHeaders.findIndex(h => h === 'QTY' || h === 'QUANTITY');
        const costIdx = cleanHeaders.findIndex(h => h === 'COSTING' || h === 'UNITCOST');
        const totalCostIdx = cleanHeaders.findIndex(h => h === 'TOTALCOSTING' || h === 'TOTALCOST' || h === 'COST');
        const tinIdx = cleanHeaders.findIndex(h => h === 'TAXIDENTIFICATIONNUMBER' || h === 'TIN');
        const siIdx = cleanHeaders.findIndex(h => h === 'SINO' || h === 'SI');
        const customerIdx = cleanHeaders.findIndex(h => h === 'NAMETRADENAME' || h === 'CUSTOMER');
        
        let minDate = null;
        let maxDate = null;
        let totalCostSum = 0;
        let totalCostSumMarch = 0;
        let rowCount = 0;
        let marchRowCount = 0;
        
        const getVal = (row, idx) => {
          if (idx === -1) return 0;
          const cell = row.getCell(idx);
          if (!cell || cell.value === null || cell.value === undefined) return 0;
          let val = cell.value;
          if (val && typeof val === 'object' && val.result !== undefined) val = val.result;
          if (typeof val === 'string') return parseFloat(val.replace(/[₱,\s]/g, '')) || 0;
          return parseFloat(val) || 0;
        };

        const getString = (row, idx) => {
          if (idx === -1) return '';
          const cell = row.getCell(idx);
          if (!cell || cell.value === null || cell.value === undefined) return '';
          let val = cell.value;
          if (val && typeof val === 'object' && val.result !== undefined) val = val.result;
          return val.toString().trim();
        };

        sheet.eachRow((row, rowNumber) => {
          if (rowNumber <= headerRowNumber) return;
          
          const dateCell = dateIdx !== -1 ? row.getCell(dateIdx) : null;
          if (!dateCell) return;
          let dateVal = dateCell.value;
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
          
          if (!dateStr || dateStr.toUpperCase() === 'DATE') return;
          
          let parsedDate = null;
          const parsed = Date.parse(dateStr);
          if (!isNaN(parsed)) {
            parsedDate = new Date(parsed).toISOString().slice(0, 10);
          }
          
          if (!parsedDate) return;
          
          rowCount++;
          if (!minDate || parsedDate < minDate) minDate = parsedDate;
          if (!maxDate || parsedDate > maxDate) maxDate = parsedDate;
          
          const totalCostVal = getVal(row, totalCostIdx);
          const productVal = getString(row, productIdx);
          const siVal = getString(row, siIdx);
          const customerVal = getString(row, customerIdx);
          const tinVal = getString(row, tinIdx);
          
          const isCancelled = tinVal.toUpperCase().includes('CANCEL') || siVal.toUpperCase().includes('CANCEL') || customerVal.toUpperCase().includes('CANCEL');
          
          if (isCancelled || !productVal) return;

          totalCostSum += totalCostVal;
          
          if (parsedDate.startsWith('2026-03')) {
            marchRowCount++;
            totalCostSumMarch += totalCostVal;
          }
        });
        
        console.log(`Sheet: "${sheet.name}"`);
        console.log(`  Total row count:     ${rowCount}`);
        console.log(`  Date range:          ${minDate} to ${maxDate}`);
        console.log(`  March row count:     ${marchRowCount}`);
        console.log(`  Total Cost (All):    ₱${totalCostSum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
        console.log(`  Total Cost (March):  ₱${totalCostSumMarch.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
      }
    } catch (err) {
      console.error(`Error reading ${file}:`, err);
    }
  }
}

run().catch(console.error);
