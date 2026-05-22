const fs = require('fs');

const content = fs.readFileSync('electron/db.js', 'utf8');
const lines = content.split('\n');

console.log('Searching for VAT-related lines in electron/db.js...');
lines.forEach((line, idx) => {
  if (line.includes('net_of_vat') || line.includes('netOfVat') || line.includes('inputVat') || line.includes('input_vat') || line.toLowerCase().includes('net of vat')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
