import fs from 'fs';

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

console.log("=== Product rendering sections ===");
lines.forEach((line, idx) => {
    if (line.includes('paginatedProducts.map')) {
        for (let i = idx - 2; i < idx + 100; i++) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
    }
});
