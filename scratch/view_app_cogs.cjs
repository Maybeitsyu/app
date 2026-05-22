const fs = require('fs');

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

const start = 4910;
const end = 4930;

for (let i = start; i <= end; i++) {
  console.log(`${i}: ${lines[i - 1]}`);
}
