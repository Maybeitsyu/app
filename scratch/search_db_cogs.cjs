const fs = require('fs');

const content = fs.readFileSync('electron/db.js', 'utf8');
const lines = content.split('\n');

console.log('Searching for COGS/Cost of Goods in db.js...');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('cogs') || line.toLowerCase().includes('cost of goods')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
