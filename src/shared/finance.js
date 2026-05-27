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

export const deliveryExpenseCategory = 'Delivery Charge & Fee\'s';

export const expenseCategories = [
  'Communication, Light and Water',
  'Fuel & Oil',
  'Repairs & Maintenance',
  'Miscellaneous',
  'Professional Fees',
  deliveryExpenseCategory,
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

export function isWalkInChannel(channel) {
  const normalized = String(channel || '').trim().toLowerCase().replace(/-/g, ' ');
  return normalized === 'walk in' || normalized === 'walkin';
}

/** Products that must not appear on sales line items (fees, FX, services). */
export function isNonSaleProduct(product) {
  if (!product) {
    return true;
  }

  if (product.isHidden || product.is_hidden) {
    return true;
  }

  const name = String(product.name || '').trim().toLowerCase().replace(/-/g, ' ');
  const code = String(product.code || '').trim().toLowerCase().replace(/-/g, ' ');

  const blockedTerms = [
    'shipping',
    'shipping fee',
    'shippingfee',
    'delivery charge',
    'delivery fee',
    'freight',
    'courier',
    'gain and loss',
    'gain loss',
    'gain/loss',
    'foreign exchange',
    'fx gain',
    'fx loss',
    'service fee',
    'service charge'
  ];

  return blockedTerms.some((term) => name.includes(term) || code.includes(term));
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

/** Parse YYYY-MM-DD (and other values) as local calendar dates — avoids UTC day shift. */
export function parseLocalDate(value) {
  if (!value && value !== 0) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() === year
      && date.getMonth() === month - 1
      && date.getDate() === day
    ) {
      return date;
    }

    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : parseLocalDate(value);

  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function formatDateShort(value) {
  if (!value) {
    return '-';
  }

  const date = parseLocalDate(value);

  if (!date) {
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
  shippingFee = 0,
  shippingCost = 0,
  unitCost = 0,
  isVatExempt = false,
  isShippingFeeVatExempt = false,
  isShippingCostVatExempt = false,
  status = 'PAID',
  vatRate = VAT_RATE,
  grossOverride = null
}) {
  const safeQty = status === 'FAILED' || status === 'Return' ? 0 : roundMoney(qty);
  const safeUnitPrice = status === 'FAILED' || status === 'Return' || status === 'Lost' ? 0 : roundMoney(unitPrice);
  const safeShippingFee = status === 'FAILED' || status === 'Return' ? 0 : roundMoney(shippingFee);
  const safeShippingCost = status === 'FAILED' || status === 'Return' ? 0 : roundMoney(shippingCost);
  const safeUnitCost = roundMoney(unitCost);
  const productGross = roundMoney(safeQty * safeUnitPrice);
  const grossAmount = grossOverride !== null ? roundMoney(grossOverride) : roundMoney(productGross + safeShippingFee);
  const productCost = roundMoney(safeQty * safeUnitCost);
  const totalCost = roundMoney(productCost + safeShippingCost);
  const costVatSplit = isVatExempt || productCost <= 0 ? { netOfVat: productCost, vatAmount: 0 } : calculateVatFromGross(productCost, vatRate);
  const shippingCostVatSplit = isShippingCostVatExempt || safeShippingCost <= 0
    ? { netOfVat: safeShippingCost, vatAmount: 0 }
    : calculateVatFromGross(safeShippingCost, vatRate);
  const shippingMargin = roundMoney(safeShippingFee - safeShippingCost);

  if (grossOverride !== null || grossAmount <= 0) {
    const lineExempt = isVatExempt || (isShippingFeeVatExempt && productGross <= 0);
    const vatSplit = lineExempt || grossAmount <= 0
      ? { netOfVat: grossAmount, vatAmount: 0 }
      : calculateVatFromGross(grossAmount, vatRate);

    return {
      qty: safeQty,
      unitPrice: safeUnitPrice,
      shippingFee: safeShippingFee,
      shippingCost: safeShippingCost,
      shippingMargin,
      grossAmount,
      netOfVat: lineExempt ? 0 : vatSplit.netOfVat,
      outputVat: lineExempt ? 0 : vatSplit.vatAmount,
      vatExemptAmount: lineExempt ? grossAmount : 0,
      costing: safeUnitCost,
      totalCost,
      profit: roundMoney(grossAmount - vatSplit.vatAmount - costVatSplit.netOfVat - shippingCostVatSplit.netOfVat)
    };
  }

  const productExempt = isVatExempt;
  const shippingExempt = isVatExempt || isShippingFeeVatExempt;

  let productNet = 0;
  let productVat = 0;
  let productExemptAmount = 0;
  let shippingNet = 0;
  let shippingVat = 0;
  let shippingExemptAmount = 0;

  if (productExempt || productGross <= 0) {
    productExemptAmount = productGross;
  } else {
    const productSplit = calculateVatFromGross(productGross, vatRate);
    productNet = productSplit.netOfVat;
    productVat = productSplit.vatAmount;
  }

  if (shippingExempt || safeShippingFee <= 0) {
    shippingExemptAmount = safeShippingFee;
  } else {
    const shippingSplit = calculateVatFromGross(safeShippingFee, vatRate);
    shippingNet = shippingSplit.netOfVat;
    shippingVat = shippingSplit.vatAmount;
  }

  const outputVat = roundMoney(productVat + shippingVat);
  const vatExemptAmount = roundMoney(productExemptAmount + shippingExemptAmount);
  const netOfVat = productExempt
    ? roundMoney(shippingExempt ? 0 : shippingNet)
    : roundMoney(productNet + (shippingExempt ? 0 : shippingNet));

  return {
    qty: safeQty,
    unitPrice: safeUnitPrice,
    shippingFee: safeShippingFee,
    shippingCost: safeShippingCost,
    shippingMargin,
    grossAmount,
    netOfVat,
    outputVat,
    vatExemptAmount,
    costing: safeUnitCost,
    totalCost,
    profit: roundMoney(grossAmount - outputVat - costVatSplit.netOfVat - shippingCostVatSplit.netOfVat)
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
