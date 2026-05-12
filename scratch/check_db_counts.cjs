const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPaths = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'AgriLedger', 'data', 'agridb.db'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'agri-ledger', 'data', 'agridb.db'),
    'agridb.db'
];

let db;
for (const p of dbPaths) {
    try {
        db = new Database(p, { readonly: true });
        console.log('Opened database at: ' + p);
        break;
    } catch (e) {}
}

if (!db) {
    console.error('Could not find database file.');
    process.exit(1);
}

try {
    const salesCount = db.prepare('SELECT COUNT(*) as count FROM sales').get().count;
    const itemsCount = db.prepare('SELECT COUNT(*) as count FROM sale_items').get().count;
    console.log(`Sales (Transactions): ${salesCount}`);
    console.log(`Sale Items (Rows): ${itemsCount}`);
} catch (err) {
    console.error('Error querying database:', err.message);
}
