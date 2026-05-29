import fs from 'fs';

const content = fs.readFileSync('electron/db.js', 'utf8');
const lines = content.split('\n');

console.log("=== serializeProduct definition ===");
lines.forEach((line, idx) => {
    if (line.includes('function serializeProduct')) {
        for (let i = idx; i < idx + 40; i++) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
    }
});
