import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const excelPath = 'example xl/agriledger back up.xlsx';

console.log('Opening database:', dbPath);
console.log('Opening Excel:', excelPath);

if (!fs.existsSync(dbPath)) {
  console.log('Database does not exist!');
  process.exit(1);
}

if (!fs.existsSync(excelPath)) {
  console.log('Excel file does not exist!');
  process.exit(1);
}

async function run() {
  const db = new DatabaseSync(dbPath);
  
  // Load workbook
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  // Let's list sheet names
  console.log('Sheets in workbook:', workbook.worksheets.map(w => w.name));
  
  const sheet = workbook.getWorksheet('SALES MAY 2026');
  if (!sheet) {
    console.log('Sheet SALES MAY 2026 not found!');
    return;
  }
  
  // Find header row in sheet
  let headers = [];
  let headerRowNumber = -1;
  for (let i = 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const rowVals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      let v = cell.value;
      if (v && typeof v === 'object') {
        if (v.result !== undefined) v = v.result;
      }
      if (v !== null && v !== undefined) {
        rowVals[colNumber] = v.toString().toUpperCase().trim();
      }
    });
    if (rowVals.join(' | ').includes('PRODUCT') && rowVals.join(' | ').includes('DATE')) {
      headers = rowVals;
      headerRowNumber = i;
      break;
    }
  }
  
  console.log('Header row number:', headerRowNumber);
  
  const getColIdx = (keys) => {
    for (const k of keys) {
      const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const idx = headers.findIndex(h => h && h.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanK);
      if (idx !== -1) return idx;
    }
    return -1;
  };
  
  const dateColIdx = getColIdx(['DATE']);
  const siColIdx = getColIdx(['SI NUMBER', 'SI NO.', 'SI_NO', 'SI NO', 'SI']);
  const productColIdx = getColIdx(['PRODUCT', 'PRODUCT NAME']);
  const qtyColIdx = getColIdx(['QTY', 'QUANTITY']);
  const costingColIdx = getColIdx(['COSTING', 'UNIT COST']);
  const totalCostColIdx = getColIdx(['TOTAL COST', 'TOTALCOST', 'COST']);
  const remarksColIdx = getColIdx(['REMARKS', 'STATUS']);
  
  const getVal = (row, colIdx) => {
    if (colIdx === -1) return 0;
    const cell = row.getCell(colIdx);
    if (!cell || cell.value === null || cell.value === undefined) return 0;
    let val = cell.value;
    if (val && typeof val === 'object') {
      if (val.result !== undefined) val = val.result;
    }
    if (typeof val === 'string') return parseFloat(val.replace(/[₱,\s]/g, '')) || 0;
    return parseFloat(val) || 0;
  };
  
  const getString = (row, colIdx) => {
    if (colIdx === -1) return '';
    const cell = row.getCell(colIdx);
    if (!cell || cell.value === null || cell.value === undefined) return '';
    let val = cell.value;
    if (val && typeof val === 'object') {
      if (val.result !== undefined) val = val.result;
    }
    return val.toString().trim();
  };

  // Get all active sales from DB
  const dbSales = db.prepare(`
    SELECT 
      s.id as sale_id,
      s.date,
      s.si_number,
      s.remarks,
      s.status,
      p.name as product_name,
      si.qty,
      si.unit_price,
      si.costing,
      si.total_cost
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.id
    LEFT JOIN products p ON si.product_id = p.id
    WHERE s.status NOT IN ('FAILED', 'Return')
    ORDER BY s.date, s.si_number
  `).all();
  
  console.log(`Loaded ${dbSales.length} non-failed/non-returned sale items from DB.`);
  
  // Parse excel rows and compute total cost
  let excelQtyTotal = 0;
  let excelCostingTotal = 0;
  let excelTotalCostSum = 0;
  let excelCalculatedTotalCostSum = 0;
  const excelRows = [];
  
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    
    const product = getString(row, productColIdx);
    if (!product) return;
    
    const dateCell = row.getCell(dateColIdx);
    let dateStr = '';
    if (dateCell.type === ExcelJS.ValueType.Date || dateCell.value instanceof Date) {
      dateStr = dateCell.value.toISOString().slice(0, 10);
    } else if (dateCell.value) {
      dateStr = dateCell.value.toString().trim();
    }
    
    const si = getString(row, siColIdx);
    const qty = getVal(row, qtyColIdx);
    const costing = getVal(row, costingColIdx);
    const totalCost = getVal(row, totalCostColIdx);
    const remarks = getString(row, remarksColIdx);
    
    // Skip failed or return rows if they are excluded in Excel too
    const remarksUpper = remarks.toUpperCase();
    const isExcluded = remarksUpper.includes('RETURN') || remarksUpper.includes('CANCEL') || remarksUpper.includes('VOID') || remarksUpper.includes('FAILED');
    
    const calculatedTotalCost = Number((qty * costing).toFixed(2));
    
    if (!isExcluded) {
      excelQtyTotal += qty;
      excelCostingTotal += costing;
      excelTotalCostSum += totalCost;
      excelCalculatedTotalCostSum += calculatedTotalCost;
    }
    
    excelRows.push({
      rowNumber,
      date: dateStr,
      si,
      product,
      qty,
      costing,
      totalCost,
      calculatedTotalCost,
      remarks,
      isExcluded
    });
  });
  
  console.log('\n--- Excel Totals (Excluding Return/Failed/Void) ---');
  console.log('Total Cost Sum (from Excel column):', excelTotalCostSum.toFixed(2));
  console.log('Calculated Total Cost Sum (Qty * Costing):', excelCalculatedTotalCostSum.toFixed(2));
  
  // Now let's try to match them up!
  console.log('\n--- Comparing Excel and Database ---');
  let matchedCount = 0;
  let unmatchedExcel = [];
  let unmatchedDb = [...dbSales];
  
  for (const xlRow of excelRows) {
    if (xlRow.isExcluded) continue;
    
    // Find matching row in DB
    const matchIdx = unmatchedDb.findIndex(dbRow => {
      // Match by SI number (normalized) and Product (normalized) and Qty
      const normDbSi = (dbRow.si_number || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const normXlSi = (xlRow.si || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const normDbProd = (dbRow.product_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const normXlProd = (xlRow.product || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      
      const siMatch = normDbSi === normXlSi;
      const prodMatch = normDbProd === normXlProd || normDbProd.includes(normXlProd) || normXlProd.includes(normDbProd);
      const qtyMatch = Math.abs(dbRow.qty - xlRow.qty) < 0.01;
      
      return siMatch && prodMatch && qtyMatch;
    });
    
    if (matchIdx !== -1) {
      const dbRow = unmatchedDb[matchIdx];
      unmatchedDb.splice(matchIdx, 1);
      matchedCount++;
      
      const costDiff = dbRow.total_cost - xlRow.totalCost;
      const calcCostDiff = dbRow.total_cost - xlRow.calculatedTotalCost;
      
      if (Math.abs(costDiff) > 0.01 || Math.abs(calcCostDiff) > 0.01) {
        console.log(`\nDiscrepancy in matched row:`);
        console.log(`  Excel Row: ${xlRow.rowNumber}, SI: "${xlRow.si}", Product: "${xlRow.product}"`);
        console.log(`  Excel values: Qty=${xlRow.qty}, Costing=${xlRow.costing}, TotalCostCol=${xlRow.totalCost}, CalcTotalCost=${xlRow.calculatedTotalCost}`);
        console.log(`  DB values:    Qty=${dbRow.qty}, Costing=${dbRow.costing}, TotalCost=${dbRow.total_cost}`);
        console.log(`  Differences:  DB vs ExcelCol = ${costDiff.toFixed(2)}, DB vs ExcelCalc = ${calcCostDiff.toFixed(2)}`);
      }
    } else {
      unmatchedExcel.push(xlRow);
    }
  }
  
  console.log(`\nMatched rows count: ${matchedCount}`);
  console.log(`Unmatched Excel rows: ${unmatchedExcel.length}`);
  if (unmatchedExcel.length > 0) {
    console.log('Sample unmatched Excel rows:', unmatchedExcel.slice(0, 10).map(r => ({ row: r.rowNumber, si: r.si, product: r.product, qty: r.qty, totalCost: r.totalCost })));
  }
  
  console.log(`Unmatched DB rows: ${unmatchedDb.length}`);
  if (unmatchedDb.length > 0) {
    console.log('Sample unmatched DB rows:', unmatchedDb.slice(0, 10).map(r => ({ si: r.si_number, product: r.product_name, qty: r.qty, total_cost: r.total_cost, remarks: r.remarks, status: r.status })));
  }
  
  db.close();
}

run().catch(console.error);
