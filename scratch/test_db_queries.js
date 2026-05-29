import Database from 'better-sqlite3';

const dbPath = 'agridbfgh.db';
const db = new Database(dbPath);

console.log("=== Testing listProducts SQL query projection ===");
const query = "";
const cat = "all";

const params = [];
let sql = `
  SELECT p.*, 
    COALESCE((SELECT SUM(b.remaining_qty) FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0), 0) + p.stock_qty AS current_stock,
    (SELECT b.srp FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date DESC, b.created_at DESC LIMIT 1) AS current_srp,
    (SELECT b.unit_cost FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC LIMIT 1) AS oldest_cost_basis,
    (SELECT b.unit_cost FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date DESC, b.created_at DESC LIMIT 1) AS current_cost_basis,
    (SELECT b.remaining_qty FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC LIMIT 1) AS oldest_batch_stock,
    (SELECT json_group_array(json_object('batch_number', b.batch_number, 'date', b.date, 'remaining_qty', b.remaining_qty, 'srp', b.srp, 'unit_cost', b.unit_cost)) FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC) AS active_batches
  FROM products p
`;

try {
    const rows = db.prepare(sql).all(...params);
    console.log(`Successfully retrieved ${rows.length} products.`);
    
    // Find a product with active batches to print
    const rowWithBatches = rows.find(r => {
        if (!r.active_batches) return false;
        try {
            const parsed = JSON.parse(r.active_batches);
            return Array.isArray(parsed) && parsed.length > 0 && parsed[0].remaining_qty !== null;
        } catch {
            return false;
        }
    });

    if (rowWithBatches) {
        console.log(`\nFound product with active batches: "${rowWithBatches.name}"`);
        console.log("JSON parsed active_batches:");
        console.log(JSON.parse(rowWithBatches.active_batches));
    } else {
        console.log("\nNo products with active batches found in agridbfgh.db, let's look at all active batches:");
        const allBatches = db.prepare("SELECT * FROM batches WHERE remaining_qty > 0").all();
        console.log(allBatches);
    }
} catch (error) {
    console.error("SQL Execution failed:", error);
}

db.close();
