import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import Database from 'better-sqlite3';
import ExcelJS from 'exceljs';
import { initializeSchema, requiredTables } from './schema.js';
import {
  calculatePurchaseLine,
  calculateSaleLine,
  calculateAverageCost,
  companyNames,
  defaultTaxSettings,
  expenseCategories,
  formatDateShort,
  productCategories,
  roundMoney,
  saleStatuses,
  salesChannels,
  toDateInputValue
} from '../src/shared/finance.js';

const DATABASE_FILENAME = 'agridb.db';
const DATA_DIRECTORY_NAME = 'data';
const DEFAULT_REORDER_POINT = 10;

function nowIso() {
  return new Date().toISOString();
}

function todayIsoDate() {
  return toDateInputValue(new Date());
}

function normalizeRate(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function createId() {
  return globalThis.crypto.randomUUID();
}

function cleanString(value) {
  let s = String(value ?? '').trim();
  if (s.endsWith('.0')) {
    s = s.slice(0, -2);
  }
  return s;
}

function asBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function asEnum(value, allowedValues, fallback) {
  const normalized = cleanString(value);

  if (allowedValues.includes(normalized)) {
    return normalized;
  }

  return fallback;
}

function normalizeCompany(value) {
  const s = cleanString(value).toLowerCase();
  if (!s) return companyNames[0];

  const found = companyNames.find(c => c.toLowerCase() === s);
  return found || companyNames[0];
}

function normalizeExpenseCategory(value) {
  const val = cleanString(value).trim();
  if (!val) return 'Miscellaneous';

  const lowerVal = val.toLowerCase();

  // 1. Direct case-insensitive match
  const foundExact = expenseCategories.find(c => c.toLowerCase() === lowerVal);
  if (foundExact) return foundExact;

  // 2. Keyword/substring matches (robust fallback for Excel variations)
  if (lowerVal.includes('light') || lowerVal.includes('water') || lowerVal.includes('electricity') || lowerVal.includes('power') || lowerVal.includes('communication')) {
    return 'Communication, Light and Water';
  }
  if (lowerVal.includes('fuel') || lowerVal.includes('oil')) {
    return 'Fuel & Oil';
  }
  if (lowerVal.includes('repair') || lowerVal.includes('maintenance')) {
    return 'Repairs & Maintenance';
  }
  if (lowerVal.includes('professional') || lowerVal.includes('consult')) {
    return 'Professional Fees';
  }
  if (lowerVal.includes('delivery') || lowerVal.includes('shipping') || lowerVal.includes('courier') || lowerVal.includes('freight')) {
    return "Delivery Charge & Fee's";
  }
  if (lowerVal.includes('travel') || lowerVal.includes('transportation') || lowerVal.includes('transport') || lowerVal.includes('toll')) {
    return 'Transportation and Travel';
  }
  if (lowerVal.includes('representation')) {
    return 'Representation';
  }
  if (lowerVal.includes('insurance')) {
    return 'Insurance';
  }
  if (lowerVal.includes('office') || lowerVal.includes('stationery') || (lowerVal.includes('supplies') && lowerVal.includes('office'))) {
    return 'Office Supplies';
  }
  if (lowerVal.includes('materials') || (lowerVal.includes('supplies') && (lowerVal.includes('materials') || lowerVal.includes('supply')))) {
    return 'Materials & Supplies';
  }
  if (lowerVal.includes('salary') || lowerVal.includes('wage') || lowerVal.includes('payroll') || lowerVal.includes('salaries')) {
    return 'Salaries';
  }
  if (lowerVal.includes('permit') || lowerVal.includes('license') || lowerVal.includes('permits') || lowerVal.includes('licenses')) {
    return 'Permit & License';
  }
  if (lowerVal.includes('customs') || lowerVal.includes('brokerage')) {
    return "Customs & Brokerage Fee's";
  }
  if (lowerVal.includes('install') || lowerVal.includes('installation')) {
    return 'Installation & Services';
  }
  if (lowerVal.includes('loss') || lowerVal.includes('damage') || lowerVal.includes('damaged')) {
    return 'Loss & Damage Goods';
  }
  if (lowerVal.includes('fee') && lowerVal.includes('charge')) {
    return "Fee's & Charges";
  }

  // 3. Normalized stripped match
  const clean = (str) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/and/g, '')
      .replace(/s$/g, '')
      .replace(/fee/g, '')
      .replace(/charge/g, '');
  };
  const inputCleaned = clean(val);
  const foundCleaned = expenseCategories.find(c => clean(c) === inputCleaned);
  if (foundCleaned) return foundCleaned;

  return 'Miscellaneous';
}

function parseExcelDate(cell, dateVal) {
  if (!dateVal) return null;
  if (cell && (cell.type === ExcelJS.ValueType.Date || cell.value instanceof Date)) {
    try {
      return cell.value.toISOString().slice(0, 10);
    } catch (e) { /* ignore */ }
  }
  // Check if it is a serial number
  const num = Number(dateVal);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    try {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    } catch (e) { /* ignore */ }
  }
  try {
    const parsed = new Date(dateVal);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  } catch (e) { /* ignore */ }
  return null;
}

function getWritableDatabasePath() {
  return path.join(app.getPath('userData'), DATA_DIRECTORY_NAME, DATABASE_FILENAME);
}

function getSeedDatabaseCandidates() {
  return [
    path.resolve(app.getAppPath(), DATABASE_FILENAME),
    path.resolve(process.resourcesPath, DATABASE_FILENAME),
    path.resolve(process.cwd(), DATABASE_FILENAME)
  ];
}

function ensureDatabaseFile() {
  const dbPath = getWritableDatabasePath();
  const dbDirectory = path.dirname(dbPath);

  fs.mkdirSync(dbDirectory, { recursive: true });

  if (fs.existsSync(dbPath)) {
    return dbPath;
  }

  const seedPath = getSeedDatabaseCandidates().find((candidate) => fs.existsSync(candidate));

  if (seedPath) {
    fs.copyFileSync(seedPath, dbPath);
    return dbPath;
  }

  const db = new Database(dbPath);

  try {
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  } finally {
    db.close();
  }

  return dbPath;
}

function validateSchema(db) {
  const tableNames = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)
  );
  const missing = requiredTables().filter((table) => !tableNames.has(table));

  if (missing.length > 0) {
    throw new Error(`Database schema is incomplete. Missing tables: ${missing.join(', ')}.`);
  }

  const salesColumns = new Set(db.prepare('PRAGMA table_info(sales)').all().map((column) => column.name));
  const purchaseColumns = new Set(db.prepare('PRAGMA table_info(purchases)').all().map((column) => column.name));

  if (!salesColumns.has('company_name')) {
    throw new Error(`Database schema is incomplete. Missing column: sales.company_name. Allowed values: ${companyNames.join(', ')}.`);
  }

  if (!purchaseColumns.has('company_name')) {
    throw new Error(`Database schema is incomplete. Missing column: purchases.company_name. Allowed values: ${companyNames.join(', ')}.`);
  }
}

function openDatabase() {
  const db = new Database(ensureDatabaseFile());

  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  initializeSchema(db);
  validateSchema(db);

  return db;
}

