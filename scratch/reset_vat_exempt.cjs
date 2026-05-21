const path = require('path');
const Database = require('better-sqlite3');

// Path to the production DB used by the app
const dbPath = 'C:/Users/ufuni/AppData/Roaming/AgriLedger/data/agridb.db';
const db = new Database(dbPath);

function round(val) {
  return Math.round(val * 100) / 100;
}

function updateSale(saleId, gross) {
  // Calculate input VAT (net price) and output VAT (VAT amount)
  const inputVat = round(gross / 1.12);
  const outputVat = round(gross - inputVat);
  // Compute profit = gross - sum(total_cost of items)
  const totalCostRow = db.prepare('SELECT SUM(total_cost) AS sumCost FROM sale_items WHERE sale_id = ?').get(saleId);
  const totalCost = totalCostRow.sumCost || 0;
  const profit = round(gross - totalCost);

  db.prepare(`UPDATE sales SET input_vat = ?, output_vat = ?, vat_exempt_amount = 0, profit = ?, updated_at = datetime('now') WHERE id = ?`).run(inputVat, outputVat, profit, saleId);

  // Also update all items belonging to this sale
  const items = db.prepare('SELECT id, gross_amount FROM sale_items WHERE sale_id = ?').all(saleId);
  for (const it of items) {
    const itInputVat = round(it.gross_amount / 1.12);
    const itOutputVat = round(it.gross_amount - itInputVat);
    const itProfit = round(it.gross_amount - (it.total_cost || 0));
    db.prepare(`UPDATE sale_items SET input_vat = ?, output_vat = ?, vat_exempt_amount = 0, profit = ? WHERE id = ?`).run(itInputVat, itOutputVat, itProfit, it.id);
  }
}

// Walk Inn (Jan 12) – gross 1020
const walkInSale = db.prepare("SELECT id, gross_amount FROM sales WHERE si_number = 'WALK INN' AND date = '2026-01-12' LIMIT 1").get();
if (walkInSale) {
  updateSale(walkInSale.id, walkInSale.gross_amount);
  console.log('Updated WALK INN sale', walkInSale.id);
} else {
  console.log('WALK INN sale not found');
}

// SI 0213 (Jan 30) – gross 1920
const si0213Sale = db.prepare("SELECT id, gross_amount FROM sales WHERE si_number = 'SI 0213' AND date = '2026-01-30' LIMIT 1").get();
if (si0213Sale) {
  updateSale(si0213Sale.id, si0213Sale.gross_amount);
  console.log('Updated SI 0213 sale', si0213Sale.id);
} else {
  console.log('SI 0213 sale not found');
}

// Verify new total
const total = db.prepare('SELECT SUM(input_vat + vat_exempt_amount) AS total FROM sales').get();
console.log('--- VERIFICATION ---');
console.log('New DB total (input_vat + vat_exempt_amount):', total.total);
console.log('Expected (Excel):                              2257402.01');
console.log('Match?', Math.abs(total.total - 2257402.01) < 0.01 ? '✅ YES' : '❌ NO');

db.close();
