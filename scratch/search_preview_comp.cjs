const fs = require('fs');

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

console.log('Searching for how "preview" is populated in App.jsx...');
lines.forEach((line, idx) => {
  if (line.includes('preview') && (line.includes('const') || line.includes('let') || line.includes('inputVat') || line.includes('netOfVat'))) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
