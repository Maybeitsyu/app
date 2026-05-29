import fs from 'fs';

const content = fs.readFileSync('src/renderer/App.jsx', 'utf8');
const lines = content.split('\n');

console.log("=== Active Product Card content ===");
let start = false;
let openCount = 0;
lines.forEach((line, idx) => {
    if (line.includes('activeProductId === product.id')) {
        start = true;
    }
    if (start) {
        console.log(`${idx + 1}: ${line}`);
        if (line.includes('{')) openCount++;
        if (line.includes('}')) openCount--;
        if (openCount < 0) {
            start = false;
        }
    }
});
