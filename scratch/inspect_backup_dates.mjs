import ExcelJS from 'exceljs';

const files = [
  'example xl/agriledger back up.xlsx',
  'example xl/agriledger back up FIXED.xlsx'
];

async function run() {
  for (const file of files) {
    console.log(`\n========================================`);
    console.log(`File: ${file}`);
    console.log(`========================================`);
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);
    
    for (const sheet of workbook.worksheets) {
      // Find header row
      let headers = [];
      let headerRowNumber = -1;
      for (let i = 1; i <= Math.min(sheet.rowCount, 20); i++) {
        const row = sheet.getRow(i);
        const rowVals = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          let v = cell.value;
          if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
          if (v !== null && v !== undefined) rowVals[colNumber] = v.toString().toUpperCase().trim();
        });
        const rowStr = rowVals.join(' | ');
        if (rowStr.includes('PRODUCT') && rowStr.includes('DATE')) {
          headers = rowVals;
          headerRowNumber = i;
          break;
        }
      }
      
      if (headerRowNumber === -1) {
        console.log(`Sheet: "${sheet.name}" — no SALES header found, skipping`);
        continue;
      }
      
      const cleanHeaders = headers.map(h => h ? h.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');
      const dateIdx = cleanHeaders.findIndex(h => h === 'DATE');
      const totalCostIdx = cleanHeaders.findIndex(h => h === 'TOTALCOSTING' || h === 'TOTALCOST' || h === 'COST');
      const productIdx = cleanHeaders.findIndex(h => h === 'PRODUCT');
      const qtyIdx = cleanHeaders.findIndex(h => h === 'QTY' || h === 'QUANTITY');
      const costingIdx = cleanHeaders.findIndex(h => h === 'COSTING');
      const siIdx = cleanHeaders.findIndex(h => h === 'SINO' || h === 'SI');
      const customerIdx = cleanHeaders.findIndex(h => h === 'NAMETRADENAME' || h === 'CUSTOMER');
      const tinIdx = cleanHeaders.findIndex(h => h === 'TAXIDENTIFICATIONNUMBER' || h === 'TIN');
      const remarksIdx = cleanHeaders.findIndex(h => h === 'REMARKS' || h === 'STATUS');

      console.log(`\nSheet: "${sheet.name}" (Header row: ${headerRowNumber})`);
      console.log(`Header mapping: DATE=${dateIdx}, PRODUCT=${productIdx}, QTY=${qtyIdx}, COSTING=${costingIdx}, TOTALCOST=${totalCostIdx}, SI=${siIdx}`);
      console.log(`\nFirst 10 data rows (raw date values):`);
      
      let rowCount = 0;
      let cancelledCount = 0;
      let totalCostSum = 0;
      const sampleRows = [];
      
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNumber) return;
        
        const dateCell = dateIdx !== -1 ? row.getCell(dateIdx) : null;
        if (!dateCell) return;
        
        const productCell = productIdx !== -1 ? row.getCell(productIdx) : null;
        let productVal = '';
        if (productCell && productCell.value !== null) {
          let pv = productCell.value;
          if (pv && typeof pv === 'object' && pv.result !== undefined) pv = pv.result;
          productVal = pv ? pv.toString().trim() : '';
        }
        
        if (!productVal) return;
        
        // Get raw date info
        const rawDateVal = dateCell.value;
        const cellType = dateCell.type;
        
        // Get TIN/remarks for cancelled check
        const tinCell = tinIdx !== -1 ? row.getCell(tinIdx) : null;
        const siCell = siIdx !== -1 ? row.getCell(siIdx) : null;
        const remarksCell = remarksIdx !== -1 ? row.getCell(remarksIdx) : null;
        const customerCell = customerIdx !== -1 ? row.getCell(customerIdx) : null;
        
        const getString = (cell) => {
          if (!cell || cell.value === null) return '';
          let v = cell.value;
          if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
          return v ? v.toString().trim() : '';
        };
        
        const tinVal = getString(tinCell);
        const siVal = getString(siCell);
        const customerVal = getString(customerCell);
        const remarksVal = getString(remarksCell);
        
        const isCancelled = [tinVal, siVal, customerVal, remarksVal].some(v => 
          v.toUpperCase().includes('CANCEL') || v.toUpperCase().includes('VOID')
        );
        
        if (isCancelled) {
          cancelledCount++;
        }
        
        // Get total cost
        const totalCostCell = totalCostIdx !== -1 ? row.getCell(totalCostIdx) : null;
        let totalCostVal = 0;
        if (totalCostCell && totalCostCell.value !== null) {
          let tcv = totalCostCell.value;
          if (tcv && typeof tcv === 'object' && tcv.result !== undefined) tcv = tcv.result;
          if (typeof tcv === 'string') tcv = parseFloat(tcv.replace(/[₱,\s]/g, '')) || 0;
          totalCostVal = typeof tcv === 'number' ? tcv : parseFloat(tcv) || 0;
        }
        
        rowCount++;
        if (!isCancelled) totalCostSum += totalCostVal;
        
        if (rowCount <= 10) {
          let dateStr = '';
          if (rawDateVal instanceof Date) {
            dateStr = rawDateVal.toISOString().slice(0, 10) + ` (Date object)`;
          } else if (rawDateVal && typeof rawDateVal === 'object') {
            if (rawDateVal.result instanceof Date) {
              dateStr = rawDateVal.result.toISOString().slice(0, 10) + ` (formula result)`;
            } else {
              dateStr = JSON.stringify(rawDateVal) + ` (object)`;
            }
          } else {
            dateStr = String(rawDateVal) + ` (${typeof rawDateVal})`;
          }
          sampleRows.push(`  Row ${rowNumber}: Product="${productVal}", Date="${dateStr}", TotalCost=${totalCostVal}, Cancelled=${isCancelled}`);
        }
      });
      
      sampleRows.forEach(r => console.log(r));
      console.log(`\nTotal rows with product: ${rowCount}`);
      console.log(`Cancelled rows: ${cancelledCount}`);
      console.log(`Active rows: ${rowCount - cancelledCount}`);
      console.log(`Total Cost (active): ₱${totalCostSum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
    }
  }
}

run().catch(console.error);
