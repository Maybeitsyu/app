import ExcelJS from 'exceljs';

const filePath = 'C:\\projct ni client\\app\\example xl\\agriledger back new.xlsx';
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(filePath);

const marchSheet = workbook.getWorksheet('MARCH SALES');

console.log('═══════════════════════════════════════════════════════════════');
console.log('MARCH SALES EXCEL FILE - DETAILED ANALYSIS');
console.log('═══════════════════════════════════════════════════════════════\n');

const headers = [];
const data = [];
let totalCostFromExcel = 0;
let calculatedTotal = 0;
let anomalies = [];

marchSheet.eachRow((row, rowNum) => {
  if (rowNum === 1) {
    row.values.forEach((val, idx) => {
      if (idx > 0) {  // Skip first empty element
        headers.push(String(val || '').trim());
      }
    });
  } else {
    const values = {};
    row.values.forEach((val, idx) => {
      if (idx > 0 && headers[idx - 1]) {  // Skip first element
        values[headers[idx - 1]] = val;
      }
    });
    if (Object.keys(values).length > 0) {
      data.push(values);
    }
  }
});

console.log(`Total rows in sheet: ${data.length + 1} (including header)`);
console.log(`Data rows: ${data.length}\n`);

// Find column indices
const dateIdx = headers.findIndex(h => h && h.toUpperCase().includes('DATE'));
const productIdx = headers.findIndex(h => h && h.toUpperCase().includes('PRODUCT'));
const qtyIdx = headers.findIndex(h => h && h.toUpperCase().includes('QTY'));
const costingIdx = headers.findIndex(h => h && h.toUpperCase().includes('COSTING'));
const totalCostIdx = headers.findIndex(h => h && h.toUpperCase().includes('TOTAL') && h.toUpperCase().includes('COST'));

console.log(`Column Mapping:`);
console.log(`  Product (idx ${productIdx}): ${headers[productIdx]}`);
console.log(`  Qty (idx ${qtyIdx}): ${headers[qtyIdx]}`);
console.log(`  Costing (idx ${costingIdx}): ${headers[costingIdx]}`);
console.log(`  Total Cost (idx ${totalCostIdx}): ${headers[totalCostIdx]}\n`);

// Analyze each row
data.forEach((row, idx) => {
  const product = row[headers[productIdx]] || '';
  const qty = parseFloat(row[headers[qtyIdx]]) || 0;
  const costing = parseFloat(row[headers[costingIdx]]) || 0;
  const totalCost = parseFloat(row[headers[totalCostIdx]]) || 0;
  const calculated = qty * costing;
  const variance = totalCost - calculated;
  
  totalCostFromExcel += totalCost;
  calculatedTotal += calculated;
  
  if (Math.abs(variance) > 0.01) {
    anomalies.push({
      row: idx + 2,
      product,
      qty,
      costing,
      totalCost,
      calculated,
      variance
    });
  }
  
  // Show first 10 rows
  if (idx < 10) {
    console.log(`Row ${idx + 2}: ${String(product).padEnd(20)} | Qty: ${qty.toString().padEnd(4)} | Cost: ₱${costing.toFixed(2).padEnd(8)} | Total (Excel): ₱${totalCost.toFixed(2)} | Calc: ₱${calculated.toFixed(2)} | Var: ${variance > 0 ? '+' : ''}₱${variance.toFixed(2)}`);
  }
});

console.log(`\n... (${data.length - 10} more rows)\n`);

console.log('═'.repeat(63));
console.log('MARCH 2026 TOTALS:');
console.log(`  Excel TOTAL COST column sum:   ₱${totalCostFromExcel.toFixed(2)}`);
console.log(`  Calculated (∑ qty × costing):  ₱${calculatedTotal.toFixed(2)}`);
console.log(`  Difference:                    ₱${(totalCostFromExcel - calculatedTotal).toFixed(2)}`);
console.log(`\n  Database after fix:            ₱1,478,259.35`);
console.log(`  Gap to database:               ₱${(totalCostFromExcel - 1478259.35).toFixed(2)}`);
console.log('═'.repeat(63));

if (anomalies.length > 0) {
  console.log(`\n⚠️  ANOMALIES FOUND: ${anomalies.length} items with variance\n`);
  anomalies.forEach(a => {
    console.log(`  Row ${a.row}: ${a.product}`);
    console.log(`    Qty: ${a.qty}, Costing: ₱${a.costing.toFixed(2)}`);
    console.log(`    Excel Total Cost: ₱${a.totalCost.toFixed(2)}`);
    console.log(`    Calculated: ₱${a.calculated.toFixed(2)}`);
    console.log(`    Variance: ${a.variance > 0 ? '+' : ''}₱${a.variance.toFixed(2)}`);
    console.log();
  });
  
  // Sum of anomalies
  const sumAnomalies = anomalies.reduce((sum, a) => sum + a.variance, 0);
  console.log(`Total variance from anomalies: ₱${sumAnomalies.toFixed(2)}`);
} else {
  console.log(`\n✓ No anomalies - Excel is internally consistent`);
}

console.log('\n═══════════════════════════════════════════════════════════════');
