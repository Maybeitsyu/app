const fs = require('fs');
const path = require('path');

function walkDir(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, files);
    } else if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      files.push(filePath);
    }
  }
  return files;
}

const files = walkDir('src');

files.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('calculateSaleLine') || line.includes('calculatePurchaseLine')) {
      console.log(`${filePath} [Line ${idx + 1}]: ${line.trim()}`);
    }
  });
});
