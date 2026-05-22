const fs = require('fs');

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

console.log('Searching for COGS/Cost of Goods in App.jsx...');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('cogs') || line.toLowerCase().includes('cost of goods')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
