import fs from 'fs';

const content = fs.readFileSync('electron/db.js', 'utf8');
const lines = content.split('\n');

console.log("=== serializeProduct & active_batches in db.js ===");
lines.forEach((line, idx) => {
    if (line.includes('serializeProduct') || line.includes('active_batches')) {
        console.log(`${idx + 1}: ${line.trim()}`);
    }
});