function serializeProduct(row) {
  const stock = roundMoney(row.current_stock ?? row.stock_qty);
  let batches = [];
  try {
    if (row.active_batches) {
      batches = JSON.parse(row.active_batches);
    }
  } catch (e) {
    console.error('Failed to parse active_batches', e);
  }

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    unit: row.unit,
    cost: roundMoney(row.current_cost_basis ?? row.cost),
    oldestCostBasis: roundMoney(row.oldest_cost_basis ?? row.cost),
    averageCost: calculateAverageCost(row.current_cost_basis ?? row.cost, row.labor_cost, row.packaging_cost),
    srp: roundMoney(row.current_srp ?? row.srp),
    sackWeightKg: roundMoney(row.sack_weight_kg),
    pricePerKg: roundMoney(row.price_per_kg),
    laborCost: roundMoney(row.labor_cost),
    packagingCost: roundMoney(row.packaging_cost),
    stockQty: stock,
    currentBatchStock: roundMoney(row.oldest_batch_stock ?? row.stock_qty),
    batches,
    isVatExempt: Boolean(row.is_vat_exempt),
    isRetail: row.unit === 'kg' && (String(row.code || '').endsWith('-KG') || String(row.description || '').includes('Retail split from')),
    reorderPoint: roundMoney(row.reorder_point),
    photoPath: row.photo_path,
    lowStock: stock <= roundMoney(row.reorder_point),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    address2: row.address_2,
    contactNumber: cleanString(row.contact_number),
    customerUsername: row.customer_username,
    tin: row.tin,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeSupplier(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    contactNumber: cleanString(row.contact_number),
    tin: row.tin,
    email: row.email,
    category: row.category,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializePurchase(row) {
  return {
    id: row.id,
    companyName: row.company_name,
    date: row.date,
    supplierTin: row.supplier_tin,
    supplierName: row.supplier_name,
    receiptNumber: row.receipt_number,
    address: row.address,
    grossAmount: roundMoney(row.gross_amount),
    netOfVat: roundMoney(row.net_of_vat),
    inputVat: roundMoney(row.input_vat),
    outputVat: roundMoney(row.output_vat),
    isVatExempt: Boolean(row.is_vat_exempt),
    expenseCategory: row.expense_category,
    remarks: row.remarks,
    items: JSON.parse(row.items_json || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializePurchaseItem(row) {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    qty: roundMoney(row.qty),
    unit: row.unit,
    unitCost: roundMoney(row.unit_cost),
    srp: roundMoney(row.srp),
    grossAmount: roundMoney(row.gross_amount),
    createdAt: row.created_at
  };
}

function getTaxSettings(db) {
  const rows = db.prepare("SELECT key, value FROM app_settings WHERE key IN ('vat_rate', 'income_tax_rate')").all();
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    vatRate: normalizeRate(values.vat_rate, defaultTaxSettings.vatRate),
    incomeTaxRate: normalizeRate(values.income_tax_rate, defaultTaxSettings.incomeTaxRate)
  };
}

function saveTaxSettings(db, payload = {}) {
  const stamp = nowIso();
  const current = getTaxSettings(db);
  const settings = {
    vatRate: normalizeRate(payload.vatRate ?? payload.vat_rate, current.vatRate),
    incomeTaxRate: normalizeRate(payload.incomeTaxRate ?? payload.income_tax_rate, current.incomeTaxRate)
  };

  const upsert = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    upsert.run('vat_rate', String(settings.vatRate), stamp);
    upsert.run('income_tax_rate', String(settings.incomeTaxRate), stamp);
  });
  tx();

  return getTaxSettings(db);
}

function serializeBatch(row) {
  return {
    id: row.id,
    productId: row.product_id,
    batchNumber: row.batch_number,
    date: row.date,
    unitCost: roundMoney(row.unit_cost),
    srp: roundMoney(row.srp),
    remainingQty: roundMoney(row.remaining_qty),
    unit: row.unit,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeSaleItem(row) {
  return {
    id: row.id,
    saleId: row.sale_id,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    qty: roundMoney(row.qty),
    unit: row.unit,
    unitPrice: roundMoney(row.unit_price),
    grossAmount: roundMoney(row.gross_amount),
    inputVat: roundMoney(row.input_vat),
    outputVat: roundMoney(row.output_vat),
    vatExemptAmount: roundMoney(row.vat_exempt_amount),
    costing: roundMoney(row.costing),
    totalCost: roundMoney(row.total_cost),
    profit: roundMoney(row.profit),
    createdAt: row.created_at,
    isVatExempt: (row.vat_exempt_amount ?? 0) > 0
  };
}

function serializeSaleSummary(row) {
  return {
    id: row.id,
    companyName: row.company_name,
    date: row.date,
    siNumber: row.si_number,
    receiptNumber: row.receipt_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerContact: cleanString(row.customer_contact),
    channel: row.channel,
    status: row.status,
    poNumber: row.po_number,
    invoiceType: row.invoice_type,
    remarks: row.remarks,
    grossAmount: roundMoney(row.gross_amount),
    inputVat: roundMoney(row.input_vat),
    outputVat: roundMoney(row.output_vat),
    vatExemptAmount: roundMoney(row.vat_exempt_amount),
    profit: roundMoney(row.profit),
    items: JSON.parse(row.items_json || '[]'),
    itemCount: Number(row.item_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getProductStock(db, productId) {
  const cleanedProductId = cleanString(productId);
  const row = db.prepare(
    `SELECT 
      COALESCE((SELECT SUM(remaining_qty) FROM batches WHERE product_id = ? AND remaining_qty > 0), 0) +
      COALESCE((SELECT stock_qty FROM products WHERE id = ?), 0) AS stock`
  ).get(cleanedProductId, cleanedProductId);

  return roundMoney(row.stock);
}

function createBatch(db, payload = {}) {
  const stamp = nowIso();
  const id = cleanString(payload.id) || createId();
  const productId = cleanString(payload.productId);
  const batchNumber = cleanString(payload.batchNumber) || `BATCH-${Date.now()}`;
  const date = cleanString(payload.date) || todayIsoDate();
  const unitCost = roundMoney(payload.unitCost);
  const remainingQty = roundMoney(payload.remainingQty);
  const unit = cleanString(payload.unit) || 'pc';

  if (!productId) {
    throw new Error('Product ID is required.');
  }

  if (remainingQty <= 0) {
    throw new Error('Remaining quantity must be greater than 0.');
  }

  db.prepare(
    `
      INSERT INTO batches (
        id, product_id, batch_number, date, unit_cost, srp, remaining_qty, unit, created_at, updated_at
      )
      VALUES (
        @id, @product_id, @batch_number, @date, @unit_cost, @srp, @remaining_qty, @unit, @created_at, @updated_at
      )
    `
  ).run({
    id,
    product_id: productId,
    batch_number: batchNumber,
    date,
    unit_cost: unitCost,
    srp: roundMoney(payload.srp ?? 0),
    remaining_qty: remainingQty,
    unit,
    created_at: stamp,
    updated_at: stamp
  });

  return serializeBatch(db.prepare('SELECT * FROM batches WHERE id = ?').get(id));
}

function consumeStock(db, productId, qtyToConsume) {
  const stamp = nowIso();
  let remainingToConsume = roundMoney(qtyToConsume);
  const consumed = [];

  // 1. Try consuming from batches FIFO first
  const batches = db
    .prepare('SELECT * FROM batches WHERE product_id = ? AND remaining_qty > 0 ORDER BY date ASC, created_at ASC')
    .all(cleanString(productId));

  for (const batch of batches) {
    if (remainingToConsume <= 0) break;

    const consumeFromThis = Math.min(roundMoney(batch.remaining_qty), remainingToConsume);
    const newRemaining = roundMoney(batch.remaining_qty) - consumeFromThis;

    db.prepare('UPDATE batches SET remaining_qty = ?, updated_at = ? WHERE id = ?')
      .run(newRemaining, stamp, batch.id);

    consumed.push({
      batchId: batch.id,
      consumedQty: consumeFromThis,
      unitCost: roundMoney(batch.unit_cost),
      unitSrp: roundMoney(batch.srp)
    });

    remainingToConsume = roundMoney(remainingToConsume - consumeFromThis);
  }

  // 2. If still remaining, consume from products.stock_qty
  if (remainingToConsume > 0) {
    const product = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(cleanString(productId));
    const legacyStock = product ? roundMoney(product.stock_qty) : 0;

    if (legacyStock < remainingToConsume) {
      throw new Error(`Insufficient stock for product ${productId}. Needed: ${qtyToConsume}, available: ${qtyToConsume - remainingToConsume + legacyStock}`);
    }

    db.prepare('UPDATE products SET stock_qty = stock_qty - ?, updated_at = ? WHERE id = ?')
      .run(remainingToConsume, stamp, productId);
  }

  return consumed;
}

function getFinancialStatement(db, { fromDate = '', toDate = '', companyName = '' } = {}) {
  const taxSettings = getTaxSettings(db);
  const start = fromDate || (todayIsoDate().slice(0, 7) + '-01');
  const end = toDate || todayIsoDate();

  const conditions = ['date >= ?', 'date <= ?'];
  const params = [start, end];

  if (companyName && companyName !== 'all') {
    conditions.push('company_name = ?');
    params.push(companyName);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // 1. Sales & COGS
  const salesAgg = db.prepare(`
    SELECT 
      COALESCE(SUM(gross_amount - output_vat), 0) as total_sales,
      COALESCE(SUM(COALESCE(gross_amount, 0) - COALESCE(profit, 0) - COALESCE(output_vat, 0)), 0) as total_cogs
    FROM sales
    ${whereClause} AND status NOT IN ('FAILED', 'Return')
  `).get(...params);

  // 2. Expenses by Category
  const expenseRows = db.prepare(`
    SELECT 
      expense_category as category,
      COALESCE(SUM(net_of_vat), 0) as amount
    FROM purchases
    ${whereClause}
    GROUP BY expense_category
  `).all(...params);

  const expenses = {};
  expenseRows.forEach(row => {
    expenses[row.category] = roundMoney(row.amount);
  });

  const matSuppAmount = expenses['Materials & Supplies'] || 0;
  const totalSales = roundMoney(salesAgg.total_sales);
  const totalCogs = roundMoney(matSuppAmount);
  const grossProfit = roundMoney(totalSales - totalCogs);

  // Exclude Materials & Supplies from Operating Expenses
  delete expenses['Materials & Supplies'];

  const totalExpenses = roundMoney(Object.values(expenses).reduce((a, b) => a + b, 0));
  const netIncomeBeforeTax = roundMoney(grossProfit - totalExpenses);
  const incomeTaxExpense = roundMoney(netIncomeBeforeTax > 0 ? netIncomeBeforeTax * taxSettings.incomeTaxRate : 0);

  return {
    period: { start, end },
    taxSettings,
    totalSales,
    totalCogs,
    grossProfit,
    expenses,
    totalExpenses,
    incomeTaxExpense,
    netIncomeAfterTax: roundMoney(netIncomeBeforeTax - incomeTaxExpense)
  };
}

function getDashboardSummary(db, { fromDate = '', toDate = '' } = {}) {
  const today = todayIsoDate();
  const defaultMonthStart = today.slice(0, 7) + '-01';
  const start = fromDate || defaultMonthStart;
  const end = toDate || today;

  const salesAgg = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(CASE WHEN date = ? AND status NOT IN ('FAILED', 'Return') THEN gross_amount - output_vat ELSE 0 END), 0) AS sales_today,
          COALESCE(SUM(CASE WHEN date >= ? AND date <= ? AND status NOT IN ('FAILED', 'Return') THEN gross_amount - output_vat ELSE 0 END), 0) AS sales_period,
          COALESCE(SUM(CASE WHEN date >= ? AND date <= ? AND status NOT IN ('FAILED', 'Return') THEN profit ELSE 0 END), 0) AS profit_period,
          COALESCE(SUM(CASE WHEN date >= ? AND date <= ? AND status NOT IN ('FAILED', 'Return') THEN output_vat ELSE 0 END), 0) AS output_vat_period,
          COALESCE(SUM(CASE WHEN date >= ? AND date <= ? AND status NOT IN ('FAILED', 'Return') THEN vat_exempt_amount ELSE 0 END), 0) AS vat_exempt_sales,
          COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN gross_amount ELSE 0 END), 0) AS gross_period
        FROM sales
      `
    )
    .get(today, start, end, start, end, start, end, start, end, start, end);

  const expenseAgg = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(gross_amount), 0) AS expense_period,
          COALESCE(SUM(input_vat), 0) AS input_vat_period
        FROM purchases
        WHERE date >= ? AND date <= ?
      `
    )
    .get(start, end);

  const inventoryAgg = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(batch_value + (p.stock_qty * p.cost)), 0) AS inventory_value,
          COALESCE(SUM(batch_qty + p.stock_qty), 0) AS units_on_hand
        FROM (
          SELECT
            p.id,
            p.stock_qty,
            p.cost,
            COALESCE(SUM(b.remaining_qty), 0) AS batch_qty,
            COALESCE(SUM(b.remaining_qty * b.unit_cost), 0) AS batch_value
          FROM products p
          LEFT JOIN batches b ON b.product_id = p.id AND b.remaining_qty > 0
          GROUP BY p.id
        ) p
      `
    )
    .get();

  const lowStockCount = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM products p
        WHERE (p.stock_qty + COALESCE((SELECT SUM(remaining_qty) FROM batches WHERE product_id = p.id AND remaining_qty > 0), 0)) <= p.reorder_point
      `
    )
    .get().count;

  const topProducts = db
    .prepare(
      `
        SELECT
          p.id,
          p.code,
          p.name,
          p.unit,
          SUM(si.qty) AS qty_sold,
          SUM(si.gross_amount) AS revenue
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        INNER JOIN products p ON p.id = si.product_id
        WHERE s.status NOT IN ('FAILED', 'Return') AND s.date >= ? AND s.date <= ?
        GROUP BY p.id
        ORDER BY revenue DESC, qty_sold DESC
        LIMIT 5
      `
    )
    .all(start, end)
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit,
      qtySold: roundMoney(row.qty_sold),
      revenue: roundMoney(row.revenue)
    }));

  const channelBreakdown = db
    .prepare(
      `
        SELECT
          channel,
          COUNT(*) AS sale_count,
          SUM(gross_amount) AS revenue
        FROM sales
        WHERE status NOT IN ('FAILED', 'Return') AND date >= ? AND date <= ?
        GROUP BY channel
        ORDER BY revenue DESC, sale_count DESC
      `
    )
    .all(start, end)
    .map((row) => ({
      channel: row.channel,
      saleCount: Number(row.sale_count ?? 0),
      revenue: roundMoney(row.revenue)
    }));

  const expenseBreakdown = db
    .prepare(
      `
        SELECT
          expense_category,
          SUM(gross_amount) AS amount
        FROM purchases
        WHERE date >= ? AND date <= ?
        GROUP BY expense_category
        ORDER BY amount DESC
      `
    )
    .all(start, end)
    .map((row) => ({
      category: row.expense_category,
      amount: roundMoney(row.amount)
    }));

  const recentSales = db
    .prepare(
      `
        SELECT
          s.*,
          c.name AS customer_name,
          c.contact_number AS customer_contact,
          COUNT(si.id) AS item_count
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN sale_items si ON si.sale_id = s.id
        GROUP BY s.id
        ORDER BY s.receipt_number DESC, s.date DESC, s.created_at DESC
        LIMIT 6
      `
    )
    .all()
    .map(serializeSaleSummary);

  const recentPurchases = db
    .prepare(
      `
        SELECT *
        FROM purchases
        ORDER BY date DESC, created_at DESC
        LIMIT 6
      `
    )
    .all()
    .map(serializePurchase);

  const lowStockProducts = db
    .prepare(
      `
        SELECT p.*, (p.stock_qty + COALESCE((SELECT SUM(remaining_qty) FROM batches WHERE product_id = p.id AND remaining_qty > 0), 0)) AS current_stock
        FROM products p
        WHERE current_stock <= p.reorder_point
        ORDER BY current_stock ASC, p.name ASC
        LIMIT 100
      `
    )
    .all()
    .map((row) => ({
      ...serializeProduct(row),
      stockQty: roundMoney(row.current_stock)
    }));

  // A/R (Accounts Receivable) summary
  const arAgg = db.prepare(`
    SELECT
      COUNT(*) AS ar_count,
      COALESCE(SUM(gross_amount), 0) AS ar_total
    FROM sales
    WHERE status = 'A/R'
  `).get();

  const arSales = db.prepare(`
    SELECT
      s.*,
      c.name AS customer_name,
      c.contact_number AS customer_contact,
      COUNT(si.id) AS item_count
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.status = 'A/R'
    GROUP BY s.id
    ORDER BY s.date ASC, s.created_at ASC
  `).all().map(serializeSaleSummary);

  return {
    today,
    monthStart: start,
    monthEnd: end,
    salesToday: roundMoney(salesAgg.sales_today),
    salesMonth: roundMoney(salesAgg.sales_period),
    profitMonth: roundMoney(salesAgg.profit_period),
    outputVatMonth: roundMoney(salesAgg.output_vat_period),
    vatExemptSales: roundMoney(salesAgg.vat_exempt_sales),
    grossMonth: roundMoney(salesAgg.gross_period),
    expenseMonth: roundMoney(expenseAgg.expense_period),
    inputVatMonth: roundMoney(expenseAgg.input_vat_period),
    inventoryValue: roundMoney(inventoryAgg.inventory_value),
    unitsOnHand: roundMoney(inventoryAgg.units_on_hand),
    lowStockCount: Number(lowStockCount ?? 0),
    topProducts,
    channelBreakdown,
    expenseBreakdown,
    recentSales,
    recentPurchases,
    lowStockProducts,
    arCount: Number(arAgg.ar_count ?? 0),
    arTotal: roundMoney(arAgg.ar_total),
    arSales
  };
}

function listProducts(db, { search = '', category = '' } = {}) {
  const query = cleanString(search).toLowerCase();
  const cat = cleanString(category);
  const params = [];
  let sql = `
    SELECT p.*, 
      COALESCE((SELECT SUM(b.remaining_qty) FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0), 0) + p.stock_qty AS current_stock,
      (SELECT b.srp FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date DESC, b.created_at DESC LIMIT 1) AS current_srp,
      (SELECT b.unit_cost FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC LIMIT 1) AS oldest_cost_basis,
      (SELECT b.unit_cost FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date DESC, b.created_at DESC LIMIT 1) AS current_cost_basis,
      (SELECT b.remaining_qty FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC LIMIT 1) AS oldest_batch_stock,
      (SELECT json_group_array(json_object('remaining_qty', b.remaining_qty, 'srp', b.srp, 'unit_cost', b.unit_cost)) FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC) AS active_batches
    FROM products p
  `;

  const where = [];
  if (query) {
    const like = `%${query}%`;
    where.push(`(lower(p.code) LIKE ? OR lower(p.name) LIKE ? OR lower(p.description) LIKE ? OR lower(p.category) LIKE ?)`);
    params.push(like, like, like, like);
  }

  if (cat && cat !== 'all') {
    where.push(`p.category = ?`);
    params.push(cat);
  }

  if (where.length > 0) {
    sql += ` WHERE ${where.join(' AND ')}`;
  }

  sql += ' ORDER BY p.category ASC, p.name ASC';

  return db.prepare(sql).all(...params).map((row) => serializeProduct(row));
}

function upsertProduct(db, payload = {}) {
  const stamp = nowIso();
  const id = cleanString(payload.id) || createId();
  const code = cleanString(payload.code);
  const name = cleanString(payload.name);
  const category = cleanString(payload.category) || productCategories[0];
  const unit = cleanString(payload.unit) || 'pc';
  const description = cleanString(payload.description);
  const cost = roundMoney(payload.cost);
  const laborCost = roundMoney(payload.labor_cost ?? payload.laborCost);
  const packagingCost = roundMoney(payload.packaging_cost ?? payload.packagingCost);
  const averageCost = calculateAverageCost(cost, laborCost, packagingCost);
  const srp = roundMoney(payload.srp);
  const sackWeightKg = roundMoney(payload.sack_weight_kg ?? payload.sackWeightKg);
  const pricePerKg = roundMoney(payload.price_per_kg ?? payload.pricePerKg);
  const initialStock = roundMoney(payload.stock_qty ?? payload.stockQty);
  const photoPath = cleanString(payload.photo_path ?? payload.photoPath);

  const isVatExempt = asBoolean(payload.is_vat_exempt ?? payload.isVatExempt);
  const reorderPoint = roundMoney(payload.reorder_point ?? payload.reorderPoint ?? DEFAULT_REORDER_POINT);

  if (!code) {
    throw new Error('Product code is required.');
  }

  if (!name) {
    throw new Error('Product name is required.');
  }

  const existingProductWithCode = db.prepare('SELECT id FROM products WHERE code = ?').get(code);
  if (existingProductWithCode && existingProductWithCode.id !== id) {
    throw new Error(
      `Product code "${code}" already exists. Please choose a different product code or edit the existing product.`
    );
  }

  // Calculate current total stock (batches + legacy stock_qty)
  const currentBatchSum = db.prepare('SELECT COALESCE(SUM(remaining_qty), 0) AS sum FROM batches WHERE product_id = ? AND remaining_qty > 0').get(id)?.sum || 0;
  const productRecord = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(id);
  const currentLegacyStock = productRecord ? roundMoney(productRecord.stock_qty) : 0;
  const currentTotalStock = roundMoney(currentBatchSum + currentLegacyStock);
  const targetTotalStock = roundMoney(payload.stock_qty ?? payload.stockQty);

  // Check if this is a new product (not yet in DB)
  const isNewProduct = !productRecord;

  let result;
  try {
    // Always set stock_qty to 0 — all stock is tracked via batches
    result = db.prepare(
      `
        INSERT INTO products (
          id, code, name, description, category, unit, cost, average_cost, srp,
          sack_weight_kg, price_per_kg, labor_cost, packaging_cost, stock_qty, is_vat_exempt, reorder_point, photo_path, created_at, updated_at
        )
        VALUES (
          @id, @code, @name, @description, @category, @unit, @cost, @average_cost, @srp,
          @sack_weight_kg, @price_per_kg, @labor_cost, @packaging_cost, 0, @is_vat_exempt, @reorder_point, @photo_path, @created_at, @updated_at
        )
        ON CONFLICT(id) DO UPDATE SET
          code = excluded.code,
          name = excluded.name,
          description = excluded.description,
          category = excluded.category,
          unit = excluded.unit,
          cost = excluded.cost,
          average_cost = excluded.average_cost,
          srp = excluded.srp,
          sack_weight_kg = excluded.sack_weight_kg,
          price_per_kg = excluded.price_per_kg,
          labor_cost = excluded.labor_cost,
          packaging_cost = excluded.packaging_cost,
          stock_qty = 0,
          is_vat_exempt = excluded.is_vat_exempt,
          reorder_point = excluded.reorder_point,
          photo_path = excluded.photo_path,
          updated_at = excluded.updated_at
      `
    ).run({
      id,
      code,
      name,
      description,
      category,
      unit,
      cost,
      average_cost: averageCost,
      srp,
      sack_weight_kg: sackWeightKg,
      price_per_kg: pricePerKg,
      labor_cost: laborCost,
      packaging_cost: packagingCost,
      is_vat_exempt: isVatExempt ? 1 : 0,
      reorder_point: reorderPoint,
      photo_path: photoPath,
      created_at: stamp,
      updated_at: stamp
    });
  } catch (error) {
    const message = String(error.message || '');
    if (/UNIQUE constraint failed: products\.code/i.test(message)) {
      throw new Error(
        `Product code "${code}" already exists. Please choose a different product code or edit the existing product.`
      );
    }

    throw error;
  }

  // Handle stock adjustments
  if (isNewProduct) {
    // For new products with initial stock > 0, auto-create an initial batch
    if (targetTotalStock > 0) {
      createBatch(db, {
        productId: id,
        batchNumber: `INITIAL-${Date.now()}`,
        date: todayIsoDate(),
        unitCost: cost,
        srp: srp,
        remainingQty: targetTotalStock,
        unit
      });
    }
  } else {
    // For existing products, if targetTotalStock differs from currentTotalStock, adjust
    if (targetTotalStock > currentTotalStock) {
      // Increase: Add an adjustment batch
      const diff = roundMoney(targetTotalStock - currentTotalStock);
      const latestBatch = db.prepare('SELECT * FROM batches WHERE product_id = ? AND remaining_qty > 0 ORDER BY date DESC, created_at DESC LIMIT 1').get(id);

      if (latestBatch && roundMoney(latestBatch.unit_cost) === cost && roundMoney(latestBatch.srp) === srp) {
        db.prepare('UPDATE batches SET remaining_qty = remaining_qty + ?, updated_at = ? WHERE id = ?')
          .run(diff, nowIso(), latestBatch.id);
      } else {
        createBatch(db, {
          productId: id,
          batchNumber: `ADJUST-IN-${Date.now()}`,
          date: todayIsoDate(),
          unitCost: cost,
          srp: srp,
          remainingQty: diff,
          unit
        });
      }
    } else if (targetTotalStock < currentTotalStock) {
      // Decrease: Consume from batches
      const diff = roundMoney(currentTotalStock - targetTotalStock);
      try {
        consumeStock(db, id, diff);
      } catch (e) {
        // If consumeStock fails (e.g. somehow batches ran out mid-transaction),
        // we fallback to ensuring total matches by zeroing batches if necessary.
        // But with target < currentTotal, consumeStock should generally work.
        console.error('Adjustment consumeStock failed:', e);
      }
    }
  }

  return getProductById(db, id);
}


