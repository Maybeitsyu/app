const xlsx = require('xlsx');

function readSales(filename) {
    const workbook = xlsx.readFile(filename);
    const sheet = workbook.Sheets['Sales'] || workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet);
}

try {
    const original = readSales('c:\\projct ni client\\agriledger back up.xlsx');
    const fixed = readSales('c:\\projct ni client\\agriledger back up FIXED.xlsx');
    
    let diffCount = 0;
    
    for (let i = 0; i < Math.max(original.length, fixed.length); i++) {
        const origRow = original[i] || {};
        const fixedRow = fixed[i] || {};
        
        let rowDiffs = [];
        const allKeys = new Set([...Object.keys(origRow), ...Object.keys(fixedRow)]);
        
        for (const key of allKeys) {
            // Compare as strings/numbers loosely
            let val1 = origRow[key];
            let val2 = fixedRow[key];
            
            // Round floating points slightly for comparison to avoid precision noise
            if (typeof val1 === 'number') val1 = Math.round(val1 * 100) / 100;
            if (typeof val2 === 'number') val2 = Math.round(val2 * 100) / 100;
            
            if (val1 !== val2) {
                rowDiffs.push(`${key}: ${origRow[key]} -> ${fixedRow[key]}`);
            }
        }
        
        if (rowDiffs.length > 0) {
            console.log(`Row ${i + 2}: ${rowDiffs.join(', ')}`);
            diffCount++;
        }
    }
    
    console.log(`\nTotal differences found in Sales sheet: ${diffCount} rows.`);
} catch (e) {
    console.error("Error comparing files:", e.message);
}
