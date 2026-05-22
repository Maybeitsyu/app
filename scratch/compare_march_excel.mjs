import ExcelJS from 'exceljs';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const excelPath = 'example xl/example.xlsx';

async function run() {
  const db = new DatabaseSync(dbPath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  const sheet = workbook.getWorksheet('1ST QTR SALES 2026');
  if (!sheet) {
    console.log('Sheet 1ST QTR SALES 2026 not found!');
    return;
  }

  const headerRowNumber = 2;
  const headers = [];
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    let v = cell.value;
    if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
    if (v !== null && v !== undefined) headers[colNumber] = v.toString().toUpperCase().trim();
  });

  const getColIdx = (keys) => {
    for (const k of keys) {
      const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const idx = headers.findIndex(h => h && h.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanK);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const dateColIdx = getColIdx(['DATE']);
  const siColIdx = getColIdx(['SI NO.', 'SI NO', 'SI_NO', 'SI']);
  const customerColIdx = getColIdx(['NAME/TRADE NAME', 'CUSTOMER']);
  const productColIdx = getColIdx(['PRODUCT']);
  const qtyColIdx = getColIdx(['QTY']);
  const priceColIdx = getColIdx(['PRICE UNIT', 'UNIT PRICE']);
  const costingColIdx = getColIdx(['COSTING']);
  const totalCostColIdx = getColIdx(['TOTAL COSTING', 'TOTAL COST']);
  const tinColIdx = getColIdx(['TAX IDENTIFICATION NUMBER', 'TIN']);

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

  const excelMarchRows = [];
  
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    
    const dateCell = row.getCell(dateColIdx);
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
    
    let parsedDate = null;
    if (dateStr) {
      const parsed = Date.parse(dateStr);
      if (!isNaN(parsed)) {
        parsedDate = new Date(parsed).toISOString().slice(0, 10);
      }
    }
    
    if (!parsedDate || !parsedDate.startsWith('2026-03')) {
      return;
    }
    
    const product = getString(row, productColIdx);
    const si = getString(row, siColIdx);
    const qty = getVal(row, qtyColIdx);
    const price = getVal(row, priceColIdx);
    const costing = getVal(row, costingColIdx);
    const totalCost = getVal(row, totalCostColIdx);
    const customer = getString(row, customerColIdx);
    const tinVal = getString(row, tinColIdx);
    
    const isCancelled = tinVal.toUpperCase().includes('CANCEL') || si.toUpperCase().includes('CANCEL') || customer.toUpperCase().includes('CANCEL');

    excelMarchRows.push({
      rowNumber,
      date: parsedDate,
      si,
      customer,
      product,
      qty,
      price,
      costing,
      totalCost,
      isCancelled
    });
  });

  const activeExcelRows = excelMarchRows.filter(row => !row.isCancelled && row.product);
  const activeExcelSum = activeExcelRows.reduce((sum, r) => sum + r.totalCost, 0);
  
  const dbMarchRows = db.prepare(`
    SELECT 
      s.id as sale_id,
      s.date,
      s.si_number,
      p.name as product_name,
      si.qty,
      si.unit_price,
      si.costing,
      si.total_cost
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.id
    LEFT JOIN products p ON si.product_id = p.id
    WHERE s.status NOT IN ('FAILED', 'Return')
      AND s.date >= '2026-03-01' AND s.date <= '2026-03-31'
    ORDER BY s.date, s.si_number
  `).all();
  
  const dbMarchSum = dbMarchRows.reduce((sum, r) => sum + r.total_cost, 0);

  let out = '';
  out += `Excel File: ${excelPath}\n`;
  out += `Excel Sheet: 1ST QTR SALES 2026 (filtered for March 2026)\n\n`;
  out += `Active Excel Rows Count: ${activeExcelRows.length}\n`;
  out += `Excel Total Costing Sum: ₱${activeExcelSum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}\n\n`;
  out += `Active DB Rows Count:    ${dbMarchRows.length}\n`;
  out += `DB Total Costing Sum:       ₱${dbMarchSum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}\n\n`;
  out += `Difference (DB - Excel):  ₱${(dbMarchSum - activeExcelSum).toLocaleString('en-PH', { minimumFractionDigits: 2 })}\n\n`;

  out += `========================================\n`;
  out += `DISCREPANCIES & UNMATCHED ROWS\n`;
  out += `========================================\n\n`;

  let unmatchedDb = [...dbMarchRows];
  let matchedCount = 0;
  
  for (const xl of activeExcelRows) {
    const nSi = xl.si.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const nProd = xl.product.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    const matchIdx = unmatchedDb.findIndex(dbRow => {
      const dbSi = (dbRow.si_number || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const dbProd = (dbRow.product_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      
      const siMatch = dbSi === nSi;
      const prodMatch = dbProd === nProd || dbProd.includes(nProd) || nProd.includes(dbProd);
      const qtyMatch = Math.abs(dbRow.qty - xl.qty) < 0.01;
      
      return siMatch && prodMatch && qtyMatch;
    });
    
    if (matchIdx !== -1) {
      const dbRow = unmatchedDb[matchIdx];
      unmatchedDb.splice(matchIdx, 1);
      matchedCount++;
      
      const costDiff = dbRow.total_cost - xl.totalCost;
      if (Math.abs(costDiff) > 0.01) {
        out += `[COST_MISMATCH] Excel Row ${xl.rowNumber}: SI "${xl.si}", Product "${xl.product}", Customer "${xl.customer}"\n`;
        out += `  Excel: Qty=${xl.qty}, Price=${xl.price}, Costing=${xl.costing}, TotalCost=${xl.totalCost}\n`;
        out += `  DB:    Qty=${dbRow.qty}, Price=${dbRow.unit_price}, Costing=${dbRow.costing}, TotalCost=${dbRow.total_cost}\n`;
        out += `  Diff:  ${costDiff.toFixed(2)}\n\n`;
      }
    } else {
      out += `[UNMATCHED_EXCEL] Excel Row ${xl.rowNumber}: Date "${xl.date}", SI "${xl.si}", Product "${xl.product}", Customer "${xl.customer}"\n`;
      out += `  Excel: Qty=${xl.qty}, Price=${xl.price}, Costing=${xl.costing}, TotalCost=${xl.totalCost}\n\n`;
    }
  }
  
  out += `Matched Count: ${matchedCount}\n`;
  out += `Unmatched DB Rows Count: ${unmatchedDb.length}\n\n`;
  
  if (unmatchedDb.length > 0) {
    out += `Unmatched DB Rows:\n`;
    unmatchedDb.forEach(r => {
      out += `  SI: "${r.si_number}", Date: "${r.date}", Product: "${r.product_name}", Qty=${r.qty}, Price=${r.unit_price}, Costing=${r.costing}, TotalCost=${r.total_cost}\n`;
    });
  }

  fs.writeFileSync('scratch/march_discrepancies.txt', out, 'utf8');
  console.log('Wrote discrepancies report to scratch/march_discrepancies.txt');

  db.close();
}

run().catch(console.error);
