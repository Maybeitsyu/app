import ExcelJS from 'exceljs';
import path from 'path';

function normalizeExpenseCategory(text) {
  if (!text || typeof text !== 'string') return 'Miscellaneous';
  const normalized = text
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9&]/g, '')
    .replace(/AND/g, ' & ');
  
  const categoryMap = {
    'COMMUNICATION LIGHT WATER': 'Communication/Light/Water',
    'COMMUNICATIONLIGHTWATER': 'Communication/Light/Water',
    'FUEL OIL': 'Fuel & Oil',
    'FUELOIL': 'Fuel & Oil',
    'REPAIRS MAINTENANCE': 'Repairs & Maintenance',
    'REPAIRSMAINTENANCE': 'Repairs & Maintenance',
    'PROFESSIONAL FEES': 'Professional Fees',
    'PROFESSIONALFEES': 'Professional Fees',
    'DELIVERY CHARGE FEES': 'Delivery Charge & Fee\'s',
    'DELIVERYCHARGEFEESCHARGES': 'Delivery Charge & Fee\'s',
    'DELIVERYCHARGE FEES': 'Delivery Charge & Fee\'s',
    'TRANSPORTATION TRAVEL': 'Transportation and Travel',
    'TRANSPORTATIONTRAVELTOLL': 'Transportation and Travel',
    'REPRESENTATION': 'Representation',
    'INSURANCE': 'Insurance',
    'OFFICE SUPPLIES': 'Office Supplies',
    'OFFICESUPPLIES': 'Office Supplies',
    'MATERIALS SUPPLIES': 'Materials & Supplies',
    'MATERIALSSUPPLIES': 'Materials & Supplies',
    'SALARIES': 'Salaries',
    'PERMIT LICENSE': 'Permit & License',
    'PERMITLICENSE': 'Permit & License',
    'FEES CHARGES': 'Fee\'s & Charges',
    'FEESCHARGES': 'Fee\'s & Charges',
    'CUSTOMS BROKARAGE FEES': 'Customs & Brokerage Fee\'s',
    'CUSTOMSBROKARAGE': 'Customs & Brokerage Fee\'s',
    'INSTALLATION SERVICES': 'Installation & Services',
    'INSTALLATIONSERVICES': 'Installation & Services',
    'LOSS DAMAGE GOODS': 'Loss & Damage Goods',
    'LOSSDAMAGE': 'Loss & Damage Goods',
    'MISCELLENIOUS': 'Miscellaneous',
    'MISCELLANEOUS': 'Miscellaneous',
    'OTHERS': 'Miscellaneous'
  };
  
  return categoryMap[normalized] || 'Miscellaneous';
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.join('example xl', 'example.xlsx'));

const sheet = wb.getWorksheet('2ND QRT EXP 2026');
const headers = sheet.getRow(1).values.filter(Boolean);

console.log('=== Analyzing 2ND QRT EXP 2026 ===');
console.log('Headers:', headers);
console.log('\nSystem column exclusion analysis:');

headers.forEach((h, idx) => {
  if (!h || idx === 0) return;
  const cleanH = h.toUpperCase().trim();
  const alphaOnly = cleanH.replace(/[^A-Z0-9]/g, '');
  
  // Check exclusions
  const isSystemCol =
    cleanH.includes('GROSS AMOUNT') || 
    alphaOnly.includes('GROSSAMOUNT') ||
    cleanH.includes('NET OF VAT') ||
    alphaOnly.includes('NETOFVAT') ||
    cleanH.includes('INPUT VAT') ||
    alphaOnly.includes('INPUTVAT') ||
    cleanH.includes('OUTPUT VAT') ||
    alphaOnly.includes('OUTPUTVAT') ||
    cleanH.includes('DATE') ||
    cleanH.includes('SUPPLIER') ||
    cleanH.includes('COMPANY') ||
    alphaOnly.includes('TAXIDENTIFICATIONNUMBER') ||
    alphaOnly.includes('TIN') ||
    cleanH.includes('ADDRESS') ||
    alphaOnly.includes('RECEIPT') ||
    cleanH.includes('REMARKS') ||
    alphaOnly.includes('VOUCHER') ||
    alphaOnly.includes('TRADENAME');
    
  const normalized = normalizeExpenseCategory(h);
  
  console.log(`Col ${idx}: "${h}"`);
  console.log(`  cleanH: "${cleanH}"`);
  console.log(`  alphaOnly: "${alphaOnly}"`);
  console.log(`  isSystemCol: ${isSystemCol}`);
  console.log(`  normalized: "${normalized}"`);
  console.log();
});
