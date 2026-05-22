import ExcelJS from 'exceljs';
import path from 'path';

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.join('example xl','example.xlsx'));
const normalizeExpenseCategory = (value) => {
  const val = String(value||'').trim();
  if (!val) return 'Miscellaneous';
  const lowerVal = val.toLowerCase();
  if (lowerVal.includes('light') || lowerVal.includes('water') || lowerVal.includes('electricity') || lowerVal.includes('power') || lowerVal.includes('communication')) return 'Communication, Light and Water';
  if (lowerVal.includes('fuel') || lowerVal.includes('oil')) return 'Fuel & Oil';
  if (lowerVal.includes('repair') || lowerVal.includes('maintenance')) return 'Repairs & Maintenance';
  if (lowerVal.includes('professional') || lowerVal.includes('consult')) return 'Professional Fees';
  if (lowerVal.includes('delivery') || lowerVal.includes('shipping') || lowerVal.includes('courier') || lowerVal.includes('freight')) return "Delivery Charge & Fee's";
  if (lowerVal.includes('travel') || lowerVal.includes('transportation') || lowerVal.includes('transport') || lowerVal.includes('toll')) return 'Transportation and Travel';
  if (lowerVal.includes('representation')) return 'Representation';
  if (lowerVal.includes('insurance')) return 'Insurance';
  if (lowerVal.includes('office') || lowerVal.includes('stationery') || (lowerVal.includes('supplies') && lowerVal.includes('office'))) return 'Office Supplies';
  if (lowerVal.includes('materials') || (lowerVal.includes('supplies') && (lowerVal.includes('materials') || lowerVal.includes('supply')))) return 'Materials & Supplies';
  if (lowerVal.includes('salary') || lowerVal.includes('wage') || lowerVal.includes('payroll') || lowerVal.includes('salaries')) return 'Salaries';
  if (lowerVal.includes('permit') || lowerVal.includes('license') || lowerVal.includes('permits') || lowerVal.includes('licenses') || lowerVal.includes('liscens') || lowerVal.includes('lisence')) return 'Permit & License';
  if (lowerVal.includes('customs') || lowerVal.includes('brokerage')) return "Customs & Brokerage Fee's";
  if (lowerVal.includes('labor') || lowerVal.includes('labour') || lowerVal.includes('service') || lowerVal.includes('services')) return 'Installation & Services';
  if (lowerVal.includes('loss') || lowerVal.includes('damage') || lowerVal.includes('damaged')) return 'Loss & Damage Goods';
  if (lowerVal.includes('fee') && lowerVal.includes('charge')) return "Fee's & Charges";
  return 'Miscellaneous';
};

