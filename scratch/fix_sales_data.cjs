const db = require('better-sqlite3')('agridb.db');

const fixSales = db.transaction(() => {
  // Fix sales table
  const updateSalesTaxable = db.prepare(`
    UPDATE sales
    SET input_vat = gross_amount - output_vat, vat_exempt_amount = 0
    WHERE input_vat = 0 AND vat_exempt_amount = 0 AND gross_amount > 0 AND output_vat > 0
  `);
  const updateSalesExempt = db.prepare(`
    UPDATE sales
    SET input_vat = 0, vat_exempt_amount = gross_amount
    WHERE input_vat = 0 AND vat_exempt_amount = 0 AND gross_amount > 0 AND output_vat = 0
  `);
  
  // Fix sale_items table
  const updateSaleItemsTaxable = db.prepare(`
    UPDATE sale_items
    SET input_vat = gross_amount - output_vat, vat_exempt_amount = 0
    WHERE input_vat = 0 AND vat_exempt_amount = 0 AND gross_amount > 0 AND output_vat > 0
  `);
  const updateSaleItemsExempt = db.prepare(`
    UPDATE sale_items
    SET input_vat = 0, vat_exempt_amount = gross_amount
    WHERE input_vat = 0 AND vat_exempt_amount = 0 AND gross_amount > 0 AND output_vat = 0
  `);

  const r1 = updateSalesTaxable.run();
  const r2 = updateSalesExempt.run();
  const r3 = updateSaleItemsTaxable.run();
  const r4 = updateSaleItemsExempt.run();

  return { 
    salesTaxable: r1.changes, 
    salesExempt: r2.changes, 
    itemsTaxable: r3.changes, 
    itemsExempt: r4.changes 
  };
});

const results = fixSales();
console.log('Successfully fixed database records!', results);
