import { createRepository } from './electron/db.js';
import path from 'path';

(async () => {
  try {
    const repo = createRepository();
    
    // Get all purchases before import
    const beforePurchases = repo.listPurchases({ limit: 10000 });
    console.log('\n=== BEFORE IMPORT ===');
    console.log(`Total purchases: ${beforePurchases.data.length}`);
    
    // Group by category
    const catBefore = {};
    let totalBefore = 0;
    beforePurchases.data.forEach(p => {
      if (!catBefore[p.expense_category]) catBefore[p.expense_category] = [];
      catBefore[p.expense_category].push(p);
      totalBefore += p.gross_amount;
    });
    
    console.log('\nBy category (before):');
    Object.entries(catBefore).forEach(([cat, items]) => {
      const total = items.reduce((sum, p) => sum + p.gross_amount, 0);
      console.log(`  ${cat}: ${items.length} items = ${total.toFixed(2)}`);
    });
    console.log(`Total gross: ${totalBefore.toFixed(2)}`);

    // Import
    const file = path.join('example xl', 'example.xlsx');
    console.log(`\n=== IMPORTING: ${file} ===`);
    const result = await repo.importSalesFromExcel(file, null, false);
    console.log('Import result:', result);

    // Get all purchases after import
    const afterPurchases = repo.listPurchases({ limit: 10000 });
    console.log('\n=== AFTER IMPORT ===');
    console.log(`Total purchases: ${afterPurchases.data.length}`);
    
    // Group by category
    const catAfter = {};
    let totalAfter = 0;
    afterPurchases.data.forEach(p => {
      if (!catAfter[p.expense_category]) catAfter[p.expense_category] = [];
      catAfter[p.expense_category].push(p);
      totalAfter += p.gross_amount;
    });
    
    console.log('\nBy category (after):');
    Object.entries(catAfter).forEach(([cat, items]) => {
      const total = items.reduce((sum, p) => sum + p.gross_amount, 0);
      console.log(`  ${cat}: ${items.length} items = ${total.toFixed(2)}`);
    });
    console.log(`Total gross: ${totalAfter.toFixed(2)}`);

    // Find new records
    const newCats = new Set(Object.keys(catAfter).filter(c => !catBefore[c]));
    const newByCat = {};
    for (const [cat, items] of Object.entries(catAfter)) {
      const oldCount = catBefore[cat]?.length || 0;
      const newCount = items.length - oldCount;
      if (newCount > 0) {
        newByCat[cat] = { newCount, newTotal: items.slice(oldCount).reduce((sum, p) => sum + p.gross_amount, 0) };
      }
    }
    
    console.log('\n=== NEW RECORDS IMPORTED ===');
    Object.entries(newByCat).forEach(([cat, info]) => {
      console.log(`  ${cat}: ${info.newCount} items = ${info.newTotal.toFixed(2)}`);
    });
    
    console.log('\n=== SUMMARY ===');
    console.log(`Purchase records added: ${afterPurchases.data.length - beforePurchases.data.length}`);
    console.log(`Gross amount added: ${(totalAfter - totalBefore).toFixed(2)}`);
    
  } catch (err) {
    console.error('Error:', err);
  }
})();
