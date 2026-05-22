const fs = require('fs');

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

console.log('Searching for "total cost" in App.jsx...');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('total cost')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
