import Database from 'better-sqlite3';
import { companyNames, defaultTaxSettings } from '../src/shared/finance.js';

const DEFAULT_REORDER_POINT = 10;

function tableColumns(db, tableName) {
  return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name));
}

function ensureColumn(db, tableName, columnName, definitionSql) {
  const columns = tableColumns(db, tableName);

  if (!columns.has(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
  }
}

export function requiredTables() {
  return [
    'products',
    'customers',
    'sales',
    'sale_items',
    'inventory_movements',
    'batches',
    'purchases',
    'purchase_items',
    'app_settings',
    'foreign_currency_transactions'
  ];
}

export function initializeSchema(db) {
  if (!(db instanceof Database)) {
    throw new Error('A better-sqlite3 database instance is required to initialize the schema.');
  }

  const defaultCompany = companyNames[0].replace(/'/g, "''");

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'pc',
      cost REAL NOT NULL DEFAULT 0,
      average_cost REAL NOT NULL DEFAULT 0,
      srp REAL NOT NULL DEFAULT 0,
      sack_weight_kg REAL NOT NULL DEFAULT 0,
      price_per_kg REAL NOT NULL DEFAULT 0,
      labor_cost REAL NOT NULL DEFAULT 0,
      packaging_cost REAL NOT NULL DEFAULT 0,
      stock_qty REAL NOT NULL DEFAULT 0,
      is_vat_exempt INTEGER NOT NULL DEFAULT 0,
      reorder_point REAL NOT NULL DEFAULT ${DEFAULT_REORDER_POINT},
      photo_path TEXT NOT NULL DEFAULT '',
      is_hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      address_2 TEXT NOT NULL DEFAULT '',
      contact_number TEXT NOT NULL DEFAULT '',
      customer_username TEXT NOT NULL DEFAULT '',
      tin TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL DEFAULT '${defaultCompany}',
      date TEXT NOT NULL,
      si_number TEXT NOT NULL DEFAULT '',
      receipt_number INTEGER,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      po_number TEXT NOT NULL DEFAULT '',
      invoice_type TEXT NOT NULL DEFAULT 'SI',
      remarks TEXT NOT NULL DEFAULT '',
      gross_amount REAL NOT NULL DEFAULT 0,
      net_of_vat REAL NOT NULL DEFAULT 0,
      input_vat REAL NOT NULL DEFAULT 0,
      output_vat REAL NOT NULL DEFAULT 0,
      vat_exempt_amount REAL NOT NULL DEFAULT 0,
      profit REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      qty REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'pc',
      unit_price REAL NOT NULL DEFAULT 0,
      gross_amount REAL NOT NULL DEFAULT 0,
      net_of_vat REAL NOT NULL DEFAULT 0,
      input_vat REAL NOT NULL DEFAULT 0,
      output_vat REAL NOT NULL DEFAULT 0,
      vat_exempt_amount REAL NOT NULL DEFAULT 0,
      costing REAL NOT NULL DEFAULT 0,
      shipping_fee REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      profit REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      reference_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      date TEXT NOT NULL,
      movement_type TEXT NOT NULL,
      qty_in REAL NOT NULL DEFAULT 0,
      qty_out REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      batch_number TEXT NOT NULL,
      date TEXT NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      srp REAL NOT NULL DEFAULT 0,
      remaining_qty REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'pc',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL DEFAULT '${defaultCompany}',
      date TEXT NOT NULL,
      supplier_tin TEXT NOT NULL DEFAULT '',
      supplier_name TEXT NOT NULL,
      receipt_number TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      gross_amount REAL NOT NULL DEFAULT 0,
      net_of_vat REAL NOT NULL DEFAULT 0,
      input_vat REAL NOT NULL DEFAULT 0,
      output_vat REAL NOT NULL DEFAULT 0,
      is_vat_exempt INTEGER NOT NULL DEFAULT 0,
      expense_category TEXT NOT NULL,
      remarks TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      qty REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'pc',
      unit_cost REAL NOT NULL DEFAULT 0,
      srp REAL NOT NULL DEFAULT 0,
      gross_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      contact_number TEXT NOT NULL DEFAULT '',
      tin TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS foreign_currency_transactions (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL DEFAULT '${defaultCompany}',
      date TEXT NOT NULL,
      voucher_no TEXT NOT NULL DEFAULT '',
      supplier_name TEXT NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0,
      landed_cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
    CREATE INDEX IF NOT EXISTS idx_sales_channel ON sales(channel);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON inventory_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_batches_product_id ON batches(product_id);
    CREATE INDEX IF NOT EXISTS idx_batches_date ON batches(date);
    CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
    CREATE INDEX IF NOT EXISTS idx_purchases_category ON purchases(expense_category);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_fct_date ON foreign_currency_transactions(date);
    CREATE INDEX IF NOT EXISTS idx_fct_company ON foreign_currency_transactions(company_name);

  `);

  const stamp = new Date().toISOString();

  // Add updated_at to app_settings if an older or partial table exists.
  try {
    db.exec(`ALTER TABLE app_settings ADD COLUMN updated_at TEXT NOT NULL DEFAULT '${stamp}'`);
  } catch (error) {
    // Column might already exist, ignore
  }

  const insertSetting = db.prepare('INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)');
  insertSetting.run('vat_rate', String(defaultTaxSettings.vatRate), stamp);
  insertSetting.run('income_tax_rate', String(defaultTaxSettings.incomeTaxRate), stamp);

  // Add photo_path column if it doesn't exist (for migration)
  try {
    db.exec(`ALTER TABLE products ADD COLUMN photo_path TEXT NOT NULL DEFAULT ''`);
  } catch (error) {
    // Column might already exist, ignore
  }

  // Add packaging_cost column if it doesn't exist (for migration)
  try {
    db.exec(`ALTER TABLE products ADD COLUMN packaging_cost REAL NOT NULL DEFAULT 0`);
  } catch (error) {
    // Column might already exist, ignore
  }

  // Migrate shopee_username to customer_username
  try {
    const customerColumns = new Set(db.prepare('PRAGMA table_info(customers)').all().map((column) => column.name));

    if (customerColumns.has('shopee_username') && !customerColumns.has('customer_username')) {
      // Rename the column
      db.exec(`
        ALTER TABLE customers RENAME COLUMN shopee_username TO customer_username;
      `);
    }
  } catch (error) {
    // Column might already be migrated or table structure is correct, ignore
  }

  // Add srp column to batches if it doesn't exist (for migration)
  try {
    db.exec(`ALTER TABLE batches ADD COLUMN srp REAL NOT NULL DEFAULT 0`);
  } catch (error) {
    // Column might already exist, ignore
  }

  // Add reorder_point column if it doesn't exist (for migration)
  try {
    db.exec(`ALTER TABLE products ADD COLUMN reorder_point REAL NOT NULL DEFAULT ${DEFAULT_REORDER_POINT}`);
  } catch (error) {
    // Column might already exist, ignore
  }

  // Add receipt_number column to sales if it doesn't exist (for migration)
  try {
    db.exec(`ALTER TABLE sales ADD COLUMN receipt_number INTEGER`);
  } catch (error) {
    // Column might already exist, ignore
  }

  // Sales/sale_items historically stored "Net of VAT" in input_vat; rename to net_of_vat.
  ensureColumn(db, 'sales', 'net_of_vat', 'REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'sale_items', 'net_of_vat', 'REAL NOT NULL DEFAULT 0');

  if (tableColumns(db, 'sales').has('input_vat')) {
    db.exec(`
      UPDATE sales
      SET net_of_vat = input_vat
      WHERE net_of_vat = 0 AND input_vat != 0
    `);
  }

  if (tableColumns(db, 'sale_items').has('input_vat')) {
    db.exec(`
      UPDATE sale_items
      SET net_of_vat = input_vat
      WHERE net_of_vat = 0 AND input_vat != 0
    `);
  }

  // Add VAT exempt marker to purchases if it doesn't exist (for migration)
  try {
    db.exec(`ALTER TABLE purchases ADD COLUMN is_vat_exempt INTEGER NOT NULL DEFAULT 0`);
  } catch (error) {
    // Column might already exist, ignore
  }

  // Add address_2 column to customers if it doesn't exist (for migration)
  try {
    db.exec(`ALTER TABLE customers ADD COLUMN address_2 TEXT NOT NULL DEFAULT ''`);
  } catch (error) {
    // Column might already exist, ignore
  }

  // Add suppliers table if it doesn't exist (migration for existing databases)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        contact_number TEXT NOT NULL DEFAULT '',
        tin TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)`);
  } catch (error) {
    // Table might already exist, ignore
  }

  // Add foreign_currency_transactions table if it doesn't exist (migration for existing databases)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS foreign_currency_transactions (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL DEFAULT '${defaultCompany}',
        date TEXT NOT NULL,
        voucher_no TEXT NOT NULL DEFAULT '',
        supplier_name TEXT NOT NULL,
        amount_paid REAL NOT NULL DEFAULT 0,
        landed_cost REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_fct_date ON foreign_currency_transactions(date)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_fct_company ON foreign_currency_transactions(company_name)`);
  } catch (error) {
    // Table might already exist, ignore
  }

  // Add is_hidden column if it doesn't exist (for migration)
  try {
    db.exec(`ALTER TABLE products ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0`);
  } catch (error) {
    // Column might already exist, ignore
  }

  // Data fix migration for missing input_vat (applies to older imported data)
  // Data fix migration removed because it incorrectly altered valid imported sales.

  // Add shipping_fee column to sale_items if it doesn't exist (for migration)
  try {
    db.exec(`ALTER TABLE sale_items ADD COLUMN shipping_fee REAL NOT NULL DEFAULT 0`);
  } catch (error) {
    // Column might already exist, ignore
  }
}
