import ExcelJS from 'exceljs';
import fs from 'fs';

const excelPath = 'example xl/agriledger back up.xlsx';

async function run() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  for (const sheet of workbook.worksheets) {
    console.log(`Sheet: "${sheet.name}"`);
    
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
      console.log('  No headers found (not a standard sales/purchases sheet)');
      continue;
    }
    
    // Get date column index
    const cleanHeaders = headers.map(h => h ? h.replace(/[^A-Z0-9]/g, '') : '');
    const dateIdx = cleanHeaders.findIndex(h => h === 'DATE');
    const totalCostIdx = cleanHeaders.findIndex(h => h === 'TOTALCOST' || h === 'COST');
    const companyIdx = cleanHeaders.findIndex(h => h === 'COMPANYNAME' || h === 'COMPANY');
    
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
    
    console.log(`  Row count:     ${rowCount}`);
    console.log(`  Date range:    ${minDate} to ${maxDate}`);
    console.log(`  Total Cost:    ₱${totalCostSum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
  }
}

run().catch(console.error);
