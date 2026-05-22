const fs = require('fs');

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

console.log('Searching for VAT-related lines in src/renderer/App.jsx...');
let count = 0;
lines.forEach((line, idx) => {
  if (line.includes('inputVat') || line.includes('netOfVat') || line.toLowerCase().includes('net of vat') || line.toLowerCase().includes('input vat')) {
    count++;
    if (count <= 100) { // Limit output
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  }
});
console.log(`Total VAT-related lines: ${count}`);
