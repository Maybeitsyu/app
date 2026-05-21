const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const testUserData = path.resolve(__dirname, 'test_user_data_compare2');
app.setPath('userData', testUserData);
app.setName('AgriLedgerTestCompare2');

app.whenReady().then(async () => {
  try {
    const dbModulePath = path.resolve(__dirname, '..', 'electron', 'db.js');
    const { createRepository } = require(dbModulePath);

    const testFile = async (fileName) => {
      const fullPath = path.resolve(__dirname, '..', 'example xl', fileName);
      console.log(`\n=======================`);
      console.log(`Testing import of file: ${fileName}`);
      console.log(`=======================`);
      
      const currentDbFile = path.join(testUserData, 'data', 'agridb.db');
      if (fs.existsSync(currentDbFile)) {
        try {
          fs.unlinkSync(currentDbFile);
        } catch (e) {
          console.log('Failed to unlink, waiting and retrying...');
          await new Promise(resolve => setTimeout(resolve, 500));
          fs.unlinkSync(currentDbFile);
        }
      }

      const repo = createRepository();
      await repo.importSalesFromExcel(fullPath, ['SALES MAY 2026']);
      
      const db = new Database(repo.dbPath, { readonly: true });
      const count = db.prepare('SELECT COUNT(*) as count FROM sales').get().count;
      const sum = db.prepare('SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales').get().total;
      
      console.log(`Rows imported: ${count}`);
      console.log(`Sales total: ${sum}`);

      // List all Walk Inn sales on 2026-01-12
      const walkInns = db.prepare("SELECT date, gross_amount, input_vat, vat_exempt_amount, status FROM sales WHERE si_number = 'WALK INN' AND date = '2026-01-12'").all();
      console.log('Walk Inn sales on 2026-01-12:', walkInns);

      // List all SI 0213 sales on 2026-01-30
      const si0213s = db.prepare("SELECT date, gross_amount, input_vat, vat_exempt_amount, status FROM sales WHERE si_number = 'SI 0213'").all();
      console.log('SI 0213 sales:', si0213s);

      db.close();
      repo.close();
    };

    await testFile('agriledger back up.xlsx');
    await testFile('agriledger back up FIXED.xlsx');

  } catch (e) {
    console.error('ERROR:', e.stack);
  }
  app.quit();
});
