import ExcelJS from 'exceljs';
import fs from 'fs';

const excelPath = 'example xl/agriledger back up.xlsx';

async function run() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  const sheet = workbook.getWorksheet('SALES MAY 2026');
  
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
  const companyColIdx = getColIdx(['COMPANY NAME', 'COMPANYNAME', 'COMPANY']);
  const channelColIdx = getColIdx(['INVOICE', 'CHANNEL']);
  
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

  const rows = [];
  
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
    const company = getString(row, companyColIdx);
    const channel = getString(row, channelColIdx);
    
    rows.push({
      rowNumber,
      date: dateStr,
      si,
      product,
      qty,
      costing,
      totalCost,
      remarks,
      company,
      channel
    });
  });
  
  fs.writeFileSync('scratch/excel_cogs_details.json', JSON.stringify(rows, null, 2), 'utf8');
  console.log(`Wrote ${rows.length} rows to scratch/excel_cogs_details.json`);
}

run().catch(console.error);