function restockProduct(db, payload = {}) {
  const stamp = nowIso();
  const productId = cleanString(payload.productId);
  const qty = roundMoney(payload.quantity);
  const unitCost = roundMoney(payload.unitCost);
  const srp = roundMoney(payload.srp);
  const date = cleanString(payload.date) || todayIsoDate();
  const batchNumber = cleanString(payload.batchNumber) || `RESTOCK-${Date.now()}`;

  if (!productId) {
    throw new Error('Product ID is required for restocking.');
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) {
    throw new Error('Product not found.');
  }

  if (qty <= 0) {
    throw new Error('Restock quantity must be greater than 0.');
  }

  const batch = createBatch(db, {
    productId,
    batchNumber,
    date,
    unitCost,
    srp,
    remainingQty: qty,
    unit: product.unit
  });

  // Update product's base cost and SRP to the latest restock values
  const laborCost = roundMoney(product.labor_cost);
  const packagingCost = roundMoney(product.packaging_cost);
  const averageCost = calculateAverageCost(unitCost, laborCost, packagingCost);

  db.prepare(`
    UPDATE products 
    SET cost = ?, average_cost = ?, srp = ?, updated_at = ?
    WHERE id = ?
  `).run(unitCost, averageCost, srp, stamp, productId);

  // Record inventory movement
  db.prepare(`
    INSERT INTO inventory_movements (
      id, product_id, reference_type, reference_id, date, movement_type,
      qty_in, qty_out, note, created_at
    )
    VALUES (?, ?, 'RESTOCK', ?, ?, 'IN', ?, 0, ?, ?)
  `).run(
    createId(), productId, batch.id, date, qty,
    `Restocked ${qty} ${product.unit} @ ${unitCost} each`, stamp
  );

  return getProductById(db, productId);
}


function deleteProduct(db, id) {
  const productId = cleanString(id);
  if (!productId) {
    throw new Error('Product id is required.');
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(productId);
  return true;
}

function bulkDeleteProducts(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return false;
  const tx = db.transaction(() => {
    for (const id of ids) {
      deleteProduct(db, id);
    }
  });
  tx();
  return true;
}

function splitProduct(db, productId, quantity = 1, laborCost = 0, packagingCost = 0, srp = null) {
  const product = getProductById(db, productId);
  if (!product) {
    throw new Error('Product not found.');
  }

  const qty = parseFloat(quantity) || 1;
  const lCost = parseFloat(laborCost) || 0;
  const pCost = parseFloat(packagingCost) || 0;

  if (qty <= 0) {
    throw new Error('Quantity must be greater than 0.');
  }

  if (product.stockQty < qty) {
    throw new Error(`Insufficient stock for "${product.name}". You have ${product.stockQty} ${product.unit}, but need ${qty} to split.`);
  }

  if (product.sackWeightKg <= 0) {
    throw new Error(`Product "${product.name}" does not have a sack weight configured. Please edit the product first.`);
  }

  const stamp = nowIso();
  const kgProductName = `${product.name} (kg)`;
  const kgProductCode = `${product.code}-KG`;

  // Calculate SRP if not provided
  const retailSrp = srp !== null ? roundMoney(srp) : roundMoney(product.pricePerKg > 0 ? product.pricePerKg : (product.sackWeightKg > 0 ? product.srp / product.sackWeightKg : product.srp));

  const tx = db.transaction(() => {
    // 1. Deduct quantity from original product
    consumeStock(db, product.id, qty);

    // Record movement for the original product
    db.prepare(`
      INSERT INTO inventory_movements (
        id, product_id, reference_type, reference_id, date, movement_type,
        qty_in, qty_out, note, created_at
      )
      VALUES (?, ?, 'SPLIT', ?, ?, 'OUT', 0, ?, ?, ?)
    `).run(createId(), product.id, product.id, todayIsoDate(), qty, `Split into retail kg`, stamp);

    // 2. Find or create the kg product
    let kgProduct = db.prepare('SELECT * FROM products WHERE code = ? OR name = ?').get(kgProductCode, kgProductName);

    const addedStock = product.sackWeightKg * qty;
    const baseCostPerKg = product.sackWeightKg > 0 ? product.cost / product.sackWeightKg : product.cost;
    const newAverageCost = roundMoney(baseCostPerKg + lCost + pCost);

    if (kgProduct) {
      // Calculate weighted average cost
      const existing = getProductById(db, kgProduct.id);
      const totalQty = (existing.stockQty || 0) + addedStock;
      const weightedAvgCost = (((existing.stockQty || 0) * (existing.averageCost || existing.cost)) + (addedStock * newAverageCost)) / (totalQty || 1);

      // Update existing kg product costs and SRP
      db.prepare(
        `
          UPDATE products SET
            labor_cost = ?,
            packaging_cost = ?,
            average_cost = ?,
            srp = ?,
            updated_at = ?
          WHERE id = ?
        `
      ).run(lCost, pCost, roundMoney(weightedAvgCost), retailSrp, stamp, kgProduct.id);

      // Create a batch for the added retail stock
      createBatch(db, {
        productId: kgProduct.id,
        batchNumber: `SPLIT-${product.code}-${Date.now()}`,
        date: todayIsoDate(),
        unitCost: newAverageCost,
        srp: retailSrp,
        remainingQty: addedStock,
        unit: 'kg'
      });
    } else {
      // Create new kg product
      const newId = createId();

      db.prepare(
        `
          INSERT INTO products (
            id, code, name, description, category, unit, cost, average_cost, srp,
            sack_weight_kg, price_per_kg, labor_cost, packaging_cost, stock_qty, is_vat_exempt, reorder_point, photo_path, created_at, updated_at
          )
          VALUES (
            @id, @code, @name, @description, @category, @unit, @cost, @average_cost, @srp,
            @sack_weight_kg, @price_per_kg, @labor_cost, @packaging_cost, 0, @is_vat_exempt, @reorder_point, @photo_path, @created_at, @updated_at
          )
        `
      ).run({
        id: newId,
        code: kgProductCode,
        name: kgProductName,
        description: `Retail split from ${product.name}`,
        category: product.category,
        unit: 'kg',
        cost: baseCostPerKg,
        average_cost: newAverageCost,
        srp: retailSrp,
        sack_weight_kg: 0,
        price_per_kg: 0,
        labor_cost: lCost,
        packaging_cost: pCost,
        is_vat_exempt: product.isVatExempt ? 1 : 0,
        reorder_point: 10,
        photo_path: product.photoPath || '',
        created_at: stamp,
        updated_at: stamp
      });

      // Also create an initial batch for the new kg product
      createBatch(db, {
        productId: newId,
        batchNumber: `SPLIT-INIT-${product.code}`,
        date: todayIsoDate(),
        unitCost: newAverageCost,
        srp: retailSrp,
        remainingQty: addedStock,
        unit: 'kg'
      });
    }

    // Record movement for the target product
    const finalKgProduct = db.prepare('SELECT id FROM products WHERE code = ?').get(kgProductCode);
    db.prepare(`
      INSERT INTO inventory_movements (
        id, product_id, reference_type, reference_id, date, movement_type,
        qty_in, qty_out, note, created_at
      )
      VALUES (?, ?, 'SPLIT', ?, ?, 'IN', ?, 0, ?, ?)
    `).run(createId(), finalKgProduct.id, product.id, todayIsoDate(), addedStock, `Retail split from ${product.name}`, stamp);
  });

  tx();
  return true;
}

function getProductById(db, id) {
  const row = db.prepare(`
    SELECT p.*,
      (SELECT b.srp FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC LIMIT 1) AS current_srp,
      (SELECT b.unit_cost FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC LIMIT 1) AS current_cost_basis,
      (SELECT b.remaining_qty FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC LIMIT 1) AS current_batch_stock,
      (SELECT json_group_array(json_object('remaining_qty', b.remaining_qty, 'srp', b.srp, 'unit_cost', b.unit_cost)) FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC) AS active_batches
    FROM products p WHERE p.id = ?
  `).get(cleanString(id));
  if (!row) return null;
  row.current_stock = getProductStock(db, row.id);
  return serializeProduct(row);
}

function uploadProductPhoto(filePath) {
  if (!filePath) {
    throw new Error('File path is required.');
  }

  const dataDir = path.join(app.getPath('userData'), DATA_DIRECTORY_NAME);
  const photosDir = path.join(dataDir, 'photos');
  fs.mkdirSync(photosDir, { recursive: true });

  const fileName = path.basename(filePath);
  const destPath = path.join(photosDir, fileName);

  fs.copyFileSync(filePath, destPath);

  return destPath;
}

function uploadProductPhotoFile(fileName, fileData) {
  if (!fileName) {
    throw new Error('File name is required.');
  }

  if (!fileData) {
    throw new Error('File data is required.');
  }

  const dataDir = path.join(app.getPath('userData'), DATA_DIRECTORY_NAME);
  const photosDir = path.join(dataDir, 'photos');
  fs.mkdirSync(photosDir, { recursive: true });

  const safeName = cleanString(path.basename(fileName)) || createId();
  const destPath = path.join(photosDir, safeName);
  const buffer = Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData);

  fs.writeFileSync(destPath, buffer);
  return destPath;
}

function listCustomers(db, { search = '' } = {}) {
  const query = cleanString(search).toLowerCase();
  const params = [];
  let sql = 'SELECT * FROM customers';

  if (query) {
    const like = `%${query}%`;
    sql += `
      WHERE lower(name) LIKE ?
        OR lower(address) LIKE ?
        OR lower(contact_number) LIKE ?
        OR lower(customer_username) LIKE ?
        OR lower(tin) LIKE ?
    `;
    params.push(like, like, like, like, like);
  }

  sql += ' ORDER BY name ASC';

  return db.prepare(sql).all(...params).map(serializeCustomer);
}

function upsertCustomer(db, payload = {}) {
  const stamp = nowIso();
  const id = cleanString(payload.id) || createId();
  const name = cleanString(payload.name);
  const address = cleanString(payload.address);
  const address2 = cleanString(payload.address_2 ?? payload.address2);
  const contactNumber = cleanString(payload.contact_number ?? payload.contactNumber);
  const customerUsername = cleanString(payload.customer_username ?? payload.customerUsername);
  const tin = cleanString(payload.tin);

  if (!name) {
    throw new Error('Customer name is required.');
  }

  db.prepare(
    `
      INSERT INTO customers (
        id, name, address, address_2, contact_number, customer_username, tin, created_at, updated_at
      )
      VALUES (
        @id, @name, @address, @address2, @contact_number, @customer_username, @tin, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        address = excluded.address,
        address_2 = excluded.address_2,
        contact_number = excluded.contact_number,
        customer_username = excluded.customer_username,
        tin = excluded.tin,
        updated_at = excluded.updated_at
    `
  ).run({
    id,
    name,
    address,
    address2,
    contact_number: contactNumber,
    customer_username: customerUsername,
    tin,
    created_at: stamp,
    updated_at: stamp
  });

  return getCustomerById(db, id);
}

function deleteCustomer(db, id) {
  const customerId = cleanString(id);
  if (!customerId) {
    throw new Error('Customer id is required.');
  }

  db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
  return true;
}

function bulkDeleteCustomers(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return false;
  const tx = db.transaction(() => {
    for (const id of ids) {
      deleteCustomer(db, id);
    }
  });
  tx();
  return true;
}

function getCustomerById(db, id) {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(cleanString(id));
  return row ? serializeCustomer(row) : null;
}

function listSuppliers(db, { search = '' } = {}) {
  const query = cleanString(search).toLowerCase();
  const params = [];
  let sql = 'SELECT * FROM suppliers';

  if (query) {
    const like = `%${query}%`;
    sql += `
      WHERE lower(name) LIKE ?
        OR lower(address) LIKE ?
        OR lower(contact_number) LIKE ?
        OR lower(tin) LIKE ?
        OR lower(email) LIKE ?
        OR lower(category) LIKE ?
    `;
    params.push(like, like, like, like, like, like);
  }

  sql += ' ORDER BY name ASC';

  return db.prepare(sql).all(...params).map(serializeSupplier);
}

function upsertSupplier(db, payload = {}) {
  const stamp = nowIso();
  const id = cleanString(payload.id) || createId();
  const name = cleanString(payload.name);
  const address = cleanString(payload.address);
  const contactNumber = cleanString(payload.contact_number ?? payload.contactNumber);
  const tin = cleanString(payload.tin);
  const email = cleanString(payload.email);
  const category = cleanString(payload.category);
  const notes = cleanString(payload.notes);

  if (!name) {
    throw new Error('Supplier name is required.');
  }

  db.prepare(
    `
      INSERT INTO suppliers (
        id, name, address, contact_number, tin, email, category, notes, created_at, updated_at
      )
      VALUES (
        @id, @name, @address, @contact_number, @tin, @email, @category, @notes, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        address = excluded.address,
        contact_number = excluded.contact_number,
        tin = excluded.tin,
        email = excluded.email,
        category = excluded.category,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `
  ).run({
    id,
    name,
    address,
    contact_number: contactNumber,
    tin,
    email,
    category,
    notes,
    created_at: stamp,
    updated_at: stamp
  });

  return getSupplierById(db, id);
}

function deleteSupplier(db, id) {
  const supplierId = cleanString(id);
  if (!supplierId) {
    throw new Error('Supplier id is required.');
  }
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(supplierId);
  return true;
}

function bulkDeleteSuppliers(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return false;
  const tx = db.transaction(() => {
    for (const id of ids) {
      deleteSupplier(db, id);
    }
  });
  tx();
  return true;
}

function getSupplierById(db, id) {
  const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(cleanString(id));
  return row ? serializeSupplier(row) : null;
}

function listPurchases(db, { search = '', category = '', companyName = '', fromDate = '', toDate = '' } = {}) {
  const conditions = [];
  const params = [];
  const query = cleanString(search).toLowerCase();

  if (query) {
    const like = `%${query}%`;
    conditions.push(
      `(lower(p.supplier_name) LIKE ? OR lower(p.receipt_number) LIKE ? OR lower(p.address) LIKE ? OR lower(p.expense_category) LIKE ? OR lower(p.supplier_tin) LIKE ?)`
    );
    params.push(like, like, like, like, like);
  }

  if (cleanString(category)) {
    conditions.push('p.expense_category = ?');
    params.push(cleanString(category));
  }

  if (cleanString(companyName) && cleanString(companyName) !== 'all') {
    conditions.push('p.company_name = ?');
    params.push(cleanString(companyName));
  }

  if (cleanString(fromDate)) {
    conditions.push('p.date >= ?');
    params.push(cleanString(fromDate));
  }

  if (cleanString(toDate)) {
    conditions.push('p.date <= ?');
    params.push(cleanString(toDate));
  }

  let sql = `
    SELECT 
      p.*,
      json_group_array(
        json_object(
          'id', pi.id,
          'productId', pi.product_id,
          'productCode', pr.code,
          'productName', pr.name,
          'qty', pi.qty,
          'unit', pi.unit,
          'unitCost', pi.unit_cost,
          'srp', pi.srp,
          'grossAmount', pi.gross_amount
        )
      ) AS items_json
    FROM purchases p
    LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
    LEFT JOIN products pr ON pr.id = pi.product_id
  `;

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  sql += ' GROUP BY p.id ORDER BY p.date DESC, p.created_at DESC';

  return db.prepare(sql).all(...params).map(serializePurchase);
}

