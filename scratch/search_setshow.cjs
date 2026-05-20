const fs = require('fs');
const content = fs.readFileSync('c:\\projct ni client\\app\\src\\renderer\\App.jsx', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, index) => {
    if (line.includes('setShowProductForm') || line.includes('setShowCustomerForm') || line.includes('setShowSupplierForm')) {
        console.log(`${index + 1}: ${line}`);
    }
});
