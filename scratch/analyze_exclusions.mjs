import fs from 'fs';

const xlRows = JSON.parse(fs.readFileSync('scratch/excel_cogs_details.json', 'utf8'));

console.log('--- Checking all Excel rows and their remarks ---');
const remarksGroups = {};
xlRows.forEach(row => {
  remarksGroups[row.remarks] = (remarksGroups[row.remarks] || 0) + 1;
});
console.log('Remarks count breakdown:', remarksGroups);

console.log('\n--- Checking rows with Return, Cancel, Void, or Failed in Excel ---');
let excludedSum = 0;
xlRows.forEach(row => {
  const remarksUpper = row.remarks.toUpperCase();
  const isExcluded = remarksUpper.includes('RETURN') || 
                    remarksUpper.includes('CANCEL') || 
                    remarksUpper.includes('VOID') || 
                    remarksUpper.includes('FAILED');
  if (isExcluded) {
    console.log(`Row ${row.rowNumber}: SI="${row.si}", Product="${row.product}", Qty=${row.qty}, Costing=${row.costing}, TotalCost=${row.totalCost}, Remarks="${row.remarks}"`);
    excludedSum += row.totalCost;
  }
});
console.log(`Total cost of Return/Cancel/Void/Failed rows in Excel: ₱${excludedSum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);

console.log('\n--- Checking for any row (active or excluded) where TotalCost is exactly 3000 ---');
xlRows.forEach(row => {
  if (Math.abs(row.totalCost - 3000) < 0.01) {
    console.log(`Row ${row.rowNumber}: SI="${row.si}", Product="${row.product}", Qty=${row.qty}, Costing=${row.costing}, TotalCost=${row.totalCost}, Remarks="${row.remarks}"`);
  }
});

console.log('\n--- Checking for any row (active or excluded) where Qty * Costing is exactly 3000 ---');
xlRows.forEach(row => {
  const calc = row.qty * row.costing;
  if (Math.abs(calc - 3000) < 0.01) {
    console.log(`Row ${row.rowNumber}: SI="${row.si}", Product="${row.product}", Qty=${row.qty}, Costing=${row.costing}, CalcCost=${calc}, Remarks="${row.remarks}"`);
  }
});

console.log('\n--- Checking for combinations or subtotals matching 1,475,611.12 or 1,478,611.12 ---');
// Let's see if we can find a subset of Excel rows that adds up to 1,475,611.12 or 1,478,611.12.
// Wait! If the overall sum is 1,576,352.02, then the difference from 1,478,611.12 is 97,740.90, and from 1,475,611.12 is 100,740.90.
// Let's see if there are columns or filters that we can apply to Excel.
// Let's filter by Company Name in the Excel sheet!
const companySums = {};
xlRows.forEach(row => {
  const comp = row.company || 'Unknown';
  companySums[comp] = (companySums[comp] || 0) + row.totalCost;
});
console.log('Sums by Company in Excel:', companySums);

const channelSums = {};
xlRows.forEach(row => {
  const chan = row.channel || 'Unknown';
  channelSums[chan] = (channelSums[chan] || 0) + row.totalCost;
});
console.log('Sums by Channel in Excel:', channelSums);
