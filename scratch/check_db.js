import Database from 'better-sqlite3';
const db = new Database('agridb.db');
const count = db.prepare('SELECT count(*) as count FROM sales').get().count;
console.log('Sales count:', count);
db.close();
