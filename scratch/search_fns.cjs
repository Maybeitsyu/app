const fs = require('fs');

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

console.log('Searching for summarizeSalePreview/summarizePurchasePreview in App.jsx...');
let saleStart = -1;
let purchaseStart = -1;

lines.forEach((line, idx) => {
  if (line.includes('function summarizeSalePreview')) {
    saleStart = idx + 1;
  }
  if (line.includes('function summarizePurchasePreview')) {
    purchaseStart = idx + 1;
  }
});

console.log(`summarizeSalePreview found at line: ${saleStart}`);
console.log(`summarizePurchasePreview found at line: ${purchaseStart}`);

if (saleStart !== -1) {
  console.log('\n--- summarizeSalePreview context: ---');
  for (let i = saleStart; i < saleStart + 50; i++) {
    console.log(`${i}: ${lines[i - 1]}`);
  }
}

if (purchaseStart !== -1) {
  console.log('\n--- summarizePurchasePreview context: ---');
  for (let i = purchaseStart; i < purchaseStart + 50; i++) {
    console.log(`${i}: ${lines[i - 1]}`);
  }
}
