export const VAT_RATE = 0.12;
export const INCOME_TAX_RATE = 0.2;

export const defaultTaxSettings = {
  vatRate: VAT_RATE,
  incomeTaxRate: INCOME_TAX_RATE
};

export const salesChannels = [
  'Shopee',
  'Walk-In',
  'Lalamove',
  'Victory',
  'Matatag Cargo',
  '2GO',
  'SI-based'
];

export const saleStatuses = ['PAID', 'A/R', 'Pending', 'FAILED', 'Return', 'Lost'];

export const productCategories = [
  'Milking Equipment',
  'Spare Parts',
  'Medicines/Vet Products',
  'Feed Supplements',
  'Accessories'
];

export const expenseCategories = [
  'Communication, Light and Water',
  'Fuel & Oil',
  'Repairs & Maintenance',
  'Miscellaneous',
  'Professional Fees',
  'Delivery Charge & Fee\'s',
  'Transportation and Travel',
  'Representation',
  'Insurance',
  'Office Supplies',
  'Materials & Supplies',
  'Salaries',
  'Permit & License',
  'Fee\'s & Charges',
  'Customs & Brokerage Fee\'s',
  'Installation & Services',
  'Loss & Damage Goods'
];

export const companyNames = [
  'Batangas Dairy Farmtech Inc.',
  'Dairy Solutions OPC'
];

export function toNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundMoney(value) {
  return Number(toNumber(value).toFixed(2));
}

export function calculateAverageCost(cost, laborCost, packagingCost = 0) {
  return roundMoney(toNumber(cost) + toNumber(laborCost) + toNumber(packagingCost));
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2
  }).format(toNumber(value));
}

export function formatQuantity(value) {
  return new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 2
  }).format(toNumber(value));
}

export function toDateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

export function formatDateShort(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function normalizeRate(value, fallback = VAT_RATE) {
  const rate = toNumber(value, fallback);
  return rate >= 0 ? rate : fallback;
}

export function calculateVatFromGross(grossAmount, vatRate = VAT_RATE) {
  const gross = roundMoney(grossAmount);
  const rate = normalizeRate(vatRate);

  if (gross <= 0) {
    return {
      netOfVat: 0,
      vatAmount: 0
    };
  }

  const netOfVat = roundMoney(gross / (1 + rate));
  const vatAmount = roundMoney(gross - netOfVat);

  return {
    netOfVat,
    vatAmount
  };
}

export function calculateSaleLine({
  qty = 0,
  unitPrice = 0,
  unitCost = 0,
  isVatExempt = false,
  status = 'PAID',
  vatRate = VAT_RATE,
  grossOverride = null
}) {
  const safeQty = status === 'FAILED' || status === 'Return' ? 0 : roundMoney(qty);
  const safeUnitPrice = status === 'FAILED' || status === 'Return' || status === 'Lost' ? 0 : roundMoney(unitPrice);
  const safeUnitCost = roundMoney(unitCost);
  const grossAmount = grossOverride !== null ? roundMoney(grossOverride) : roundMoney(safeQty * safeUnitPrice);
  const totalCost = roundMoney(safeQty * safeUnitCost);
  const vatSplit = isVatExempt || grossAmount <= 0 ? { netOfVat: grossAmount, vatAmount: 0 } : calculateVatFromGross(grossAmount, vatRate);
  const costVatSplit = isVatExempt || totalCost <= 0 ? { netOfVat: totalCost, vatAmount: 0 } : calculateVatFromGross(totalCost, vatRate);

  return {
    qty: safeQty,
    unitPrice: safeUnitPrice,
    grossAmount,
    inputVat: isVatExempt ? 0 : vatSplit.netOfVat,
    outputVat: isVatExempt ? 0 : vatSplit.vatAmount,
    vatExemptAmount: isVatExempt ? grossAmount : 0,
    costing: safeUnitCost,
    totalCost,
    profit: roundMoney(grossAmount - vatSplit.vatAmount - totalCost)
  };
}

export function calculatePurchaseLine({ grossAmount = 0, isVatExempt = false, vatRate = VAT_RATE }) {
  const gross = roundMoney(grossAmount);
  if (isVatExempt || gross <= 0) {
    return {
      grossAmount: gross,
      netOfVat: gross,
      inputVat: 0,
      outputVat: 0
    };
  }

  const { netOfVat, vatAmount } = calculateVatFromGross(gross, vatRate);

  return {
    grossAmount: gross,
    netOfVat,
    inputVat: vatAmount,
    outputVat: vatAmount
  };
}
