import ExcelJS from 'exceljs';

const filePath = 'C:\\projct ni client\\app\\example xl\\agriledger back new.xlsx';

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(filePath);

console.log('═══════════════════════════════════════════════════════════════');
console.log('ANALYZING EXCEL FILE');
console.log('═══════════════════════════════════════════════════════════════\n');

workbook.eachSheet((sheet, idx) => {
  console.log(`Sheet ${idx}: "${sheet.name}"`);
  console.log(`  Rows: ${sheet.rowCount}`);
  console.log(`  Columns: ${sheet.columnCount}`);
  
  // Show first 5 rows
  let rows = 0;
  sheet.eachRow((row, rowNum) => {
    if (rowNum <= 5) {
      const values = row.values.slice(1); // skip first empty element
      console.log(`    Row ${rowNum}: ${JSON.stringify(values)}`);
    }
    rows++;
  });
  
  console.log();
});

// Focus on March data if there's a sales sheet
const salesSheet = workbook.getWorksheet('SALES') || workbook.getWorksheet('Sales') || workbook.worksheets[0];

if (salesSheet) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('ANALYZING SALES DATA FOR MARCH 2026');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const headers = [];
  const rows = [];
  
  salesSheet.eachRow((row, rowNum) => {
    if (rowNum === 1) {
      row.values.forEach((val, idx) => {
        if (val) headers[idx] = val;
      });
      console.log('Headers:', headers.filter(h => h));
    } else {
      rows.push(row.values);
    }
  });
  
  console.log(`\nTotal data rows: ${rows.length}`);
  
  // Find date, qty, costing, total_cost columns
  const dateIdx = headers.findIndex(h => h && String(h).toUpperCase().includes('DATE'));
  const qtyIdx = headers.findIndex(h => h && String(h).toUpperCase().includes('QTY'));
  const costingIdx = headers.findIndex(h => h && String(h).toUpperCase().includes('COSTING'));
  const totalCostIdx = headers.findIndex(h => h && String(h).toUpperCase().includes('TOTAL COST'));
  const productIdx = headers.findIndex(h => h && String(h).toUpperCase().includes('PRODUCT'));
  
  console.log(`\nColumn indices:`);
  console.log(`  Date: ${dateIdx}, Qty: ${qtyIdx}, Costing: ${costingIdx}, Total Cost: ${totalCostIdx}, Product: ${productIdx}`);
  
  // Filter March 2026 rows
  const marchRows = rows.filter(row => {
    const dateVal = row[dateIdx];
    if (!dateVal) return false;
    const dateStr = String(dateVal);
    return dateStr.includes('2026-03') || dateStr.includes('3/') || dateStr.includes('/03/');
  });
  
  console.log(`\nMarch 2026 rows found: ${marchRows.length}`);
  
  if (marchRows.length > 0) {
    let marchTotal = 0;
    let marchVariances = [];
    
    marchRows.forEach((row, idx) => {
      const qty = parseFloat(row[qtyIdx]) || 0;
      const costing = parseFloat(row[costingIdx]) || 0;
      const totalCost = parseFloat(row[totalCostIdx]) || 0;
      const calculated = qty * costing;
      const variance = totalCost - calculated;
      
      marchTotal += totalCost;
      
      if (Math.abs(variance) > 0.01) {
        marchVariances.push({
          product: row[productIdx],
          qty,
          costing,
          totalCost,
          calculated,
          variance
        });
      }
      
      if (idx < 5) {
        console.log(`  Row ${idx + 1}: Product=${row[productIdx]}, Qty=${qty}, Costing=${costing}, TotalCost=${totalCost}, Variance=${variance.toFixed(2)}`);
      }
    });
    
    console.log(`\n... (${marchRows.length - 5} more rows)\n`);
    console.log(`MARCH 2026 TOTAL (from Excel): ₱${marchTotal.toFixed(2)}`);
    console.log(`Database total was: ₱1,478,259.35`);
    console.log(`Excel file you have: ₱1,475,611.12`);
    console.log(`Gap: ₱${(marchTotal - 1475611.12).toFixed(2)}`);
    
    if (marchVariances.length > 0) {
      console.log(`\nANOMALIES IN EXCEL (${marchVariances.length}):`);
      marchVariances.slice(0, 10).forEach(v => {
        console.log(`  ${v.product}: qty=${v.qty}, costing=₱${v.costing.toFixed(2)}, totalCost=₱${v.totalCost.toFixed(2)}, calc=₱${v.calculated.toFixed(2)}, var=₱${v.variance.toFixed(2)}`);
      });
    } else {
      console.log(`\n✓ No anomalies in Excel data (all qty × costing match)`);
    }
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
