import fs from 'fs';

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

console.log("=== productToForm definition ===");
lines.forEach((line, idx) => {
    if (line.includes('productToForm')) {
        for (let i = idx; i < idx + 25; i++) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
    }
});
