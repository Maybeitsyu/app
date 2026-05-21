const fs = require('fs');
const dbSales = JSON.parse(fs.readFileSync('scratch/real_db_sales.json', 'utf8'));

console.log('Index 72:', dbSales[72]);
console.log('Index 170:', dbSales[170]);