function upsertPurchase(db, payload = {}) {
  const stamp = nowIso();
  const id = cleanString(payload.id) || createId();
  const companyName = cleanString(payload.company_name ?? payload.companyName) || companyNames[0];
  const date = cleanString(payload.date) || todayIsoDate();
  const supplierTin = cleanString(payload.supplier_tin ?? payload.supplierTin);
  const supplierName = cleanString(payload.supplier_name ?? payload.supplierName);
  const receiptNumber = cleanString(payload.receipt_number ?? payload.receiptNumber);
  const address = cleanString(payload.address);
  const grossAmount = roundMoney(payload.gross_amount ?? payload.grossAmount);
  const isVatExempt = asBoolean(payload.is_vat_exempt ?? payload.isVatExempt);
  const expenseCategory = normalizeExpenseCategory(payload.expense_category ?? payload.expenseCategory);
  const remarks = cleanString(payload.remarks);
  const { vatRate } = getTaxSettings(db);
  const vat = calculatePurchaseLine({ grossAmount, isVatExempt, vatRate });

  if (!supplierName) {
    throw new Error('Supplier name is required.');
  }

  if (!receiptNumber) {
    throw new Error('Receipt number is required.');
  }

  const tx = db.transaction(() => {
    // 1. Save Header
    db.prepare(
      `
            INSERT INTO purchases (
                id, company_name, date, supplier_tin, supplier_name, receipt_number, address,
                gross_amount, net_of_vat, input_vat, output_vat, is_vat_exempt, expense_category, remarks,
                created_at, updated_at
            )
            VALUES (
                @id, @company_name, @date, @supplier_tin, @supplier_name, @receipt_number, @address,
                @gross_amount, @net_of_vat, @input_vat, @output_vat, @is_vat_exempt, @expense_category, @remarks,
                @created_at, @updated_at
            )
            ON CONFLICT(id) DO UPDATE SET
                company_name = excluded.company_name,
                date = excluded.date,
                supplier_tin = excluded.supplier_tin,
                supplier_name = excluded.supplier_name,
                receipt_number = excluded.receipt_number,
                address = excluded.address,
                gross_amount = excluded.gross_amount,
                net_of_vat = excluded.net_of_vat,
                input_vat = excluded.input_vat,
                output_vat = excluded.output_vat,
                is_vat_exempt = excluded.is_vat_exempt,
                expense_category = excluded.expense_category,
                remarks = excluded.remarks,
                updated_at = excluded.updated_at
            `
    ).run({
      id,
      company_name: companyName,
      date,
      supplier_tin: supplierTin,
      supplier_name: supplierName,
      receipt_number: receiptNumber,
      address,
      gross_amount: vat.grossAmount,
      net_of_vat: vat.netOfVat,
      input_vat: vat.inputVat,
      output_vat: vat.outputVat,
      is_vat_exempt: isVatExempt ? 1 : 0,
      expense_category: expenseCategory,
      remarks,
      created_at: stamp,
      updated_at: stamp
    });

    // 2. Clear previous items and inventory impacts if this is an update
    // Note: For now we don't have a full revertPurchaseInventory but we should at least clear items
    db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(id);
    // We also want to delete movements to avoid duplicates if re-saving
    db.prepare("DELETE FROM inventory_movements WHERE reference_type = 'PURCHASE' AND reference_id = ?").run(id);

    db.prepare("DELETE FROM batches WHERE batch_number = ?").run(`PURCHASE-${id}`);
    if (receiptNumber) {
      db.prepare("DELETE FROM batches WHERE batch_number = ?").run(`PURCHASE-${receiptNumber}`);
    }

    // 3. Process items
    if (expenseCategory === 'Materials & Supplies' && Array.isArray(payload.items)) {
      const insertItem = db.prepare(`
                INSERT INTO purchase_items (
                    id, purchase_id, product_id, qty, unit, unit_cost, srp, gross_amount, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

      for (const item of payload.items) {
        const productId = cleanString(item.product_id);
        const qty = roundMoney(item.quantity);
        const unitCost = roundMoney(item.unit_cost);
        const srp = roundMoney(item.srp);
        const itemGross = roundMoney(item.gross_amount);

        if (productId && qty > 0) {
          // Save to purchase_items
          insertItem.run(createId(), id, productId, qty, cleanString(item.unit) || 'pc', unitCost, srp, itemGross, stamp);

          // Create batch for inventory
          createBatch(db, {
            productId,
            batchNumber: `PURCHASE-${id}`,
            date,
            unitCost,
            srp,
            remainingQty: qty,
            unit: cleanString(item.unit) || 'pc'
          });

          // Update product's latest cost/srp
          db.prepare(`
                        UPDATE products 
                        SET cost = ?, srp = ?, updated_at = ?
                        WHERE id = ?
                    `).run(unitCost, srp, stamp, productId);

          // Record movement
          db.prepare(`
                        INSERT INTO inventory_movements (
                            id, product_id, reference_type, reference_id, date, movement_type,
                            qty_in, qty_out, note, created_at
                        )
                        VALUES (?, ?, 'PURCHASE', ?, ?, 'IN', ?, 0, ?, ?)
                    `).run(
            createId(), productId, id, date, qty,
            `Purchased ${qty} from ${supplierName} (Receipt: ${receiptNumber})`, stamp
          );
        }
      }
    }
  });
  tx();

  return getPurchaseById(db, id);
}

function deletePurchase(db, id) {
  const purchaseId = cleanString(id);
  if (!purchaseId) {
    throw new Error('Purchase id is required.');
  }

  const purchase = db.prepare('SELECT receipt_number FROM purchases WHERE id = ?').get(purchaseId);
  if (!purchase) return true;

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM batches WHERE batch_number = ?").run(`PURCHASE-${purchaseId}`);
    if (purchase.receipt_number) {
      db.prepare("DELETE FROM batches WHERE batch_number = ?").run(`PURCHASE-${purchase.receipt_number}`);
    }

    db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(purchaseId);
    db.prepare("DELETE FROM inventory_movements WHERE reference_type = 'PURCHASE' AND reference_id = ?").run(purchaseId);
    db.prepare('DELETE FROM purchases WHERE id = ?').run(purchaseId);
  });

  tx();
  return true;
}

function bulkDeletePurchases(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return false;
  const tx = db.transaction(() => {
    for (const id of ids) {
      deletePurchase(db, id);
    }
  });
  tx();
  return true;
}

function getPurchaseById(db, id) {
  const row = db.prepare(`
    SELECT 
      p.*,
      json_group_array(
        json_object(
          'id', pi.id,
          'productId', pi.product_id,
          'productCode', pr.code,
          'productName', pr.name,
          'qty', pi.qty,
          'unit', pi.unit,
          'unitCost', pi.unit_cost,
          'srp', pi.srp,
          'grossAmount', pi.gross_amount
        )
      ) AS items_json
    FROM purchases p
    LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
    LEFT JOIN products pr ON pr.id = pi.product_id
    WHERE p.id = ?
    GROUP BY p.id
  `).get(cleanString(id));

  return row ? serializePurchase(row) : null;
}

function getSaleById(db, id) {
  const header = db
    .prepare(
      `
        SELECT
          s.*,
          c.name AS customer_name,
          c.contact_number AS customer_contact,
          c.address AS customer_address,
          c.customer_username AS customer_username,
          c.tin AS customer_tin
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.id = ?
      `
    )
    .get(cleanString(id));

  if (!header) {
    return null;
  }

  const items = db
    .prepare(
      `
        SELECT
          si.*,
          p.code AS product_code,
          p.name AS product_name,
          p.category AS product_category,
          p.unit AS product_unit,
          p.is_vat_exempt AS product_is_vat_exempt
        FROM sale_items si
        LEFT JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ?
        ORDER BY si.created_at ASC
      `
    )
    .all(cleanString(id))
    .map(serializeSaleItem);

  return {
    ...serializeSaleSummary({
      ...header,
      item_count: items.length
    }),
    customerAddress: header.customer_address,
    customerUsername: header.customer_username,
    customerTin: header.customer_tin,
    items
  };
}

function listSales(db, { search = '', status = '', channel = '', companyName = '', fromDate = '', toDate = '' } = {}) {
  const conditions = [];
  const params = [];
  const query = cleanString(search).toLowerCase();

  if (query) {
    const like = `%${query}%`;
    conditions.push(
      `(lower(s.si_number) LIKE ? OR lower(s.po_number) LIKE ? OR lower(s.remarks) LIKE ? OR lower(c.name) LIKE ? OR lower(s.channel) LIKE ? OR lower(s.company_name) LIKE ?)`
    );
    params.push(like, like, like, like, like, like);
  }

  if (cleanString(status) && cleanString(status) !== 'all') {
    conditions.push('s.status = ?');
    params.push(cleanString(status));
  }

  if (cleanString(channel) && cleanString(channel) !== 'all') {
    conditions.push('s.channel = ?');
    params.push(cleanString(channel));
  }

  if (cleanString(companyName) && cleanString(companyName) !== 'all') {
    conditions.push('s.company_name = ?');
    params.push(cleanString(companyName));
  }

  if (cleanString(fromDate)) {
    conditions.push('s.date >= ?');
    params.push(cleanString(fromDate));
  }

  if (cleanString(toDate)) {
    conditions.push('s.date <= ?');
    params.push(cleanString(toDate));
  }

  let sql = `
    SELECT
      s.*,
      c.name AS customer_name,
      c.contact_number AS customer_contact,
      COUNT(si.id) AS item_count,
      json_group_array(
        json_object(
          'name', p.name,
          'productId', si.product_id,
          'qty', si.qty,
          'unit', si.unit,
          'price', si.unit_price,
          'photo', p.photo_path
        )
      ) AS items_json
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN products p ON p.id = si.product_id
  `;

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += `
    GROUP BY s.id
    ORDER BY s.receipt_number DESC, s.date DESC, s.created_at DESC
  `;

  return db.prepare(sql).all(...params).map(serializeSaleSummary);
}

function createSale(db, payload = {}) {
  const stamp = nowIso();
  const saleId = cleanString(payload.id) || createId();
  const saleDate = cleanString(payload.date) || todayIsoDate();
  const status = asEnum(payload.status, saleStatuses, 'PAID');
  const channel = cleanString(payload.channel) || salesChannels[1];
  const companyName = cleanString(payload.company_name ?? payload.companyName) || companyNames[0];
  const customerId = cleanString(payload.customer_id ?? payload.customerId) || null;
  const siNumber = cleanString(payload.si_number ?? payload.siNumber);
  const poNumber = cleanString(payload.po_number ?? payload.poNumber);
  const invoiceType = cleanString(payload.invoice_type ?? payload.invoiceType) || 'SI';
  const remarks = cleanString(payload.remarks);
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems.filter((item) => cleanString(item?.product_id ?? item?.productId));

  if (items.length === 0) {
    throw new Error('At least one sale item is required.');
  }

  const insertSale = db.prepare(
    `
      INSERT OR REPLACE INTO sales (
        id, company_name, date, si_number, receipt_number, customer_id, channel, status, po_number, invoice_type,
        remarks, gross_amount, input_vat, output_vat, vat_exempt_amount, profit,
        created_at, updated_at
      )
      VALUES (
        @id, @company_name, @date, @si_number, @receipt_number, @customer_id, @channel, @status, @po_number, @invoice_type,
        @remarks, 0, 0, 0, 0, 0, @created_at, @updated_at
      )
    `
  );

  const updateSaleTotals = db.prepare(
    `
      UPDATE sales
      SET gross_amount = ?,
          input_vat = ?,
          output_vat = ?,
          vat_exempt_amount = ?,
          profit = ?,
          updated_at = ?
      WHERE id = ?
    `
  );

  const insertSaleItem = db.prepare(
    `
      INSERT INTO sale_items (
        id, sale_id, product_id, qty, unit, unit_price, gross_amount, input_vat,
        output_vat, vat_exempt_amount, costing, total_cost, profit, created_at
      )
      VALUES (
        @id, @sale_id, @product_id, @qty, @unit, @unit_price, @gross_amount, @input_vat,
        @output_vat, @vat_exempt_amount, @costing, @total_cost, @profit, @created_at
      )
    `
  );

  const updateProductStock = db.prepare(
    `
      UPDATE products
      SET stock_qty = stock_qty - ?,
          updated_at = ?
      WHERE id = ?
    `
  );

  const insertMovement = db.prepare(
    `
      INSERT INTO inventory_movements (
        id, product_id, reference_type, reference_id, date, movement_type,
        qty_in, qty_out, note, created_at
      )
      VALUES (
        @id, @product_id, @reference_type, @reference_id, @date, @movement_type,
        @qty_in, @qty_out, @note, @created_at
      )
    `
  );

  const tx = db.transaction(() => {
    // If updating an existing sale, revert previous inventory impacts first.
    revertSaleInventory(db, saleId);

    const existingSale = db.prepare('SELECT receipt_number FROM sales WHERE id = ?').get(saleId);
    let receiptNumber = existingSale?.receipt_number;

    if (!receiptNumber) {
      const maxRow = db.prepare('SELECT MAX(CAST(receipt_number AS INTEGER)) as max_rn FROM sales').get();
      receiptNumber = (Number(maxRow?.max_rn) || 0) + 1;
    }

    insertSale.run({
      id: saleId,
      company_name: companyName,
      date: saleDate,
      si_number: siNumber,
      receipt_number: receiptNumber,
      customer_id: customerId,
      channel,
      status,
      po_number: poNumber,
      invoice_type: invoiceType,
      remarks,
      created_at: stamp,
      updated_at: stamp
    });

    let grossAmount = 0;
    let inputVat = 0;
    let outputVat = 0;
    let vatExemptAmount = 0;
    let profit = 0;
    const { vatRate } = getTaxSettings(db);

    for (const rawItem of items) {
      const productId = cleanString(rawItem.product_id ?? rawItem.productId);
      const product = db.prepare(`
        SELECT p.*,
          (SELECT b.srp FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC LIMIT 1) AS current_srp,
          (SELECT b.unit_cost FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC LIMIT 1) AS current_cost_basis,
          (SELECT b.remaining_qty FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC LIMIT 1) AS current_batch_stock
        FROM products p WHERE p.id = ?
      `).get(productId);

      if (!product) {
        throw new Error(`Sale item references an unknown product: ${productId}`);
      }

      const qty = status === 'FAILED' || status === 'Return' ? 0 : roundMoney(rawItem.qty);
      if (qty <= 0 && status !== 'FAILED' && status !== 'Return') {
        throw new Error(`Quantity for ${product.name} must be greater than zero.`);
      }
      const unit = cleanString(rawItem.unit) || product.unit || 'pc';
      const pricing = resolveSalePricing(product, rawItem, status);
      const isVatExempt = asBoolean(rawItem.is_vat_exempt ?? rawItem.isVatExempt, Boolean(product.is_vat_exempt));
      const line = calculateSaleLine({
        qty,
        unitPrice: pricing.unitPrice,
        unitCost: pricing.unitCost,
        isVatExempt,
        status,
        vatRate,
        grossOverride: rawItem.gross_override ?? rawItem.grossOverride
      });

      let finalLine = line;

      if (status !== 'FAILED' && status !== 'Return') {
        const availableStock = getProductStock(db, product.id);
        if (availableStock < pricing.stockQtyOut) {
          throw new Error(`STOCK_ERROR: Lack or out of stock for ${product.name}. Available: ${availableStock}.`);
        }

        const consumed = consumeStock(db, product.id, pricing.stockQtyOut);

        if (consumed.length > 0) {
          const totalBatchCost = consumed.reduce((acc, c) => acc + (c.consumedQty * c.unitCost), 0);
          const weightedUnitCost = totalBatchCost / pricing.stockQtyOut;

          const manualUnitCost = rawItem.unit_cost ?? rawItem.unitCost;
          const hasManualCost = manualUnitCost !== undefined && manualUnitCost !== null && manualUnitCost !== '';

          let finalUnitPrice = pricing.unitPrice;
          const manualUnitPrice = rawItem.unit_price ?? rawItem.unitPrice;
          const hasManualPrice = manualUnitPrice !== undefined && manualUnitPrice !== null && manualUnitPrice !== '';

          if (!hasManualPrice) {
            const totalBatchSrp = consumed.reduce((acc, c) => acc + (c.consumedQty * c.unitSrp), 0);
            const weightedBaseSrp = totalBatchSrp / pricing.stockQtyOut;

            const requestedUnit = cleanString(rawItem.unit) || product.unit || 'pc';
            const isKgSale = isKilogramUnit(requestedUnit);
            const sackWeightKg = roundMoney(product.sack_weight_kg);

            if (isKgSale && sackWeightKg > 0) {
              finalUnitPrice = roundMoney(weightedBaseSrp / sackWeightKg);
            } else {
              finalUnitPrice = roundMoney(weightedBaseSrp);
            }
          }

          finalLine = calculateSaleLine({
            qty,
            unitPrice: finalUnitPrice,
            unitCost: hasManualCost ? roundMoney(manualUnitCost) : weightedUnitCost,
            isVatExempt,
            status,
            vatRate,
            grossOverride: rawItem.gross_override ?? rawItem.grossOverride
          });
        }

        insertMovement.run({
          id: createId(),
          product_id: product.id,
          reference_type: 'SALE',
          reference_id: saleId,
          date: saleDate,
          movement_type: 'SALES',
          qty_in: 0,
          qty_out: pricing.stockQtyOut,
          note: siNumber || `Sale ${saleId}`,
          created_at: stamp
        });
      }

      insertSaleItem.run({
        id: createId(),
        sale_id: saleId,
        product_id: product.id,
        qty: finalLine.qty,
        unit,
        unit_price: finalLine.unitPrice,
        gross_amount: finalLine.grossAmount,
        input_vat: finalLine.inputVat,
        output_vat: finalLine.outputVat,
        vat_exempt_amount: finalLine.vatExemptAmount,
        costing: finalLine.costing,
        total_cost: finalLine.totalCost,
        profit: finalLine.profit,
        created_at: stamp
      });

      grossAmount += finalLine.grossAmount;
      inputVat += finalLine.inputVat;
      outputVat += finalLine.outputVat;
      vatExemptAmount += finalLine.vatExemptAmount;
      profit += finalLine.profit;
    }

    updateSaleTotals.run(
      roundMoney(grossAmount),
      roundMoney(inputVat),
      roundMoney(outputVat),
      roundMoney(vatExemptAmount),
      roundMoney(profit),
      nowIso(),
      saleId
    );
  });

  tx();

  return getSaleById(db, saleId);
}

/**
 * Reverts the inventory impact of a sale by restoring stock 
 * (via a restoration batch) and deleting related items/movements.
 * This is used before updating or deleting a sale.
 */
function revertSaleInventory(db, saleId) {
  const sale = db.prepare('SELECT id, status FROM sales WHERE id = ?').get(saleId);
  if (!sale) return;

  const saleItems = db.prepare('SELECT product_id, qty, unit FROM sale_items WHERE sale_id = ?').all(saleId);

  if (sale.status !== 'FAILED' && sale.status !== 'Return') {
    for (const item of saleItems) {
      const productId = cleanString(item.product_id);
      if (!productId) continue;

      const product = db.prepare('SELECT id, sack_weight_kg, cost, labor_cost, packaging_cost FROM products WHERE id = ?').get(productId);
      if (!product) continue;

      const unit = cleanString(item.unit);
      const qty = roundMoney(item.qty);
      const stockQtyToRestore = isKilogramUnit(unit) && roundMoney(product.sack_weight_kg) > 0
        ? roundMoney(qty / roundMoney(product.sack_weight_kg))
        : qty;

      if (stockQtyToRestore > 0) {
        const existingBatch = db.prepare('SELECT id FROM batches WHERE product_id = ? ORDER BY date ASC, created_at ASC LIMIT 1').get(productId);

        if (existingBatch) {
          db.prepare('UPDATE batches SET remaining_qty = remaining_qty + ?, updated_at = ? WHERE id = ?')
            .run(stockQtyToRestore, nowIso(), existingBatch.id);
        } else {
          const unitCost = calculateAverageCost(product.cost, product.labor_cost, product.packaging_cost);
          createBatch(db, {
            productId,
            batchNumber: `RESTORE-${saleId}`,
            date: todayIsoDate(),
            unitCost,
            remainingQty: stockQtyToRestore,
            unit: 'pc'
          });
        }
      }
    }
  }

  db.prepare("DELETE FROM inventory_movements WHERE reference_type = 'SALE' AND reference_id = ?").run(saleId);
  db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(saleId);
}

function normalizeUnit(value) {
  return cleanString(value).toLowerCase();
}

function isKilogramUnit(value) {
  return ['kg', 'klg', 'kilo', 'kilogram', 'kilograms'].includes(normalizeUnit(value));
}

function resolveSalePricing(product, rawItem, status) {
  const requestedUnit = cleanString(rawItem.unit) || product.unit || 'pc';
  const isKgSale = isKilogramUnit(requestedUnit);
  const sackWeightKg = roundMoney(product.sack_weight_kg);
  const laborCost = roundMoney(product.labor_cost ?? product.laborCost);
  const packagingCost = roundMoney(product.packaging_cost ?? product.packagingCost);
  const sackCost = calculateAverageCost(product.oldestCostBasis ?? product.cost, laborCost, packagingCost);
  const baseSrp = roundMoney(product.current_srp ?? product.srp);
  const derivedKgPrice = sackWeightKg > 0 ? roundMoney(baseSrp / sackWeightKg) : 0;
  const pricePerKg = roundMoney(product.price_per_kg || derivedKgPrice);
  const unitPrice = status === 'FAILED' || status === 'Return' || status === 'Lost'
    ? 0
    : roundMoney(rawItem.unit_price ?? rawItem.unitPrice ?? (isKgSale ? pricePerKg : baseSrp));
  const unitCost = roundMoney(rawItem.unit_cost ?? rawItem.unitCost ?? (isKgSale && sackWeightKg > 0 ? roundMoney(sackCost / sackWeightKg) : sackCost));
  const qty = status === 'FAILED' || status === 'Return' ? 0 : roundMoney(rawItem.qty);
  const stockQtyOut = isKgSale && sackWeightKg > 0 ? roundMoney(qty / sackWeightKg) : qty;

  return {
    unitPrice,
    unitCost,
    stockQtyOut
  };
}

function deleteSale(db, id) {
  const saleId = cleanString(id);
  if (!saleId) {
    throw new Error('Sale id is required.');
  }

  const sale = db.prepare('SELECT id, status FROM sales WHERE id = ?').get(saleId);
  if (!sale) {
    return true;
  }

  const saleItems = db.prepare('SELECT product_id, qty, unit FROM sale_items WHERE sale_id = ?').all(saleId);
  const deleteMovements = db.prepare(
    "DELETE FROM inventory_movements WHERE reference_type = 'SALE' AND reference_id = ?"
  );
  const deleteSaleRecord = db.prepare('DELETE FROM sales WHERE id = ?');

  const tx = db.transaction(() => {
    revertSaleInventory(db, saleId);
    db.prepare('DELETE FROM sales WHERE id = ?').run(saleId);
  });

  tx();
  return true;
}

function bulkDeleteSales(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return false;
  const tx = db.transaction(() => {
    for (const id of ids) {
      deleteSale(db, id);
    }
  });
  tx();
  return true;
}

async function exportFinancialStatementToExcel(db, filePath, filters = {}) {
  const data = getFinancialStatement(db, filters);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Financial Statement');

  const startLabel = formatDateShort(data.period.start);
  const endLabel = formatDateShort(data.period.end);
  const titlePeriod = filters.fromDate && filters.toDate ? `${startLabel} - ${endLabel}` : `As of ${endLabel}`;

  // Styles
  const boldFont = { bold: true, name: 'Arial', size: 10 };
  const titleFont = { bold: true, name: 'Arial', size: 12 };
  const greenFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3E6' } };
  const currencyFormat = '_-₱* #,##0.00_-;-₱* #,##0.00_-;_-₱* "-"??_-;_-@_-';

  sheet.getColumn(1).width = 45;
  sheet.getColumn(2).width = 25;

  // Header
  sheet.addRow([filters.companyName || companyNames[0]]);
  sheet.addRow([titlePeriod]);
  sheet.addRow([]);
  sheet.getRow(1).font = titleFont;
  sheet.getRow(2).font = boldFont;

  const addLine = (label, value = null, isBold = false, isGreen = false) => {
    const row = sheet.addRow([label, value]);
    if (isBold) row.font = boldFont;
    if (isGreen) row.eachCell(c => c.fill = greenFill);
    if (value !== null) row.getCell(2).numFmt = currencyFormat;
    return row;
  };

  addLine('Sales', data.totalSales, true, true);
  addLine('Less: Cost of Goods Sold', data.totalCogs, false, true);
  sheet.addRow([]);
  addLine('Gross Profit', data.grossProfit, true, true);
  sheet.addRow([]);

  addLine('Less: Operating Expenses', null, true, true);
  expenseCategories.forEach(cat => {
    if (cat === 'Other / Gain (Loss) on Foreign Exchange' || cat === 'Materials & Supplies') return;
    addLine(cat, data.expenses[cat] || 0, false, true);
  });

  addLine('Total', data.totalExpenses, true, true);
  sheet.addRow([]);

  const netOperatingIncome = roundMoney(data.grossProfit - data.totalExpenses);
  addLine('NET operating income', netOperatingIncome, true, true);

  const fxAmount = data.expenses['Other / Gain (Loss) on Foreign Exchange'] || 0;
  if (fxAmount < 0) {
    addLine('Add: Gain Foreign currency transaction', Math.abs(fxAmount), false, true);
  } else {
    addLine('Less: Loss on Foreign currency transaction', fxAmount, false, true);
  }

  const netIncomeBeforeTax = roundMoney(netOperatingIncome - fxAmount);
  addLine('Net Income Before Tax', netIncomeBeforeTax, true, true);
  addLine('Add previous income:', 0, false, true);
  sheet.addRow([]);

  addLine('Total Net Income', netIncomeBeforeTax, true, true);
  const taxRate = data.taxSettings.incomeTaxRate;
  const taxExpense = roundMoney(netIncomeBeforeTax > 0 ? netIncomeBeforeTax * taxRate : 0);
  addLine(`Less: Income Tax Expense (${roundMoney(taxRate * 100)}%)`, taxExpense, false, true);
  addLine('Net Income', roundMoney(netIncomeBeforeTax - taxExpense), true, true);

  sheet.addRow([]);
  const taxRow = addLine('Tax Computation:', null, true, true);
  taxRow.getCell(1).font = { ...boldFont, color: { argb: 'FFFF0000' } };

  addLine('Net Income Before Tax', netIncomeBeforeTax, false, true);
  addLine(`Income Tax Expense (${roundMoney(taxRate * 100)}%)`, taxExpense, false, true);
  sheet.addRow([]);
  addLine('Less: Previous Payments', null, false, true);
  addLine('Previous payment', 0, false, true);
  addLine('2307 previous', 0, false, true);
  addLine('2307 this quarter', 0, false, true);

  sheet.addRow([]);
  const dueRow = addLine('Tax Due', taxExpense, true, true);
  dueRow.getCell(1).font = { ...boldFont, color: { argb: 'FFFF0000' } };
  dueRow.getCell(2).font = { ...boldFont, color: { argb: 'FFFF0000' } };

  await workbook.xlsx.writeFile(filePath);
  return true;
}

async function exportFullReportToExcel(db, filePath) {
  const workbook = new ExcelJS.Workbook();

  // 0. Add Financial Statement Sheet
  const fsData = getFinancialStatement(db);
  const fsSheet = workbook.addWorksheet('FINANCIAL STATEMENT');

  const boldFont = { bold: true, name: 'Arial', size: 10 };
  const titleFont = { bold: true, name: 'Arial', size: 12 };
  const greenFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3E6' } };
  const currencyFormat = '_-₱* #,##0.00_-;-₱* #,##0.00_-;_-₱* "-"??_-;_-@_-';

  fsSheet.getColumn(1).width = 45;
  fsSheet.getColumn(2).width = 25;

  fsSheet.addRow(['FINANCIAL STATEMENT']);
  fsSheet.addRow([`As of ${new Date().toLocaleDateString()}`]);
  fsSheet.addRow([]);
  fsSheet.getRow(1).font = titleFont;
  fsSheet.getRow(2).font = boldFont;

  const addFsLine = (label, value = null, isBold = false, isGreen = false) => {
    const row = fsSheet.addRow([label, value]);
    if (isBold) row.font = boldFont;
    if (isGreen) row.eachCell(c => c.fill = greenFill);
    if (value !== null) row.getCell(2).numFmt = currencyFormat;
    return row;
  };

  addFsLine('Sales', fsData.totalSales, true, true);
  addFsLine('Less: Cost of Goods Sold', fsData.totalCogs, false, true);
  fsSheet.addRow([]);
  addFsLine('Gross Profit', fsData.grossProfit, true, true);
  fsSheet.addRow([]);

  addFsLine('Less: Operating Expenses', null, true, true);
  expenseCategories.forEach(cat => {
    if (cat === 'Other / Gain (Loss) on Foreign Exchange' || cat === 'Materials & Supplies') return;
    addFsLine(cat, fsData.expenses[cat] || 0, false, true);
  });

  addFsLine('Total', fsData.totalExpenses, true, true);
  fsSheet.addRow([]);

  const netOperatingIncome = roundMoney(fsData.grossProfit - fsData.totalExpenses);
  addFsLine('NET operating income', netOperatingIncome, true, true);

  const fxAmount = fsData.expenses['Other / Gain (Loss) on Foreign Exchange'] || 0;
  if (fxAmount < 0) {
    addFsLine('Add: Gain Foreign currency transaction', Math.abs(fxAmount), false, true);
  } else {
    addFsLine('Less: Loss on Foreign currency transaction', fxAmount, false, true);
  }

  const netIncomeBeforeTax = roundMoney(netOperatingIncome - fxAmount);
  addFsLine('Net Income Before Tax', netIncomeBeforeTax, true, true);
  addFsLine('Net Income', roundMoney(netIncomeBeforeTax), true, true);

  // 1. Query Sales Data
  const query = `
    SELECT 
      s.date,
      s.receipt_number,
      c.tin,
      s.si_number,
      c.name as customer_name,
      c.address,
      p.name as product_name,
      si.qty,
      si.unit,
      si.unit_price,
      si.gross_amount,
      si.input_vat,
      si.output_vat,
      si.vat_exempt_amount,
      si.costing,
      si.total_cost,
      si.profit,
      s.status,
      s.remarks,
      s.po_number,
      c.contact_number,
      s.channel,
      c.customer_username,
      p.photo_path
    FROM sales s
    JOIN sale_items si ON s.id = si.sale_id
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN products p ON si.product_id = p.id
    ORDER BY s.receipt_number DESC, s.date DESC, s.created_at DESC
  `;

  const allRows = db.prepare(query).all();

  // 1. Group Sales by month
  const salesGroups = {};
  for (const row of allRows) {
    const date = new Date(row.date);
    const monthName = date.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
    if (!salesGroups[monthName]) salesGroups[monthName] = [];
    salesGroups[monthName].push(row);
  }

  // 2. Query and Group Purchases by month
  const purchaseQuery = `
    SELECT date, company_name, supplier_tin, supplier_name, receipt_number, address, expense_category, gross_amount, net_of_vat, input_vat, remarks
    FROM purchases
    ORDER BY date DESC
  `;
  const allPurchases = db.prepare(purchaseQuery).all();
  const purchaseGroups = {};
  for (const row of allPurchases) {
    const date = new Date(row.date);
    const monthName = date.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
    if (!purchaseGroups[monthName]) purchaseGroups[monthName] = [];
    purchaseGroups[monthName].push(row);
  }

  // 3. Define Columns
  const salesColumnDef = [
    { header: 'DATE', key: 'date', width: 15 },
    { header: 'RECEIPT #', key: 'receipt', width: 15 },

    { header: 'TAX IDENTIFICATION NUMBER', key: 'tin', width: 20 },
    { header: 'SI NO.', key: 'si', width: 15 },
    { header: 'CUSTOMER', key: 'customer', width: 20 },
    { header: 'ADDRESS', key: 'address', width: 30 },
    { header: 'PRODUCT', key: 'product', width: 20 },
    { header: 'QTY', key: 'qty', width: 10 },
    { header: 'UNIT', key: 'unit', width: 10 },
    { header: 'UNIT PRICE', key: 'unit_price', width: 15 },
    { header: 'GROSS AMOUNT', key: 'gross', width: 15 },
    { header: 'INPUT VAT', key: 'input_vat', width: 15 },
    { header: 'OUTPUT VAT', key: 'output_vat', width: 15 },
    { header: 'VAT EXEMPT SALES ', key: 'vat_exempt', width: 20 },
    { header: 'COSTING', key: 'costing', width: 15 },
    { header: 'TOTAL COST', key: 'total_cost', width: 15 },
    { header: 'PROFIT', key: 'profit', width: 15 },
    { header: 'STATUS', key: 'status', width: 15 },
    { header: 'REMARKS', key: 'remarks', width: 20 },
    { header: 'PO #', key: 'po', width: 15 },
    { header: 'CONTACT #', key: 'contact', width: 15 },
    { header: 'INVOICE', key: 'invoice', width: 15 },
    { header: 'USERNAME', key: 'username', width: 15 },
    { header: 'PICTURE', key: 'picture', width: 20 }
  ];

  const purchaseColumnDef = [
    { header: 'DATE', key: 'date', width: 15 },
    { header: 'COMPANY', key: 'company', width: 20 },
    { header: 'TIN', key: 'tin', width: 20 },
    { header: 'SUPPLIER', key: 'supplier', width: 20 },
    { header: 'ADDRESS', key: 'address', width: 30 },
    { header: 'RECEIPT #', key: 'receipt', width: 15 },
    { header: 'CATEGORY', key: 'category', width: 20 },
    { header: 'GROSS AMOUNT', key: 'gross', width: 15 },
    { header: 'NET OF VAT', key: 'net', width: 15 },
    { header: 'INPUT VAT', key: 'vat', width: 15 },
    { header: 'IS VAT EXEMPT', key: 'is_vat_exempt', width: 15 },
    { header: 'REMARKS', key: 'remarks', width: 20 }
  ];

  // 4. Create Sales and Purchase Sheets
  const allMonths = new Set([...Object.keys(salesGroups), ...Object.keys(purchaseGroups)]);

  if (allMonths.size === 0) {
    workbook.addWorksheet('SALES').columns = salesColumnDef;
  } else {
    const sortedMonths = [...allMonths].sort((a, b) => new Date(b) - new Date(a));
    for (const monthName of sortedMonths) {
      // Sales Sheet
      const salesRows = salesGroups[monthName] || [];
      const salesSheet = workbook.addWorksheet(`SALES ${monthName}`);
      salesSheet.columns = salesColumnDef;

      let totalSales = 0;
      let totalCost = 0;
      let totalProfit = 0;

      for (let i = 0; i < salesRows.length; i++) {
        const row = salesRows[i];
        totalSales += row.gross_amount;
        totalCost += row.total_cost;
        totalProfit += row.profit;

        const excelRow = salesSheet.addRow({
          date: row.date,
          receipt: row.receipt_number ? String(row.receipt_number).padStart(4, '0') : '-',
          tin: row.tin,
          si: row.si_number,
          customer: row.customer_name,
          address: row.address,
          product: row.product_name,
          qty: row.qty,
          unit: row.unit,
          unit_price: row.unit_price,
          gross: row.gross_amount,
          input_vat: row.gross_amount - row.output_vat,
          output_vat: row.output_vat,
          vat_exempt: row.vat_exempt_amount,
          costing: row.costing,
          total_cost: row.total_cost,
          profit: row.profit,
          status: row.status,
          remarks: row.remarks,
          po: row.po_number,
          contact: row.contact_number,
          invoice: row.channel,
          username: row.customer_username
        });

        if (row.photo_path && fs.existsSync(row.photo_path)) {
          try {
            const imageId = workbook.addImage({
              filename: row.photo_path,
              extension: path.extname(row.photo_path).slice(1).toLowerCase() || 'png'
            });
            salesSheet.addImage(imageId, {
              tl: { col: 23, row: i + 1 },
              ext: { width: 50, height: 50 }
            });
            excelRow.height = 40;
          } catch (e) { }
        }
      }

      // Add Summary Block to Sales Sheet
      salesSheet.addRow([]);
      const pRows = purchaseGroups[monthName] || [];
      const matSupp = pRows.filter(r => r.expense_category === 'Materials & Supplies').reduce((sum, r) => sum + r.gross_amount, 0);
      const otherExp = pRows.filter(r => r.expense_category !== 'Materials & Supplies').reduce((sum, r) => sum + r.gross_amount, 0);

      const summaryStartRow = salesRows.length + 3;
      salesSheet.getCell(`A${summaryStartRow}`).value = 'SALES';
      salesSheet.getCell(`B${summaryStartRow}`).value = totalSales;
      salesSheet.getCell(`A${summaryStartRow + 1}`).value = 'TOTAL COST';
      salesSheet.getCell(`B${summaryStartRow + 1}`).value = totalCost;
      salesSheet.getCell(`A${summaryStartRow + 2}`).value = 'PROFIT';
      salesSheet.getCell(`B${summaryStartRow + 2}`).value = totalProfit;
      salesSheet.getCell(`A${summaryStartRow + 3}`).value = 'CHECKING PROFIT';
      salesSheet.getCell(`B${summaryStartRow + 3}`).value = totalProfit;
      salesSheet.getCell(`A${summaryStartRow + 4}`).value = 'MAT & SUPP';
      salesSheet.getCell(`B${summaryStartRow + 4}`).value = matSupp;
      salesSheet.getCell(`A${summaryStartRow + 5}`).value = 'OTHE EXPENSES';
      salesSheet.getCell(`B${summaryStartRow + 5}`).value = otherExp;
      salesSheet.getCell(`A${summaryStartRow + 6}`).value = 'NET';
      salesSheet.getCell(`B${summaryStartRow + 6}`).value = totalProfit - matSupp - otherExp;

      // Formatting for summary labels
      for (let j = 0; j < 7; j++) {
        salesSheet.getCell(`A${summaryStartRow + j}`).font = { bold: true };
        salesSheet.getCell(`B${summaryStartRow + j}`).numFmt = '#,##0.00';
      }

      // Purchase Sheet
      const purchaseSheet = workbook.addWorksheet(`PURCHASES ${monthName}`);
      purchaseSheet.columns = purchaseColumnDef;
      for (const row of pRows) {
        purchaseSheet.addRow({
          date: row.date,
          company: row.company_name,
          tin: row.supplier_tin,
          supplier: row.supplier_name,
          address: row.address,
          receipt: row.receipt_number,
          category: row.expense_category,
          gross: row.gross_amount,
          net: row.net_of_vat,
          vat: row.input_vat,
          is_vat_exempt: row.is_vat_exempt ? 'YES' : 'NO',
          remarks: row.remarks
        });
      }
    }
  }

  // 5. Create Inventory Sheet
  const inventorySheet = workbook.addWorksheet(`INVENTORY ${new Date().getFullYear()}`);
  inventorySheet.columns = [
    { header: 'CODE', key: 'code', width: 15 },
    { header: 'NAME', key: 'name', width: 25 },
    { header: 'CATEGORY', key: 'category', width: 20 },
    { header: 'UNIT', key: 'unit', width: 10 },
    { header: 'COST', key: 'cost', width: 12 },
    { header: 'SRP', key: 'srp', width: 12 },
    { header: 'STOCK', key: 'stock', width: 12 },
    { header: 'TOTAL VALUE', key: 'value', width: 15 },
    { header: 'REORDER POINT', key: 'reorder', width: 15 },
    { header: 'SACK WEIGHT (KG)', key: 'sack_weight', width: 15 },
    { header: 'LABOR COST', key: 'labor', width: 15 },
    { header: 'PACKAGING COST', key: 'packaging', width: 15 },
    { header: 'PICTURE', key: 'picture', width: 20 }
  ];

  const products = db.prepare('SELECT id, code, name, category, unit, average_cost, srp, reorder_point, sack_weight_kg, labor_cost, packaging_cost, photo_path FROM products').all();
  for (const p of products) {
    const stock = getProductStock(db, p.id);
    const excelRow = inventorySheet.addRow({
      code: p.code,
      name: p.name,
      category: p.category,
      unit: p.unit,
      cost: p.average_cost,
      srp: p.srp,
      stock: stock,
      value: p.average_cost * stock,
      reorder: p.reorder_point,
      sack_weight: p.sack_weight_kg,
      labor: p.labor_cost,
      packaging: p.packaging_cost
    });

    if (p.photo_path && fs.existsSync(p.photo_path)) {
      try {
        const imageId = workbook.addImage({
          filename: p.photo_path,
          extension: path.extname(p.photo_path).slice(1).toLowerCase() || 'png'
        });
        inventorySheet.addImage(imageId, {
          tl: { col: 12, row: excelRow.number - 1 },
          ext: { width: 50, height: 50 }
        });
        excelRow.height = 40;
      } catch (e) { }
    }
  }

  // 6. Create Customers Sheet
  const customerSheet = workbook.addWorksheet('CUSTOMERS');
  customerSheet.columns = [
    { header: 'NAME', key: 'name', width: 30 },
    { header: 'ADDRESS', key: 'address', width: 40 },
    { header: 'ADDRESS 2', key: 'address2', width: 40 },
    { header: 'CONTACT #', key: 'contact', width: 20 },
    { header: 'TAX IDENTIFICATION NUMBER', key: 'tin', width: 25 },
    { header: 'USERNAME', key: 'username', width: 20 }
  ];

  const customers = db.prepare('SELECT name, address, address_2, contact_number, tin, customer_username FROM customers ORDER BY name ASC').all();
  customers.forEach(c => {
    customerSheet.addRow({
      name: c.name,
      address: c.address,
      address2: c.address_2,
      contact: c.contact_number,
      tin: c.tin,
      username: c.customer_username
    });
  });

  await workbook.xlsx.writeFile(filePath);
  return true;
}

async function exportSalesToExcel(db, filePath) {
  const workbook = new ExcelJS.Workbook();
  const salesSheet = workbook.addWorksheet('SALES');

  const salesColumnDef = [
    { header: 'DATE', key: 'date', width: 15 },
    { header: 'RECEIPT #', key: 'receipt', width: 15 },

    { header: 'TAX IDENTIFICATION NUMBER', key: 'tin', width: 20 },
    { header: 'SI NO.', key: 'si', width: 15 },
    { header: 'CUSTOMER', key: 'customer', width: 20 },
    { header: 'ADDRESS', key: 'address', width: 30 },
    { header: 'PRODUCT', key: 'product', width: 20 },
    { header: 'QTY', key: 'qty', width: 10 },
    { header: 'UNIT', key: 'unit', width: 10 },
    { header: 'UNIT PRICE', key: 'unit_price', width: 15 },
    { header: 'GROSS AMOUNT', key: 'gross', width: 15 },
    { header: 'INPUT VAT', key: 'input_vat', width: 15 },
    { header: 'OUTPUT VAT', key: 'output_vat', width: 15 },
    { header: 'VAT EXEMPT SALES ', key: 'vat_exempt', width: 20 },
    { header: 'COSTING', key: 'costing', width: 15 },
    { header: 'TOTAL COST', key: 'total_cost', width: 15 },
    { header: 'PROFIT', key: 'profit', width: 15 },
    { header: 'STATUS', key: 'status', width: 15 },
    { header: 'REMARKS', key: 'remarks', width: 20 },
    { header: 'PO #', key: 'po', width: 15 },
    { header: 'CONTACT #', key: 'contact', width: 15 },
    { header: 'INVOICE', key: 'invoice', width: 15 },
    { header: 'USERNAME', key: 'username', width: 15 }
  ];

  salesSheet.columns = salesColumnDef;

  const query = `
    SELECT 
      s.date, s.receipt_number, c.tin, s.si_number, c.name as customer_name, c.address, p.name as product_name,
      si.qty, si.unit, si.unit_price, si.gross_amount, si.input_vat, si.output_vat,
      si.vat_exempt_amount, si.costing, si.total_cost, si.profit, s.status, s.remarks, s.po_number,
      c.contact_number, s.channel, c.customer_username
    FROM sales s
    JOIN sale_items si ON s.id = si.sale_id
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN products p ON si.product_id = p.id
    ORDER BY s.receipt_number DESC, s.date DESC, s.created_at DESC
  `;

  const rows = db.prepare(query).all();
  rows.forEach(row => {
    salesSheet.addRow({
      date: row.date,
      receipt: row.receipt_number ? String(row.receipt_number).padStart(4, '0') : '-',
      tin: row.tin,
      si: row.si_number,
      customer: row.customer_name,
      address: row.address,
      product: row.product_name,
      qty: row.qty,
      unit: row.unit,
      unit_price: row.unit_price,
      gross: row.gross_amount,
      input_vat: row.gross_amount - row.output_vat,
      output_vat: row.output_vat,
      vat_exempt: row.vat_exempt_amount,
      costing: row.costing,
      total_cost: row.total_cost,
      profit: row.profit,
      status: row.status,
      remarks: row.remarks,
      po: row.po_number,
      contact: row.contact_number,
      invoice: row.channel,
      username: row.customer_username
    });
  });

  await workbook.xlsx.writeFile(filePath);
  return true;
}

async function exportProductsToExcel(db, filePath) {
  const workbook = new ExcelJS.Workbook();
  const inventorySheet = workbook.addWorksheet(`INVENTORY ${new Date().getFullYear()}`);
  inventorySheet.columns = [
    { header: 'CODE', key: 'code', width: 15 },
    { header: 'NAME', key: 'name', width: 25 },
    { header: 'CATEGORY', key: 'category', width: 20 },
    { header: 'UNIT', key: 'unit', width: 10 },
    { header: 'COST', key: 'cost', width: 12 },
    { header: 'SRP', key: 'srp', width: 12 },
    { header: 'STOCK', key: 'stock', width: 12 },
    { header: 'TOTAL VALUE', key: 'value', width: 15 },
    { header: 'REORDER POINT', key: 'reorder', width: 15 },
    { header: 'SACK WEIGHT (KG)', key: 'sack_weight', width: 15 },
    { header: 'LABOR COST', key: 'labor', width: 15 },
    { header: 'PACKAGING COST', key: 'packaging', width: 15 },
    { header: 'PICTURE', key: 'picture', width: 20 }
  ];

  const products = db.prepare('SELECT id, code, name, category, unit, average_cost, srp, reorder_point, sack_weight_kg, labor_cost, packaging_cost, photo_path FROM products').all();
  for (const p of products) {
    const stock = getProductStock(db, p.id);
    const excelRow = inventorySheet.addRow({
      code: p.code,
      name: p.name,
      category: p.category,
      unit: p.unit,
      cost: p.average_cost,
      srp: p.srp,
      stock: stock,
      value: p.average_cost * stock,
      reorder: p.reorder_point,
      sack_weight: p.sack_weight_kg,
      labor: p.labor_cost,
      packaging: p.packaging_cost
    });

    if (p.photo_path && fs.existsSync(p.photo_path)) {
      try {
        const imageId = workbook.addImage({
          filename: p.photo_path,
          extension: path.extname(p.photo_path).slice(1).toLowerCase() || 'png'
        });
        inventorySheet.addImage(imageId, {
          tl: { col: 12, row: excelRow.number - 1 },
          ext: { width: 50, height: 50 }
        });
        excelRow.height = 40;
      } catch (e) { }
    }
  }

  await workbook.xlsx.writeFile(filePath);
  return true;
}

async function exportPurchasesToExcel(db, filePath) {
  const workbook = new ExcelJS.Workbook();
  const purchaseSheet = workbook.addWorksheet(`PURCHASES`);
  purchaseSheet.columns = [
    { header: 'DATE', key: 'date', width: 15 },
    { header: 'COMPANY', key: 'company', width: 20 },
    { header: 'TIN', key: 'tin', width: 20 },
    { header: 'SUPPLIER', key: 'supplier', width: 25 },
    { header: 'ADDRESS', key: 'address', width: 30 },
    { header: 'RECEIPT #', key: 'receipt', width: 15 },
    { header: 'CATEGORY', key: 'category', width: 20 },
    { header: 'GROSS AMOUNT', key: 'gross', width: 15 },
    { header: 'NET OF VAT', key: 'net', width: 15 },
    { header: 'INPUT VAT', key: 'vat', width: 12 },
    { header: 'IS VAT EXEMPT', key: 'is_vat_exempt', width: 15 },
    { header: 'REMARKS', key: 'remarks', width: 25 }
  ];

  const purchases = db.prepare('SELECT * FROM purchases ORDER BY date DESC').all();
  for (const row of purchases) {
    const displayAddress = row.address || row.remarks || '';
    const displayRemarks = row.address ? (row.remarks || '') : ''; // If we fallback address to remarks, clear remarks

    purchaseSheet.addRow({
      date: row.date,
      company: row.company_name,
      tin: row.supplier_tin,
      supplier: row.supplier_name,
      address: displayAddress,
      receipt: row.receipt_number,
      category: row.expense_category,
      gross: row.gross_amount,
      net: row.net_of_vat,
      vat: row.input_vat,
      is_vat_exempt: row.is_vat_exempt ? 'YES' : 'NO',
      remarks: displayRemarks
    });
  }

  await workbook.xlsx.writeFile(filePath);
  return true;
}

async function exportCustomersToExcel(db, filePath) {
  const workbook = new ExcelJS.Workbook();
  const customerSheet = workbook.addWorksheet('CUSTOMERS');
  customerSheet.columns = [
    { header: 'NAME', key: 'name', width: 30 },
    { header: 'ADDRESS', key: 'address', width: 40 },
    { header: 'ADDRESS 2', key: 'address2', width: 40 },
    { header: 'CONTACT #', key: 'contact', width: 20 },
    { header: 'TAX IDENTIFICATION NUMBER', key: 'tin', width: 25 },
    { header: 'USERNAME', key: 'username', width: 20 }
  ];

  const customers = db.prepare('SELECT name, address, contact_number, tin, customer_username FROM customers ORDER BY name ASC').all();
  customers.forEach(c => {
    customerSheet.addRow({
      name: c.name,
      address: c.address,
      contact: c.contact_number,
      tin: c.tin,
      username: c.customer_username
    });
  });

  await workbook.xlsx.writeFile(filePath);
  return true;
}

function importSalesFromCsv(db, csvContent) {
  // Simple CSV parser that handles quotes
  function parseCsv(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
    }
    return rows;
  }

  const allRows = parseCsv(csvContent);
  if (allRows.length < 2) return 0;

  const headers = allRows[0].map(h => h.toUpperCase());
  const dataRows = allRows.slice(1);
  const { vatRate } = getTaxSettings(db);

  const tx = db.transaction(() => {
    let importedCount = 0;
    for (const row of dataRows) {
      const getVal = (name) => {
        const idx = headers.indexOf(name);
        if (idx === -1) return '';
        let val = row[idx] || '';
        // Strip currency symbols and formatting
        return val.replace(/[₱,]/g, '').trim();
      };

      const dateStr = getVal('DATE');
      if (!dateStr || dateStr === '-') continue;

      // Handle date format (e.g. 01 Jan 2026)
      const parsedDate = new Date(dateStr);
      if (isNaN(parsedDate.getTime())) {
        console.warn('Skipping row with invalid date:', dateStr);
        continue;
      }
      const date = parsedDate.toISOString().slice(0, 10);
      const siNumber = getVal('SI NO.');
      const customerName = getVal('CUSTOMER');
      const productName = getVal('PRODUCT');
      const qty = parseFloat(getVal('QTY')) || 0;
      const unit = getVal('UNIT');
      const unitPrice = parseFloat(getVal('UNIT PRICE')) || 0;
      const remarks = getVal('REMARKS') || 'PAID';
      const channel = getVal('INVOICE') || 'WALK IN';
      const username = getVal('USERNAME');
      const contact = getVal('CONTACT #');
      const tin = getVal('TAX IDENTIFICATION NUMBER');
      const address = row[headers.indexOf('ADDRESS')] || ''; // Take the first address

      // 1. Get or Create Customer
      let customerId;
      const existingCustomer = db.prepare('SELECT id FROM customers WHERE name = ?').get(customerName);
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        customerId = createId();
        db.prepare(`
          INSERT INTO customers (id, name, address, contact_number, customer_username, tin, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(customerId, customerName, address, contact, username, tin, nowIso(), nowIso());
      }

      // 2. Get or Create Product
      let productId;
      const existingProduct = db.prepare('SELECT id FROM products WHERE name = ?').get(productName);
      if (existingProduct) {
        productId = existingProduct.id;
      } else {
        productId = createId();
        const code = productName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) + '-' + createId().slice(0, 4);
        db.prepare(`
          INSERT INTO products (id, code, name, category, unit, cost, srp, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(productId, code, productName, 'Others / Miscellaneous', unit || 'pc', 0, unitPrice, nowIso(), nowIso());
      }

      // 3. Create Sale (Using simple Insert, not affecting inventory for imports unless specified)
      const saleId = createId();
      const vat = calculateSaleLine({ qty, unitPrice, isVatExempt: row[headers.indexOf('VAT EXEMPT SALES')] ? true : false, vatRate });

      db.prepare(`
        INSERT INTO sales (id, company_name, date, si_number, customer_id, channel, status, remarks, gross_amount, input_vat, output_vat, vat_exempt_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleId,
        companyNames[0],
        date,
        siNumber,
        customerId,
        channel,
        remarks === 'PAID' ? 'PAID' : 'A/R',
        remarks,
        vat.grossAmount,
        vat.inputVat,
        vat.outputVat,
        vat.vatExemptAmount,
        nowIso(),
        nowIso()
      );

      // 4. Create Sale Item
      db.prepare(`
        INSERT INTO sale_items (id, sale_id, product_id, qty, unit, unit_price, gross_amount, input_vat, output_vat, vat_exempt_amount, costing, total_cost, profit, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        createId(),
        saleId,
        productId,
        qty,
        unit,
        unitPrice,
        vat.grossAmount,
        vat.inputVat,
        vat.outputVat,
        vat.vatExemptAmount,
        0, // Costing unknown on import
        0,
        vat.grossAmount - vat.outputVat,
        nowIso()
      );

      importedCount++;
    }
    return importedCount;
  });

  return tx();
}

async function analyzeExcelFile(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheets = [];

  workbook.eachSheet((sheet) => {
    let sheetType = 'UNKNOWN';
    // Find Headers (no row limit)
    for (let i = 1; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (!row || !row.values) continue;

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
        sheetType = 'SALES';
        break;
      } else if (
        (rowStr.includes('SUPPLIER') && (rowStr.includes('CATEGORY') || rowStr.includes('GROSS AMOUNT'))) ||
        ((rowStr.includes('NAME/TRADE NAME') || rowStr.includes('NAME/TRADENAME') || rowStr.includes('NAME / TRADE NAME') || rowStr.includes('TAX IDENTIFICATION NUMBER') || rowStr.includes('TAXIDENTIFICATIONNUMBER') || rowStr.includes('VOUCHER #') || rowStr.includes('VOUCHER#')) && (rowStr.includes('GROSS AMOUNT') || rowStr.includes('GROSSAMOUNT')))
      ) {
        sheetType = 'PURCHASES';
        break;
      } else if (rowStr.includes('CODE') && rowStr.includes('STOCK')) {
        sheetType = 'INVENTORY';
        break;
      } else if (rowStr.includes('NAME') && rowStr.includes('ADDRESS') && rowStr.includes('CONTACT')) {
        sheetType = 'CUSTOMERS';
        break;
      }
    }
    sheets.push({ name: sheet.name, type: sheetType });
  });

  return sheets;
}

async function importFullReportFromExcel(db, filePath, selectedSheetNames = null) {
  console.log('>>> [START] importFullReportFromExcel:', filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  let salesImported = 0;
  let purchasesImported = 0;
  let productsUpdated = 0;
  const { vatRate } = getTaxSettings(db);

  const tx = db.transaction(() => {
    const newSalesTracker = new Map();
    workbook.eachSheet((sheet) => {
      if (selectedSheetNames && !selectedSheetNames.includes(sheet.name)) {
        return;
      }
      console.log(`\n--- [SHEET] ${sheet.name} ---`);

      let headers = []; // 1-based index (headers[1] is col 1)
      let headerRowNumber = -1;
      let sheetType = '';

      // Find Headers (no row limit)
      for (let i = 1; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        if (!row || !row.values) continue;

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
          sheetType = 'SALES';
          break;
        } else if (
          (rowStr.includes('SUPPLIER') && (rowStr.includes('CATEGORY') || rowStr.includes('GROSS AMOUNT'))) ||
          ((rowStr.includes('NAME/TRADE NAME') || rowStr.includes('NAME/TRADENAME') || rowStr.includes('NAME / TRADE NAME') || rowStr.includes('TAX IDENTIFICATION NUMBER') || rowStr.includes('TAXIDENTIFICATIONNUMBER') || rowStr.includes('VOUCHER #') || rowStr.includes('VOUCHER#')) && (rowStr.includes('GROSS AMOUNT') || rowStr.includes('GROSSAMOUNT')))
        ) {
          headers = rowVals;
          headerRowNumber = i;
          sheetType = 'PURCHASES';
          break;
        } else if (rowStr.includes('CODE') && rowStr.includes('STOCK')) {
          headers = rowVals;
          headerRowNumber = i;
          sheetType = 'INVENTORY';
          break;
        } else if (rowStr.includes('NAME') && rowStr.includes('ADDRESS') && rowStr.includes('CONTACT')) {
          headers = rowVals;
          headerRowNumber = i;
          sheetType = 'CUSTOMERS';
          break;
        }
      }

      if (headerRowNumber === -1) {
        console.log(`[SKIP] Could not identify headers for sheet: ${sheet.name}`);
        return;
      }

      console.log(`[IDENTIFIED] Type: ${sheetType}, Row: ${headerRowNumber}`);

      let images = [];
      if (sheetType === 'INVENTORY') {
        try {
          images = sheet.getImages() || [];
        } catch (e) {
          console.warn('[WARN] Failed to read images from sheet:', e);
        }
      }

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNumber) return;

        const getValByKeys = (keys) => {
          for (const k of keys) {
            const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const colIdx = headers.findIndex(h => {
              if (!h) return false;
              return h.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanK;
            });
            if (colIdx !== -1) {
              const cell = row.getCell(colIdx);
              if (!cell || cell.value === null || cell.value === undefined) continue;
              let val = cell.value;
              if (val && typeof val === 'object') {
                if (val.result !== undefined) val = val.result;
                else if (val.richText !== undefined) val = val.richText.map(rt => rt.text).join('');
              }
              if (typeof val === 'string') return val.replace(/[₱,]/g, '').trim();
              return val.toString();
            }
          }
          return '';
        };

        const getVal = (name) => {
          return getValByKeys([name]);
        };

        if (sheetType === 'CUSTOMERS') {
          const name = getVal('NAME');
          if (!name) return;

          const address = getVal('ADDRESS');
          const address2 = getVal('ADDRESS 2');
          const contact = getVal('CONTACT #');
          const tin = getVal('TAX IDENTIFICATION NUMBER');
          const username = getVal('USERNAME');

          const existing = db.prepare('SELECT id FROM customers WHERE name = ?').get(name);
          if (existing) {
            db.prepare(`
               UPDATE customers 
               SET address = ?, address_2 = ?, contact_number = ?, tin = ?, customer_username = ?, updated_at = ? 
               WHERE id = ?
             `).run(address, address2, contact, tin, username, nowIso(), existing.id);
          } else {
            db.prepare(`
               INSERT INTO customers (id, name, address, address_2, contact_number, tin, customer_username, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             `).run(createId(), name, address, address2, contact, tin, username, nowIso(), nowIso());
          }
          return; // Move to next row
        }

        if (sheetType === 'SALES') {
          const dateVal = getValByKeys(['DATE']);
          const product = getValByKeys(['PRODUCT']);
          let customer = getValByKeys(['CUSTOMER', 'NAME/TRADE NAME', 'NAME/TRADENAME', 'NAME']) || 'Walk-in';

          if (!dateVal || !product || dateVal === 'SALES' || dateVal === 'TOTAL COST') {
            return;
          }

          const dateColIdx = headers.findIndex(h => h && h.toUpperCase().replace(/[^A-Z0-9]/g, '') === 'DATE');
          const cell = dateColIdx !== -1 ? row.getCell(dateColIdx) : null;
          const date = parseExcelDate(cell, dateVal);
          if (!date) return;

          // Get/Create Customer
          let customerId;
          const existingC = db.prepare('SELECT id FROM customers WHERE lower(name) = lower(?)').get(customer);
          if (existingC) customerId = existingC.id;
          else {
            customerId = createId();
            db.prepare('INSERT INTO customers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(customerId, customer, nowIso(), nowIso());
          }

          const siNumber = getValByKeys(['SI NO.', 'SI_NO', 'SI NO', 'SI']);
          const qty = parseFloat(getValByKeys(['QTY', 'QUANTITY'])) || 0;
          const unit = getValByKeys(['UNIT']);
          const price = parseFloat(getValByKeys(['UNIT PRICE', 'UNITPRICE', 'PRICE'])) || 0;
          const remarks = getValByKeys(['REMARKS', 'STATUS']) || 'PAID';
          const channel = getValByKeys(['INVOICE', 'CHANNEL']) || 'WALK IN';
          const receiptNumberRaw = getValByKeys(['RECEIPT #', 'RECEIPT#', 'RECEIPT']);
          const receiptNumberVal = receiptNumberRaw ? parseInt(receiptNumberRaw, 10) : null;

          // Read Costing and Profit from Excel
          const costing = parseFloat(getValByKeys(['COSTING', 'UNIT COST'])) || 0;
          const totalCost = parseFloat(getValByKeys(['TOTAL COST', 'TOTALCOST', 'COST'])) || 0;
          const rowProfit = parseFloat(getValByKeys(['PROFIT'])) || 0;

          // Get/Create Product
          let productId;
          const existingP = db.prepare('SELECT id FROM products WHERE lower(name) = lower(?)').get(product);
          if (existingP) productId = existingP.id;
          else {
            productId = createId();
            const code = product.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) + '-' + createId().slice(0, 4);
            db.prepare('INSERT INTO products (id, code, name, category, unit, cost, average_cost, srp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(productId, code, product, 'Imported', unit || 'pc', costing, costing, price, nowIso(), nowIso());
          }

          const isVatExempt = asBoolean(getValByKeys(['VAT EXEMPT SALES', 'VAT EXEMPT SALES ', 'VATEXEMPT']));
          const company = normalizeCompany(getValByKeys(['COMPANY']));

          const vat = calculateSaleLine({ qty, unitPrice: price, isVatExempt, vatRate });

          // Each row = one sale (no grouping)
          const saleId = createId();
          db.prepare('INSERT INTO sales (id, company_name, date, receipt_number, si_number, customer_id, channel, status, remarks, gross_amount, input_vat, output_vat, vat_exempt_amount, profit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            saleId, company, date, receiptNumberVal, siNumber || '', customerId, channel,
            remarks === 'PAID' ? 'PAID' : 'A/R', remarks,
            vat.grossAmount, vat.inputVat, vat.outputVat, vat.vatExemptAmount,
            rowProfit,
            nowIso(), nowIso()
          );

          db.prepare('INSERT INTO sale_items (id, sale_id, product_id, qty, unit, unit_price, gross_amount, input_vat, output_vat, vat_exempt_amount, costing, total_cost, profit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            createId(), saleId, productId, qty, unit, price,
            vat.grossAmount, vat.inputVat, vat.outputVat, vat.vatExemptAmount,
            costing, totalCost, rowProfit,
            nowIso()
          );
          salesImported++;
        }
        else if (sheetType === 'PURCHASES') {
          const dateVal = getValByKeys(['DATE']);
          let supplier = getValByKeys(['SUPPLIER', 'NAME/TRADE NAME', 'NAME/TRADENAME', 'COMPANY']) || 'Miscellaneous';
          const categoryVal = getValByKeys(['CATEGORY']);
          const company = normalizeCompany(getValByKeys(['COMPANY']));

          if (!dateVal || dateVal === 'DATE') return;

          const dateColIdx = headers.findIndex(h => h && h.toUpperCase().replace(/[^A-Z0-9]/g, '') === 'DATE');
          const cell = dateColIdx !== -1 ? row.getCell(dateColIdx) : null;
          const date = parseExcelDate(cell, dateVal);
          if (!date) return;

          const receipt = getValByKeys(['RECEIPT #', 'RECEIPT#', 'RECEIPT']);
          const tin = getValByKeys(['TAX IDENTIFICATION NUMBER', 'TAXIDENTIFICATIONNUMBER', 'TIN']);
          const address = getValByKeys(['ADDRESS']);
          const remarks = getValByKeys(['REMARKS']) || 'PAID';
          const isVatExempt = asBoolean(getValByKeys(['IS VAT EXEMPT', 'ISVATEXEMPT']));

          // Check if there are separate columns for each category (multi-column layout)
          const categoryColIndices = [];
          headers.forEach((h, idx) => {
            if (!h || idx === 0) return;
            const normalized = normalizeExpenseCategory(h);
            const cleanH = h.toUpperCase().trim();
            if (
              normalized !== 'Miscellaneous' ||
              cleanH === 'OTHERS' ||
              cleanH === 'MISCELLENIOUS' ||
              cleanH === 'MISCELLANEOUS'
            ) {
              categoryColIndices.push({
                index: idx,
                categoryName: normalized === 'Miscellaneous' ? 'Miscellaneous' : normalized
              });
            }
          });

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
                const vat = calculatePurchaseLine({ grossAmount: val, isVatExempt, vatRate });
                db.prepare(`
                  INSERT INTO purchases (
                    id, date, company_name, supplier_tin, supplier_name, receipt_number, address, 
                    expense_category, gross_amount, net_of_vat, input_vat, output_vat, is_vat_exempt, 
                    remarks, created_at, updated_at
                  ) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  createId(), date, company, tin || '', supplier, receipt || '', address || '',
                  catCol.categoryName, vat.grossAmount, vat.netOfVat, vat.inputVat, 0, isVatExempt ? 1 : 0,
                  remarks, nowIso(), nowIso()
                );
                purchasesImported++;
                parsedAny = true;
              }
            }

            if (!parsedAny) {
              const grossAmount = parseFloat(getValByKeys(['GROSS AMOUNT', 'GROSSAMOUNT'])) || 0;
              if (grossAmount > 0) {
                const vat = calculatePurchaseLine({ grossAmount, isVatExempt, vatRate });
                db.prepare(`
                  INSERT INTO purchases (
                    id, date, company_name, supplier_tin, supplier_name, receipt_number, address, 
                    expense_category, gross_amount, net_of_vat, input_vat, output_vat, is_vat_exempt, 
                    remarks, created_at, updated_at
                  ) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  createId(), date, company, tin || '', supplier, receipt || '', address || '',
                  'Miscellaneous', vat.grossAmount, vat.netOfVat, vat.inputVat, 0, isVatExempt ? 1 : 0,
                  remarks, nowIso(), nowIso()
                );
                purchasesImported++;
              }
            }
          } else {
            const grossAmount = parseFloat(getValByKeys(['GROSS AMOUNT', 'GROSSAMOUNT'])) || 0;
            const category = normalizeExpenseCategory(categoryVal || 'Miscellaneous');
            const vat = calculatePurchaseLine({ grossAmount, isVatExempt, vatRate });

            db.prepare(`
              INSERT INTO purchases (
                id, date, company_name, supplier_tin, supplier_name, receipt_number, address, 
                expense_category, gross_amount, net_of_vat, input_vat, output_vat, is_vat_exempt, 
                remarks, created_at, updated_at
              ) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              createId(), date, company, tin || '', supplier, receipt || '', address || '',
              category, vat.grossAmount, vat.netOfVat, vat.inputVat, 0, isVatExempt ? 1 : 0,
              remarks, nowIso(), nowIso()
            );
            purchasesImported++;
          }
        }
        else if (sheetType === 'INVENTORY') {
          const name = getVal('NAME');
          const code = getVal('CODE');

          if (!name || !code || name === 'NAME') return;

          const targetStock = parseFloat(getVal('STOCK')) || 0;
          const srp = parseFloat(getVal('SRP')) || 0;
          const cost = parseFloat(getVal('COST')) || 0;
          const reorder = parseFloat(getVal('REORDER POINT')) || 10;
          const labor = parseFloat(getVal('LABOR COST')) || 0;
          const packaging = parseFloat(getVal('PACKAGING COST')) || 0;
          const sackWeight = parseFloat(getVal('SACK WEIGHT (KG)')) || 0;

          const existing = db.prepare('SELECT id FROM products WHERE code = ? OR name = ?').get(code, name);
          if (existing) {
            const batchSum = db.prepare('SELECT COALESCE(SUM(remaining_qty), 0) AS sum FROM batches WHERE product_id = ? AND remaining_qty > 0').get(existing.id)?.sum || 0;

            let stockQty = 0;
            if (targetStock < batchSum) {
              try {
                consumeStock(db, existing.id, roundMoney(batchSum - targetStock));
              } catch (e) {
                db.prepare('UPDATE batches SET remaining_qty = 0, updated_at = ? WHERE product_id = ?').run(nowIso(), existing.id);
              }
              stockQty = 0;
            } else {
              stockQty = roundMoney(targetStock - batchSum);
            }

            // Look for an image placed on this row
            const imageInfo = images.find(img => {
              const tl = img.range?.tl;
              if (!tl) return false;
              const imgRow = tl.nativeRow !== undefined ? tl.nativeRow : Math.floor(tl.row);
              return imgRow === (rowNumber - 1);
            });
            let photoPath = existing.photo_path || '';
            if (imageInfo) {
              const imgData = workbook.getImage(imageInfo.imageId);
              if (imgData && imgData.buffer) {
                const ext = imgData.extension || 'png';
                const fileName = `import_${existing.id}_${Date.now()}.${ext}`;
                photoPath = uploadProductPhotoFile(fileName, imgData.buffer);
              }
            }

            if (photoPath) {
              db.prepare(`
                UPDATE products 
                SET stock_qty = ?, srp = ?, average_cost = ?, cost = ?, reorder_point = ?, labor_cost = ?, packaging_cost = ?, sack_weight_kg = ?, photo_path = ?, updated_at = ? 
                WHERE id = ?
              `).run(stockQty, srp, cost, cost, reorder, labor, packaging, sackWeight, photoPath, nowIso(), existing.id);
            } else {
              db.prepare(`
                UPDATE products 
                SET stock_qty = ?, srp = ?, average_cost = ?, cost = ?, reorder_point = ?, labor_cost = ?, packaging_cost = ?, sack_weight_kg = ?, updated_at = ? 
                WHERE id = ?
              `).run(stockQty, srp, cost, cost, reorder, labor, packaging, sackWeight, nowIso(), existing.id);
            }
            productsUpdated++;
          } else {
            const newId = createId();
            // Look for an image placed on this row
            const imageInfo = images.find(img => {
              const tl = img.range?.tl;
              if (!tl) return false;
              const imgRow = tl.nativeRow !== undefined ? tl.nativeRow : Math.floor(tl.row);
              return imgRow === (rowNumber - 1);
            });
            let photoPath = '';
            if (imageInfo) {
              const imgData = workbook.getImage(imageInfo.imageId);
              if (imgData && imgData.buffer) {
                const ext = imgData.extension || 'png';
                const fileName = `import_${newId}_${Date.now()}.${ext}`;
                photoPath = uploadProductPhotoFile(fileName, imgData.buffer);
              }
            }

            db.prepare(`
              INSERT INTO products (id, code, name, category, unit, cost, average_cost, srp, stock_qty, reorder_point, labor_cost, packaging_cost, sack_weight_kg, photo_path, created_at, updated_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(newId, code, name, getVal('CATEGORY') || 'Imported', getVal('UNIT') || 'pc', cost, cost, srp, targetStock, reorder, labor, packaging, sackWeight, photoPath, nowIso(), nowIso());
            productsUpdated++;
          }
        }
      });
    });
    return { sales: salesImported, purchases: purchasesImported, products: productsUpdated };
  });

  const results = tx();
  console.log('>>> [COMPLETE] Import Results:', results);
  return results.sales + results.purchases + results.products;
}

function getLookups() {
  return {
    companyNames,
    salesChannels,
    saleStatuses,
    productCategories,
    expenseCategories
  };
}

export function createRepository() {
  const db = openDatabase();
  const dbPath = getWritableDatabasePath();

  // Diagnostics: Auto-dump the excel sheet structure for review
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.xlsx.readFile('example xl/example.xlsx').then(() => {
      let log = '';
      log += `Sheets in workbook: ${workbook.worksheets.map(w => w.name).join(', ')}\n\n`;
      workbook.worksheets.forEach(worksheet => {
        log += `=== Worksheet: ${worksheet.name} (Rows: ${worksheet.rowCount}, Cols: ${worksheet.columnCount}) ===\n`;
        worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
          if (rowNumber <= 110) { // Read more rows to capture financial statement details fully
            const values = Array.isArray(row.values) ? row.values.slice(1) : [];
            log += `${rowNumber}: ${JSON.stringify(values)}\n`;
          }
        });
        log += '\n';
      });
      fs.writeFileSync('scratch/excel-dump.txt', log, 'utf8');
    }).catch(err => {
      fs.writeFileSync('scratch/excel-error.txt', err.stack || err.message, 'utf8');
    });
  } catch (err) {
    fs.writeFileSync('scratch/excel-error.txt', err.stack || err.message, 'utf8');
  }

  return {
    dbPath,
    close() {
      db.close();
    },
    getLookups() {
      return getLookups();
    },
    getTaxSettings() {
      return getTaxSettings(db);
    },
    saveTaxSettings(payload) {
      return saveTaxSettings(db, payload);
    },
    getAppMeta() {
      return {
        name: app.getName(),
        version: app.getVersion(),
        dbPath,
        userDataPath: app.getPath('userData'),
        platform: process.platform
      };
    },
    getDashboardSummary(filters) {
      return getDashboardSummary(db, filters);
    },
    getFinancialStatement(filters) {
      return getFinancialStatement(db, filters);
    },
    listProducts(filters) {
      return listProducts(db, filters);
    },
    saveProduct(payload) {
      return upsertProduct(db, payload);
    },
    uploadPhoto(filePath) {
      return uploadProductPhoto(filePath);
    },
    uploadPhotoFile(fileName, fileData) {
      return uploadProductPhotoFile(fileName, fileData);
    },
    deleteProduct(id) {
      return deleteProduct(db, id);
    },
    bulkDeleteProducts(ids) {
      return bulkDeleteProducts(db, ids);
    },
    getProductById(id) {
      return getProductById(db, id);
    },
    listCustomers(filters) {
      return listCustomers(db, filters);
    },
    saveCustomer(payload) {
      return upsertCustomer(db, payload);
    },
    deleteCustomer(id) {
      return deleteCustomer(db, id);
    },
    bulkDeleteCustomers(ids) {
      return bulkDeleteCustomers(db, ids);
    },
    getCustomerById(id) {
      return getCustomerById(db, id);
    },
    listSales(filters) {
      return listSales(db, filters);
    },
    saveSale(payload) {
      return createSale(db, payload);
    },
    deleteSale(id) {
      return deleteSale(db, id);
    },
    bulkDeleteSales(ids) {
      return bulkDeleteSales(db, ids);
    },
    getSaleById(id) {
      return getSaleById(db, id);
    },
    listPurchases(filters) {
      return listPurchases(db, filters);
    },
    savePurchase(payload) {
      return upsertPurchase(db, payload);
    },
    deletePurchase(id) {
      return deletePurchase(db, id);
    },
    bulkDeletePurchases(ids) {
      return bulkDeletePurchases(db, ids);
    },
    getPurchaseById(id) {
      return getPurchaseById(db, id);
    },
    createBatch(payload) {
      return createBatch(db, payload);
    },
    getProductStock(productId) {
      return getProductStock(db, productId);
    },
    splitProduct(productId, quantity, laborCost, packagingCost, srp) {
      return splitProduct(db, productId, quantity, laborCost, packagingCost, srp);
    },
    restockProduct(payload) {
      return restockProduct(db, payload);
    },
    exportFinancialStatementToExcel(filePath, filters) {
      return exportFinancialStatementToExcel(db, filePath, filters);
    },
    exportFullToExcel(filePath) {
      return exportFullReportToExcel(db, filePath);
    },
    exportSalesToExcel(filePath) {
      return exportSalesToExcel(db, filePath);
    },
    importSalesFromCsv(csvContent) {
      return importSalesFromCsv(db, csvContent);
    },
    importSalesFromExcel(filePath, selectedSheetNames) {
      return importFullReportFromExcel(db, filePath, selectedSheetNames);
    },
    analyzeExcelFile(filePath) {
      return analyzeExcelFile(filePath);
    },
    exportProductsToExcel(filePath) {
      return exportProductsToExcel(db, filePath);
    },
    exportPurchasesToExcel(filePath) {
      return exportPurchasesToExcel(db, filePath);
    },
    exportCustomersToExcel(filePath) {
      return exportCustomersToExcel(db, filePath);
    },
    listSuppliers(filters) {
      return listSuppliers(db, filters);
    },
    saveSupplier(payload) {
      return upsertSupplier(db, payload);
    },
    deleteSupplier(id) {
      return deleteSupplier(db, id);
    },
    bulkDeleteSuppliers(ids) {
      return bulkDeleteSuppliers(db, ids);
    },
    getSupplierById(id) {
      return getSupplierById(db, id);
    }
  };
}
