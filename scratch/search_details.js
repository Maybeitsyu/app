import fs from 'fs';
import path from 'path';

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

console.log("=== Active Batches references ===");
lines.forEach((line, idx) => {
    if (line.toLowerCase().includes('batch') || line.toLowerCase().includes('detail')) {
        if (idx > 2000 && idx < 5000) { // arbitrary range for catalog/product listing
            console.log(`${idx + 1}: ${line.trim()}`);
        }
    }
});
