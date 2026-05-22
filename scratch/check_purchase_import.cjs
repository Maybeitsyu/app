const fs = require('fs');

const content = fs.readFileSync('electron/db.js', 'utf8');
const lines = content.split('\n');

const start = 3680;
const end = 3740;

for (let i = start; i <= end; i++) {
  console.log(`${i}: ${lines[i - 1]}`);
}
