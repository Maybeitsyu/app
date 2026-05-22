const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve('C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db');
console.log('Opening real DB at:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.log('Database file does not exist at this path!');
  process.exit(1);
}

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Query 1: Total COGS in DB
  const cogsQuery = db.prepare(`
    SELECT 
      COALESCE(SUM(si.total_cost), 0) as total_cogs
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.id
    WHERE s.status NOT IN ('FAILED', 'Return')
  `).get();
  
  console.log('--- Database COGS Summary ---');
  console.log('Total COGS (excluding FAILED/Return):', cogsQuery.total_cogs);

  // Query 2: Let's sum by product in the DB
  const byProduct = db.prepare(`
    SELECT 
      si.product_id,
      p.name as product_name,
      SUM(si.qty) as total_qty,
      SUM(si.total_cost) as total_cost
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.id
    LEFT JOIN products p ON si.product_id = p.id
    WHERE s.status NOT IN ('FAILED', 'Return')
    GROUP BY si.product_id
    ORDER BY total_cost DESC
  `).all();
  
  console.log('\n--- COGS by Product in DB ---');
  byProduct.forEach(row => {
    console.log(`${row.product_name || 'Unknown'}: Qty=${row.total_qty}, TotalCost=${row.total_cost}`);
  });

  // Query 3: Dump all sale items with non-zero total_cost in DB to a JSON file for detailed comparison
  const allItems = db.prepare(`
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
  
  fs.writeFileSync('scratch/db_cogs_details.json', JSON.stringify(allItems, null, 2), 'utf8');
  console.log('\nDetailed sale items written to scratch/db_cogs_details.json');

  // Let's search if any specific row or set of rows has an unexpected total_cost or unit cost
  console.log('\n--- Checking for anomalies (e.g. costing=0, total_cost not matching qty * costing) ---');
  let anomaliesCount = 0;
  allItems.forEach(item => {
    const expected = Number((item.qty * item.costing).toFixed(2));
    if (Math.abs(item.total_cost - expected) > 0.01) {
      console.log(`Anomaly: SI=${item.si_number}, Product=${item.product_name}, Qty=${item.qty}, Costing=${item.costing}, DB TotalCost=${item.total_cost}, Expected=${expected}`);
      anomaliesCount++;
    }
  });
  console.log(`Total anomalies found: ${anomaliesCount}`);
  
} catch (e) {
  console.error(e.stack);
}
