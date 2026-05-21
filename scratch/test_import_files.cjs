const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Set a clean test directory
const testUserData = path.resolve(__dirname, 'test_user_data_compare');
app.setPath('userData', testUserData);
app.setName('AgriLedgerTestCompare');

app.whenReady().then(async () => {
  try {
    const dbModulePath = path.resolve(__dirname, '..', 'electron', 'db.js');
    const { createRepository } = require(dbModulePath);

    const testFile = async (fileName) => {
      const fullPath = path.resolve(__dirname, '..', 'example xl', fileName);
      console.log(`\n=======================`);
      console.log(`Testing import of file: ${fileName}`);
      console.log(`=======================`);
      
      const dbFile = path.join(testUserData, 'data', `agridb_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}.db`);
      if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
      
      // Override repository db opening path
      // Wait, repository opens getWritableDatabasePath() which is always the same database.
      // So we must delete the DB before each import.
      const currentDbFile = path.join(testUserData, 'data', 'agridb.db');
      if (fs.existsSync(currentDbFile)) fs.unlinkSync(currentDbFile);

      const repo = createRepository();
      await repo.importSalesFromExcel(fullPath, ['SALES MAY 2026']);
      
      const db = new Database(repo.dbPath, { readonly: true });
      const count = db.prepare('SELECT COUNT(*) as count FROM sales').get().count;
      const sum = db.prepare('SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales').get().total;
      
      console.log(`Rows imported: ${count}`);
      console.log(`Sales total: ${sum}`);

      // Check specific row SI Walk Inn
      const walkInn = db.prepare("SELECT date, gross_amount, input_vat, vat_exempt_amount FROM sales WHERE si_number = 'WALK INN' AND date = '2026-01-12'").get();
      console.log('Walk Inn sale (2026-01-12):', walkInn);

      // Check specific row SI 0213
      const si0213 = db.prepare("SELECT date, gross_amount, input_vat, vat_exempt_amount FROM sales WHERE si_number = 'SI 0213' AND date = '2026-01-30'").get();
      console.log('SI 0213 sale (2026-01-30):', si0213);

      repo.close();
    };

    await testFile('agriledger back up.xlsx');
    await testFile('agriledger back up FIXED.xlsx');

  } catch (e) {
    console.error('ERROR:', e.stack);
  }
  app.quit();
});
