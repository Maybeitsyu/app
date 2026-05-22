const fs = require('fs');

const content = fs.readFileSync('electron/db.js', 'utf8');
const lines = content.split('\n');

console.log('Searching for VAT-related excel headers/keys in db.js...');
lines.forEach((line, idx) => {
  if (line.includes('header:') && (line.includes('VAT') || line.includes('Vat') || line.includes('vat'))) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
