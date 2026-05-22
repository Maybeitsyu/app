import fs from 'fs';

const dbRows = JSON.parse(fs.readFileSync('scratch/db_cogs_details.json', 'utf8'));
const xlRows = JSON.parse(fs.readFileSync('scratch/excel_cogs_details.json', 'utf8'));

console.log(`Loaded ${dbRows.length} active DB rows and ${xlRows.length} Excel rows.`);

// Normalize names for comparison
const normSi = (str) => (str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim();
const normProd = (str) => (str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim();

// Step 1: Let's see what is the total sum in Excel and DB
let excelSum = 0;
let excelSumExcludingReturns = 0;
xlRows.forEach(row => {
  excelSum += row.totalCost;
  const isExcluded = row.remarks.toUpperCase().includes('RETURN') || 
                    row.remarks.toUpperCase().includes('CANCEL') || 
                    row.remarks.toUpperCase().includes('VOID') || 
                    row.remarks.toUpperCase().includes('FAILED');
  if (!isExcluded) {
    excelSumExcludingReturns += row.totalCost;
  }
});

let dbSum = 0;
dbRows.forEach(row => {
  dbSum += row.total_cost;
});

console.log('\n--- Overall Sum Comparison ---');
console.log('Excel Total Cost (All rows):              ₱' + excelSum.toLocaleString('en-PH', { minimumFractionDigits: 2 }));
console.log('Excel Total Cost (Excluding returns/etc): ₱' + excelSumExcludingReturns.toLocaleString('en-PH', { minimumFractionDigits: 2 }));
console.log('DB Total Cost (Active rows in DB):        ₱' + dbSum.toLocaleString('en-PH', { minimumFractionDigits: 2 }));

// Let's filter Excel rows to only those that are NOT return/failed/cancel
const xlActiveRows = xlRows.filter(row => {
  const isExcluded = row.remarks.toUpperCase().includes('RETURN') || 
                    row.remarks.toUpperCase().includes('CANCEL') || 
                    row.remarks.toUpperCase().includes('VOID') || 
                    row.remarks.toUpperCase().includes('FAILED');
  return !isExcluded;
});

console.log(`Active Excel rows (excluding returns/etc): ${xlActiveRows.length}`);

// Step 2: Match them and search for mismatches
let unmatchedDb = [...dbRows];
let matched = [];
let discrepancies = [];

for (const xl of xlActiveRows) {
  const nSi = normSi(xl.si);
  const nProd = normProd(xl.product);
  
  // Find matching row in DB
  const matchIdx = unmatchedDb.findIndex(db => {
    const dbSi = normSi(db.si_number);
    const dbProd = normProd(db.product_name);
    
    // Match if SI and Product are same, and Qty is same
    const siMatch = dbSi === nSi;
    const prodMatch = dbProd === nProd || dbProd.includes(nProd) || nProd.includes(dbProd);
    const qtyMatch = Math.abs(db.qty - xl.qty) < 0.01;
    
    return siMatch && prodMatch && qtyMatch;
  });
  
  if (matchIdx !== -1) {
    const db = unmatchedDb[matchIdx];
    unmatchedDb.splice(matchIdx, 1);
    matched.push({ xl, db });
    
    const costDiff = Number((db.total_cost - xl.totalCost).toFixed(2));
    if (Math.abs(costDiff) > 0.01) {
      discrepancies.push({
        type: 'COST_MISMATCH',
        xlRow: xl.rowNumber,
        si: xl.si,
        product: xl.product,
        xlQty: xl.qty,
        xlCosting: xl.costing,
        xlTotalCost: xl.totalCost,
        dbTotalCost: db.total_cost,
        diff: costDiff
      });
    }
  } else {
    discrepancies.push({
      type: 'UNMATCHED_EXCEL_ROW',
      xlRow: xl.rowNumber,
      si: xl.si,
      product: xl.product,
      xlQty: xl.qty,
      xlCosting: xl.costing,
      xlTotalCost: xl.totalCost
    });
  }
}

console.log('\n--- MATCHING DISCREPANCIES ---');
console.log(`Unmatched active Excel rows: ${xlActiveRows.length - matched.length}`);
console.log(`Unmatched active DB rows: ${unmatchedDb.length}`);

if (discrepancies.length > 0) {
  console.log('\nList of discrepancies:');
  discrepancies.forEach(d => {
    console.log(JSON.stringify(d, null, 2));
  });
} else {
  console.log('No discrepancies found between active Excel rows and matched DB rows.');
}

if (unmatchedDb.length > 0) {
  console.log('\nUnmatched DB rows sum:', unmatchedDb.reduce((sum, r) => sum + r.total_cost, 0).toFixed(2));
  console.log('First 10 unmatched DB rows:', unmatchedDb.slice(0, 10));
}
