const fs = require('fs');

const dbSales = JSON.parse(fs.readFileSync('scratch/real_db_sales.json', 'utf8'));

// Filter sales with company_name = 'Batangas Dairy Farmtech Inc.'
const bdfSales = dbSales.filter(s => s.company_name === 'Batangas Dairy Farmtech Inc.');
console.log(`Number of sales with company 'Batangas Dairy Farmtech Inc.': ${bdfSales.length}`);

// Print details of first 10
console.log('\nFirst 10 Batangas Dairy Farmtech Inc. sales in DB:');
console.log(JSON.stringify(bdfSales.slice(0, 10), null, 2));

// How many sales have company_name null or empty?
const emptyCompanySales = dbSales.filter(s => !s.company_name);
console.log(`\nNumber of sales with empty company_name: ${emptyCompanySales.length}`);

// Check unique company names in DB
const companies = new Set(dbSales.map(s => s.company_name));
console.log('\nUnique companies in DB:', Array.from(companies));

// Check unique dates in DB
const dates = new Set(dbSales.map(s => s.date));
console.log('\nUnique dates in DB:', Array.from(dates).sort());

// Check if any sale is created_at different from others
const createdAtTimes = new Set(dbSales.map(s => s.created_at));
console.log('\nUnique created_at times in DB:', Array.from(createdAtTimes));
