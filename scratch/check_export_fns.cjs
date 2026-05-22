const fs = require('fs');

const content = fs.readFileSync('electron/db.js', 'utf8');
const lines = content.split('\n');

const points = [2660, 2690, 2905, 3045];

points.forEach(pt => {
  console.log(`\n--- Context around line ${pt} ---`);
  for (let i = pt - 15; i <= pt + 15; i++) {
    if (lines[i - 1] !== undefined) {
      console.log(`${i}: ${lines[i - 1]}`);
    }
  }
});
