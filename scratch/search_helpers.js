import fs from 'fs';

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

console.log("=== productHasOldStock and other helper definitions ===");
lines.forEach((line, idx) => {
    if (line.includes('productHasOldStock') || line.includes('function ') && (line.includes('Stock') || line.includes('Batch') || line.includes('Price') || line.includes('Cost'))) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
