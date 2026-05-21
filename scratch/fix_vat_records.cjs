const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('path');

app.whenReady().then(() => {
  try {
    const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
    const db = new Database(dbPath);

    const VAT_RATE = 0.12;

    function roundMoney(v) { return Math.round(v * 100) / 100; }

    function calcVatFromGross(gross, rate) {
      const netOfVat = roundMoney(gross / (1 + rate));
      const vatAmount = roundMoney(gross - netOfVat);
      return { netOfVat, vatAmount };
    }

    function nowIso() { return new Date().toISOString(); }

    // --- Fix Row 73: WALK INN 2026-01-12 ---
    const walkInnSale = db.prepare(
      "SELECT id, gross_amount FROM sales WHERE si_number='WALK INN' AND date='2026-01-12'"
    ).get();

    if (!walkInnSale) {
      console.error('Could not find WALK INN sale!');
      app.quit(); return;
    }

    const walkInnItems = db.prepare("SELECT * FROM sale_items WHERE sale_id=?").all(walkInnSale.id);
    const walkInnVat = calcVatFromGross(walkInnSale.gross_amount, VAT_RATE);

    // Recalculate profit: gross - outputVat - netCost
    let walkInnProfit = walkInnSale.gross_amount;
    let walkInnItemUpdates = [];
    for (const item of walkInnItems) {
      const itemGrossVat = calcVatFromGross(item.gross_amount, VAT_RATE);
      const costVat = item.total_cost > 0 ? calcVatFromGross(item.total_cost, VAT_RATE) : { netOfVat: 0, vatAmount: 0 };
      const itemProfit = roundMoney(item.gross_amount - itemGrossVat.vatAmount - costVat.netOfVat);
      walkInnItemUpdates.push({ id: item.id, inputVat: itemGrossVat.netOfVat, outputVat: itemGrossVat.vatAmount, vatExempt: 0, profit: itemProfit });
    }
    const walkInnTotalProfit = walkInnItemUpdates.reduce((s, i) => s + i.profit, 0);

    console.log('=== WALK INN CHANGES ===');
    console.log('Sale ID:', walkInnSale.id);
    console.log('gross_amount:', walkInnSale.gross_amount);
    console.log('New input_vat:', walkInnVat.netOfVat);
    console.log('New output_vat:', walkInnVat.vatAmount);
    console.log('New vat_exempt_amount: 0');
    console.log('New profit:', roundMoney(walkInnTotalProfit));

    // --- Fix Row 171: SI 0213 2026-01-30 (A/R) ---
    const si0213Sale = db.prepare(
      "SELECT id, gross_amount FROM sales WHERE si_number='SI 0213' AND date='2026-01-30' AND status='A/R'"
    ).get();

    if (!si0213Sale) {
      console.error('Could not find SI 0213 sale!');
      app.quit(); return;
    }

    const si0213Items = db.prepare("SELECT * FROM sale_items WHERE sale_id=?").all(si0213Sale.id);
    const si0213Vat = calcVatFromGross(si0213Sale.gross_amount, VAT_RATE);

    let si0213ItemUpdates = [];
    for (const item of si0213Items) {
      const itemGrossVat = calcVatFromGross(item.gross_amount, VAT_RATE);
      const costVat = item.total_cost > 0 ? calcVatFromGross(item.total_cost, VAT_RATE) : { netOfVat: 0, vatAmount: 0 };
      const itemProfit = roundMoney(item.gross_amount - itemGrossVat.vatAmount - costVat.netOfVat);
      si0213ItemUpdates.push({ id: item.id, inputVat: itemGrossVat.netOfVat, outputVat: itemGrossVat.vatAmount, vatExempt: 0, profit: itemProfit });
    }
    const si0213TotalProfit = si0213ItemUpdates.reduce((s, i) => s + i.profit, 0);

    console.log('\n=== SI 0213 CHANGES ===');
    console.log('Sale ID:', si0213Sale.id);
    console.log('gross_amount:', si0213Sale.gross_amount);
    console.log('New input_vat:', si0213Vat.netOfVat);
    console.log('New output_vat:', si0213Vat.vatAmount);
    console.log('New vat_exempt_amount: 0');
    console.log('New profit:', roundMoney(si0213TotalProfit));

    // --- Apply updates in a transaction ---
    const updateSale = db.prepare(`
      UPDATE sales SET input_vat=?, output_vat=?, vat_exempt_amount=?, profit=?, updated_at=? WHERE id=?
    `);
    const updateItem = db.prepare(`
      UPDATE sale_items SET input_vat=?, output_vat=?, vat_exempt_amount=?, profit=? WHERE id=?
    `);

    db.transaction(() => {
      // Walk Inn sale
      updateSale.run(walkInnVat.netOfVat, walkInnVat.vatAmount, 0, roundMoney(walkInnTotalProfit), nowIso(), walkInnSale.id);
      for (const u of walkInnItemUpdates) {
        updateItem.run(u.inputVat, u.outputVat, u.vatExempt, u.profit, u.id);
      }

      // SI 0213 sale
      updateSale.run(si0213Vat.netOfVat, si0213Vat.vatAmount, 0, roundMoney(si0213TotalProfit), nowIso(), si0213Sale.id);
      for (const u of si0213ItemUpdates) {
        updateItem.run(u.inputVat, u.outputVat, u.vatExempt, u.profit, u.id);
      }
    })();

    // Verify new total
    const newTotal = db.prepare("SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales").get().total;
    console.log('\n=== VERIFICATION ===');
    console.log('New DB total:', Math.round(newTotal * 100) / 100);
    console.log('Expected:    2257402.01');
    console.log('Match:', Math.round(newTotal * 100) / 100 === 2257402.01 ? '✅ YES' : '❌ NO');

    db.close();
    console.log('\nDone!');
  } catch (e) {
    console.error('ERROR:', e.stack);
  }
  app.quit();
});
