const fs = require('fs');

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

console.log('Searching for calculateSaleLine/calculatePurchaseLine in App.jsx...');
let saleStart = -1;
let purchaseStart = -1;

lines.forEach((line, idx) => {
  if (line.includes('function calculateSaleLine')) {
    saleStart = idx + 1;
  }
  if (line.includes('function calculatePurchaseLine')) {
    purchaseStart = idx + 1;
  }
});

console.log(`calculateSaleLine found at line: ${saleStart}`);
console.log(`calculatePurchaseLine found at line: ${purchaseStart}`);

if (saleStart !== -1) {
  console.log('\n--- calculateSaleLine context: ---');
  for (let i = saleStart; i < saleStart + 40; i++) {
    console.log(`${i}: ${lines[i - 1]}`);
  }
}

if (purchaseStart !== -1) {
  console.log('\n--- calculatePurchaseLine context: ---');
  for (let i = purchaseStart; i < purchaseStart + 40; i++) {
    console.log(`${i}: ${lines[i - 1]}`);
  }
}
