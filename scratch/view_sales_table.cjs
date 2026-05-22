const fs = require('fs');

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

const start = 3430;
const end = 3470;

for (let i = start; i <= end; i++) {
  console.log(`${i}: ${lines[i - 1]}`);
}
