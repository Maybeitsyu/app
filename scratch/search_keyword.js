import fs from 'fs';
import path from 'path';

const files = [
    'src/renderer/App.jsx',
    'electron/db.js',
    'electron/main.js',
    'electron/schema.js',
    'src/shared/finance.js'
];

const keyword = 'split';

files.forEach(file => {
    const fullPath = path.resolve(file);
    if (!fs.existsSync(fullPath)) {
        console.log(`File not found: ${file}`);
        return;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    console.log(`=== Matches in ${file} ===`);
    lines.forEach((line, idx) => {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
            console.log(`${idx + 1}: ${line.trim()}`);
        }
    });
});
