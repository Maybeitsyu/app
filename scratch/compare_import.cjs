const ExcelJS = require('exceljs');

// Replicate the exact same logic from db.js calculateSaleLine
const VAT_RATE = 0.12;

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function calculateVatFromGross(grossAmount, vatRate = VAT_RATE) {
  const gross = roundMoney(grossAmount);
  if (gross <= 0) return { netOfVat: 0, vatAmount: 0 };
  const netOfVat = roundMoney(gross / (1 + vatRate));
  const vatAmount = roundMoney(gross - netOfVat);
  return { netOfVat, vatAmount };
}

function calculateSaleLine({ qty = 0, unitPrice = 0, unitCost = 0, isVatExempt = false, vatRate = VAT_RATE, grossOverride = null }) {
  const safeQty = roundMoney(qty);
  const safeUnitPrice = roundMoney(unitPrice);
  const grossAmount = grossOverride !== null ? roundMoney(grossOverride) : roundMoney(safeQty * safeUnitPrice);
  const vatSplit = isVatExempt || grossAmount <= 0 ? { netOfVat: grossAmount, vatAmount: 0 } : calculateVatFromGross(grossAmount, vatRate);
  return {
    grossAmount,
    inputVat: isVatExempt ? 0 : vatSplit.netOfVat,
    outputVat: isVatExempt ? 0 : vatSplit.vatAmount,
    vatExemptAmount: isVatExempt ? grossAmount : 0,
  };
}

async function compareImport() {
  const filePath = 'example xl/agriledger back up.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet('SALES MAY 2026');
  if (!sheet) { console.log('Sheet not found'); return; }

  // Find headers
  let headers = [];
  let headerRowNumber = -1;
  for (let i = 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const rowVals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      let v = cell.value;
      if (v && typeof v === 'object') {
        if (v.result !== undefined) v = v.result;
        else if (v.richText !== undefined) v = v.richText.map(rt => rt.text).join('');
      }
      if (v !== null && v !== undefined) {
        const vStr = v.toString().toUpperCase().trim();
        if (vStr) rowVals[colNumber] = vStr;
      }
    });
    const rowStr = rowVals.join(' | ');
    if (rowStr.includes('PRODUCT') && rowStr.includes('DATE')) {
      headers = rowVals;
      headerRowNumber = i;
      break;
    }
  }

  console.log('Header row:', headerRowNumber);
  console.log('Headers:', headers.filter(Boolean).join(' | '));

  const getColIdx = (keys) => {
    for (const k of keys) {
      const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const idx = headers.findIndex(h => h && h.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanK);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const inputVatColIdx = getColIdx(['INPUT VAT', 'INPUTVAT']);
  const vatExemptColIdx = getColIdx(['VAT EXEMPT SALES', 'VATEXEMPT']);
  const grossColIdx = getColIdx(['GROSS AMOUNT', 'GROSSAMOUNT', 'GROSS']);
  const qtyColIdx = getColIdx(['QTY', 'QUANTITY']);
  const priceColIdx = getColIdx(['UNIT PRICE', 'UNITPRICE', 'PRICE']);

  console.log(`\nKey columns: InputVAT=${inputVatColIdx}, VATExempt=${vatExemptColIdx}, Gross=${grossColIdx}, Qty=${qtyColIdx}, Price=${priceColIdx}`);

  let excelTotal = 0;
  let systemTotal = 0;
  let rowCount = 0;
  let discrepancies = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const getVal = (colIdx) => {
      if (colIdx === -1) return null;
      const cell = row.getCell(colIdx);
      if (!cell || cell.value === null || cell.value === undefined) return null;
      let val = cell.value;
      if (val && typeof val === 'object') {
        if (val.result !== undefined) val = val.result;
        else if (val.richText !== undefined) val = val.richText.map(rt => rt.text).join('');
      }
      if (typeof val === 'string') return parseFloat(val.replace(/[₱,\s]/g, '')) || null;
      return typeof val === 'number' ? val : null;
    };

    const productCell = row.getCell(getColIdx(['PRODUCT']));
    let product = productCell?.value;
    if (product && typeof product === 'object') {
      if (product.result !== undefined) product = product.result;
      else if (product.richText !== undefined) product = product.richText.map(rt => rt.text).join('');
    }
    if (!product) return;

    const excelInputVat = getVal(inputVatColIdx) ?? 0;
    const excelVatExempt = getVal(vatExemptColIdx) ?? 0;
    const excelGross = getVal(grossColIdx);
    const qty = getVal(qtyColIdx) ?? 0;
    const price = getVal(priceColIdx) ?? 0;
    const isVatExempt = excelVatExempt > 0;

    // What system stores (exact import logic)
    const vat = calculateSaleLine({ qty, unitPrice: price, isVatExempt, vatRate: VAT_RATE, grossOverride: excelGross });
    
    // Override with Excel columns (replicating import logic exactly)
    let systemInputVat = vat.inputVat;
    let systemVatExempt = vat.vatExemptAmount;
    
    // hasCol(['INPUT VAT']) = true since inputVatColIdx !== -1
    const explicitInputVat = getVal(inputVatColIdx);
    systemInputVat = (explicitInputVat === null || isNaN(explicitInputVat)) ? 0 : explicitInputVat;

    // hasCol(['VAT EXEMPT SALES']) = true since vatExemptColIdx !== -1
    const explicitVatExempt = getVal(vatExemptColIdx);
    systemVatExempt = (explicitVatExempt === null || isNaN(explicitVatExempt)) ? 0 : explicitVatExempt;

    const excelLineTotal = roundMoney(excelInputVat + excelVatExempt);
    const systemLineTotal = roundMoney(systemInputVat + systemVatExempt);
    const diff = roundMoney(systemLineTotal - excelLineTotal);

    excelTotal = roundMoney(excelTotal + excelLineTotal);
    systemTotal = roundMoney(systemTotal + systemLineTotal);
    rowCount++;

    if (Math.abs(diff) > 0.001) {
      discrepancies.push({ rowNumber, product: product?.toString(), qty, price, excelGross, excelInputVat, excelVatExempt, excelLineTotal, systemInputVat, systemVatExempt, systemLineTotal, diff });
    }
  });

  console.log(`\nRows processed: ${rowCount}`);
  console.log(`Excel total (input_vat + vat_exempt): ${excelTotal}`);
  console.log(`System total (after import logic): ${systemTotal}`);
  console.log(`Difference: ${roundMoney(systemTotal - excelTotal)}`);

  if (discrepancies.length > 0) {
    console.log(`\n=== DISCREPANCY ROWS (${discrepancies.length}) ===`);
    discrepancies.forEach(d => console.log(JSON.stringify(d)));
  } else {
    console.log('\nNo discrepancies found in individual rows!');
    console.log('The bug must be somewhere else (e.g., date filtering or duplicate imports).');
  }
}

compareImport().catch(console.error);
