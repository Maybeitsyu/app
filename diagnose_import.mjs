import { createRepository } from './electron/db.js';
import path from 'node:path';

(async () => {
  try {
    const repo = createRepository();
    
    // Get all purchases before import
    const beforePurchases = repo.listPurchases({ limit: 10000 });
    console.log('\n=== BEFORE IMPORT ===');
    console.log(`Total purchases: ${beforePurchases.data.length}`);
    
    // Group by category
    const catBefore = {};
    beforePurchases.data.forEach(p => {
      if (!catBefore[p.expense_category]) catBefore[p.expense_category] = [];
      catBefore[p.expense_category].push(p);
    });
    
    console.log('\nBy category:');
    Object.entries(catBefore).forEach(([cat, items]) => {
      const total = items.reduce((sum, p) => sum + p.gross_amount, 0);
      console.log(`  ${cat}: ${items.length} items = ${total.toFixed(2)}`);
    });

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
    afterPurchases.data.forEach(p => {
      if (!catAfter[p.expense_category]) catAfter[p.expense_category] = [];
      catAfter[p.expense_category].push(p);
    });
    
    console.log('\nBy category:');
    Object.entries(catAfter).forEach(([cat, items]) => {
      const total = items.reduce((sum, p) => sum + p.gross_amount, 0);
      console.log(`  ${cat}: ${items.length} items = ${total.toFixed(2)}`);
    });

    // Find new records
    const newPurchaseIds = new Set(afterPurchases.data.map(p => p.id));
    const oldPurchaseIds = new Set(beforePurchases.data.map(p => p.id));
    const addedCount = afterPurchases.data.filter(p => !oldPurchaseIds.has(p.id)).length;
    
    console.log(`\n=== CHANGES ===`);
    console.log(`New purchases added: ${addedCount}`);
    
    // Show the newly added purchases
    const newPurchases = afterPurchases.data.filter(p => !oldPurchaseIds.has(p.id));
    console.log('\nNewly added purchases:');
    newPurchases.slice(0, 20).forEach(p => {
      console.log(`  [${p.date}] ${p.supplier_name} - ${p.expense_category}: ${p.gross_amount.toFixed(2)}`);
    });
    
    if (newPurchases.length > 20) {
      console.log(`  ... and ${newPurchases.length - 20} more`);
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
