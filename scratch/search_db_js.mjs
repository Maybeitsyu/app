import fs from 'fs';

const content = fs.readFileSync('electron/db.js', 'utf8');
const lines = content.split('\n');

const searchTerms = ['import', 'xlsx', 'excel', 'upload', 'sales'];

lines.forEach((line, index) => {
  const lineNum = index + 1;
  searchTerms.forEach(term => {
    if (line.toLowerCase().includes(term.toLowerCase())) {
      // Print only if it defines a function or looks like a major operation
      if (line.includes('function') || line.includes('const ') || line.includes('let ') || line.includes('ipcMain')) {
        console.log(`Line ${lineNum}: ${line.trim()}`);
      }
    }
  });
});