const sheets = ['1ST QTR EXP 2026', '2ND QRT EXP 2026'];
for (const sheetName of sheets) {
  const sheet = wb.getWorksheet(sheetName);
  if (!sheet) {
    console.log('Missing', sheetName);
    continue;
  }

  console.log(`\n=== Sheet ${sheetName} ===`);
  let headerRowNumber = -1;
  let headers = [];
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
    const rowKeys = rowVals.map(h => h ? h.toUpperCase().replace(/[^A-Z0-9]/g, '') : '').filter(Boolean);
    const hasKey = (key) => rowKeys.includes(key.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if ((hasKey('SUPPLIER') && (hasKey('CATEGORY') || hasKey('GROSSAMOUNT'))) ||
        ((hasKey('NAME/TRADE NAME') || hasKey('NAME/TRADENAME') || hasKey('TAX IDENTIFICATION NUMBER') || hasKey('TAXIDENTIFICATIONNUMBER') || hasKey('VOUCHER#') || hasKey('VOUCHER') || hasKey('COMPANY') || hasKey('TIN')) && hasKey('GROSSAMOUNT'))) {
      headers = rowVals;
      headerRowNumber = i;
      break;
    }
  }

  console.log('Header row', headerRowNumber);
  console.log('Headers', headers);

  const printIndex = (i) => i.toString().padStart(3, ' ');
  const parseRow = (row) => {
    const getValByKeys = (keys) => {
      for (const k of keys) {
        const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const colIdx = headers.findIndex(h => h && h.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanK);
        if (colIdx !== -1) {
          const cell = row.getCell(colIdx);
          let val = cell?.value;
          if (val && typeof val === 'object') {
            if (val.result !== undefined) val = val.result;
            else if (val.richText !== undefined) val = val.richText.map(rt => rt.text).join('');
          }
          if (val === null || val === undefined) continue;
          if (typeof val === 'string') return val.replace(/[₱,]/g, '').trim();
          return val.toString();
        }
      }
      return '';
    };
    const dateVal = getValByKeys(['DATE']);
    if (!dateVal || dateVal === 'DATE') return null;
    const categoryVal = getValByKeys(['CATEGORY']);
    const categoryColIndices = [];
    headers.forEach((h, idx) => {
      if (!h || idx === 0) return;
      const cleanH = h.toUpperCase().trim();
      const alphaOnly = cleanH.replace(/[^A-Z0-9]/g, '');
      if (cleanH.includes('GROSS AMOUNT') || alphaOnly.includes('GROSSAMOUNT') ||
          cleanH.includes('NET OF VAT') || alphaOnly.includes('NETOFVAT') ||
          cleanH.includes('INPUT VAT') || alphaOnly.includes('INPUTVAT') ||
          cleanH.includes('OUTPUT VAT') || alphaOnly.includes('OUTPUTVAT') ||
          cleanH.includes('DATE') || cleanH.includes('SUPPLIER') || cleanH.includes('COMPANY') ||
          alphaOnly.includes('TAXIDENTIFICATIONNUMBER') || alphaOnly.includes('TIN') ||
          cleanH.includes('ADDRESS') || alphaOnly.includes('RECEIPT') || cleanH.includes('REMARKS') ||
          alphaOnly.includes('VOUCHER') || alphaOnly.includes('TRADENAME')) {
        return;
      }
      const normalized = normalizeExpenseCategory(h);
      if (normalized !== 'Miscellaneous' || cleanH === 'OTHERS' || cleanH === 'MISCELLENIOUS' || cleanH === 'MISCELLANEOUS') {
        categoryColIndices.push({ index: idx, categoryName: normalized === 'Miscellaneous' ? 'Miscellaneous' : normalized });
      }
    });
    const entries = [];
    if (categoryColIndices.length > 0 && !categoryVal) {
      let parsedAny = false;
      for (const catCol of categoryColIndices) {
        const cellVal = row.getCell(catCol.index).value;
        let val = 0;
        if (cellVal && typeof cellVal === 'object') {
          if (cellVal.result !== undefined) val = parseFloat(cellVal.result) || 0;
        } else if (cellVal !== null && cellVal !== undefined) {
          val = parseFloat(cellVal.toString().replace(/[₱,]/g, '')) || 0;
        }
        if (val > 0) {
          parsedAny = true;
          entries.push({ category: catCol.categoryName, value: val, col: headers[catCol.index] || `col${catCol.index}` });
        }
      }
      if (!parsedAny) {
        const grossAmount = parseFloat(getValByKeys(['GROSS AMOUNT', 'GROSSAMOUNT'])) || 0;
        if (grossAmount > 0) entries.push({ category: 'Miscellaneous', value: grossAmount, col: 'GROSSAMOUNT' });
      }
    } else {
      const grossAmount = parseFloat(getValByKeys(['GROSS AMOUNT', 'GROSSAMOUNT'])) || 0;
      const category = normalizeExpenseCategory(categoryVal || 'Miscellaneous');
      if (grossAmount > 0) entries.push({ category, value: grossAmount, col: categoryVal ? 'CATEGORY' : 'GROSSAMOUNT' });
    }
    return {categoryVal, categoryColIndices, entries};
  };

  for (let rowNumber = headerRowNumber + 1; rowNumber <= Math.min(sheet.rowCount, headerRowNumber + 10); rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const parsed = parseRow(row);
    if (!parsed) continue;
    console.log('Row', rowNumber, 'categoryVal=', parsed.categoryVal, 'entries=', parsed.entries.map(e => `${e.category}:${e.value}(${e.col})`).join(', '));
  }
}
