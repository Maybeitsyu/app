import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

const minMax = db.prepare("SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as count FROM sales").get();
console.log('Date range in sales table:', minMax);

const sampleDates = db.prepare("SELECT date, COUNT(*) as c FROM sales GROUP BY date ORDER BY date DESC LIMIT 10").all();
console.log('Top 10 dates:', sampleDates);

const companies = db.prepare("SELECT company_name, COUNT(*) as c FROM sales GROUP BY company_name").all();
console.log('Companies:', companies);

db.close();
