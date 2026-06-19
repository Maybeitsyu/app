import fs from 'node:fs';
import path from 'node:path';

const STATE_FILE_NAME = 'google-sheets.json';

function nowIso() {
  return new Date().toISOString();
}

function loadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function buildHeaders(rows) {
  const headers = new Set();
  for (const row of rows) {
    Object.keys(row || {}).forEach((key) => headers.add(key));
  }
  return Array.from(headers);
}

function rowsToTable(headers, rows) {
  return [
    headers,
    ...rows.map((row) => headers.map((header) => {
      const value = row?.[header];
      if (value === null || value === undefined) return '';
      if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
      return value;
    }))
  ];
}

function extractSalesItems(sales) {
  const rows = [];
  for (const sale of sales) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    for (const item of items) {
      rows.push({
        saleId: sale.id,
        date: sale.date,
        receiptNumber: sale.receiptNumber,
        companyName: sale.companyName,
        customerName: sale.customerName,
        status: sale.status,
        channel: sale.channel,
        productName: item.productName ?? '',
        productCode: item.productCode ?? '',
        qty: item.qty ?? '',
        unit: item.unit ?? '',
        unitPrice: item.unitPrice ?? '',
        grossAmount: item.grossAmount ?? '',
        outputVat: item.outputVat ?? '',
        vatExemptAmount: item.vatExemptAmount ?? '',
        profit: item.profit ?? '',
        createdAt: item.createdAt ?? sale.createdAt ?? ''
      });
    }
  }
  return rows;
}

function makeSheetPayload(title, rows) {
  const headers = buildHeaders(rows);
  // if no rows and no headers, send empty values so Apps Script skips setValues
  if (headers.length === 0) {
    return { title, values: [] };
  }
  return {
    title,
    values: rowsToTable(headers, rows)
  };
}

export function createGoogleSheetsSync({ app, shell, repository }) {
  const statePath = path.join(app.getPath('userData'), 'data', STATE_FILE_NAME);
  
  const defaultState = {
    webAppUrl: '',
    syncToken: '',
    lastSyncAt: null,
    lastVerifiedAt: null,
    lastError: '',
    spreadsheetUrl: ''
  };

  let state = { ...defaultState, ...loadJson(statePath, {}) };
  let syncTimer = null;
  let syncInFlight = null;

  function persistState() {
    saveJson(statePath, state);
  }

  function setLastError(message = '') {
    state.lastError = message;
    persistState();
  }

  function getStatus() {
    return {
      webAppUrl: state.webAppUrl,
      syncToken: state.syncToken,
      configured: Boolean(state.webAppUrl && state.syncToken),
      connected: Boolean(state.webAppUrl && !state.lastError && state.lastVerifiedAt),
      lastSyncAt: state.lastSyncAt,
      lastVerifiedAt: state.lastVerifiedAt,
      lastError: state.lastError,
      spreadsheetUrl: state.spreadsheetUrl,
      spreadsheetId: state.spreadsheetUrl || '',
      spreadsheetTitle: 'AgriLedger Online',
      account: state.webAppUrl ? { email: 'Apps Script EndPoint' } : null
    };
  }

  function getConfigInfo() {
    return {
      configPath: statePath,
      configFolder: path.dirname(statePath),
      hasConfigFile: fs.existsSync(statePath)
    };
  }

  function openConfigFolder() {
    return shell.openPath(path.dirname(statePath));
  }

  function saveConfig(payload = {}) {
    state.webAppUrl = String(payload.webAppUrl ?? state.webAppUrl ?? '').trim();
    state.syncToken = String(payload.syncToken ?? state.syncToken ?? '').trim();
    persistState();
    return getStatus();
  }

  async function buildTabData() {
    const [products, customers, suppliers, sales, purchases, fxTransactions] = await Promise.all([
      repository.listProducts({}),
      repository.listCustomers({}),
      repository.listSuppliers({}),
      repository.listSales({}),
      repository.listPurchases({}),
      repository.listForeignCurrencyTransactions({})
    ]);
    const report = repository.getFinancialStatement({});

    // Flatten financial statement into rows for the Reports sheet
    const reportRows = [
      { metric: 'Period Start', value: report.period?.start ?? '' },
      { metric: 'Period End', value: report.period?.end ?? '' },
      { metric: '', value: '' },
      { metric: 'Total Sales', value: report.totalSales },
      { metric: 'Total COGS', value: report.totalCogs },
      { metric: 'Gross Profit', value: report.grossProfit },
      { metric: '', value: '' },
      ...Object.entries(report.expenses || {}).map(([k, v]) => ({ metric: k, value: v })),
      { metric: 'Total Operating Expenses', value: report.totalExpenses },
      { metric: '', value: '' },
      { metric: 'FX Gain', value: report.fxGain },
      { metric: 'FX Loss', value: report.fxLoss },
      { metric: '', value: '' },
      { metric: 'Income Tax Expense', value: report.incomeTaxExpense },
      { metric: 'Net Income After Tax', value: report.netIncomeAfterTax }
    ];

    return [
      makeSheetPayload('Products', products.map((row) => ({
        code: row.code,
        name: row.name,
        category: row.category,
        unit: row.unit,
        catalogCost: row.catalogCost,
        catalogSrp: row.catalogSrp,
        cost: row.cost,
        averageCost: row.averageCost,
        srp: row.srp,
        stockQty: row.stockQty,
        reorderPoint: row.reorderPoint,
        sackWeightKg: row.sackWeightKg,
        laborCost: row.laborCost,
        packagingCost: row.packagingCost,
        isVatExempt: row.isVatExempt,
        isHidden: row.isHidden,
        photoPath: row.photoPath,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))),
      makeSheetPayload('Customers', customers.map((row) => ({
        name: row.name,
        address: row.address,
        address2: row.address2,
        contactNumber: row.contactNumber,
        customerUsername: row.customerUsername,
        tin: row.tin,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))),
      makeSheetPayload('Suppliers', suppliers.map((row) => ({
        name: row.name,
        address: row.address,
        contactNumber: row.contactNumber,
        tin: row.tin,
        email: row.email,
        category: row.category,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))),
      makeSheetPayload('Sales', sales.map((row) => ({
        id: row.id,
        companyName: row.companyName,
        date: row.date,
        siNumber: row.siNumber,
        receiptNumber: row.receiptNumber,
        customerId: row.customerId,
        customerName: row.customerName,
        customerContact: row.customerContact,
        channel: row.channel,
        status: row.status,
        poNumber: row.poNumber,
        invoiceType: row.invoiceType,
        remarks: row.remarks,
        grossAmount: row.grossAmount,
        netOfVat: row.netOfVat,
        outputVat: row.outputVat,
        vatExemptAmount: row.vatExemptAmount,
        profit: row.profit,
        shippingFee: row.shippingFee,
        shippingCost: row.shippingCost,
        isShippingFeeVatExempt: row.isShippingFeeVatExempt,
        isShippingCostVatExempt: row.isShippingCostVatExempt,
        itemCount: row.itemCount,
        items: row.items,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))),
      makeSheetPayload('Sales Items', extractSalesItems(sales)),
      makeSheetPayload('Purchases', purchases.map((row) => ({
        id: row.id,
        companyName: row.companyName,
        date: row.date,
        supplierTin: row.supplierTin,
        supplierName: row.supplierName,
        receiptNumber: row.receiptNumber,
        address: row.address,
        grossAmount: row.grossAmount,
        netOfVat: row.netOfVat,
        inputVat: row.inputVat,
        outputVat: row.outputVat,
        isVatExempt: row.isVatExempt,
        expenseCategory: row.expenseCategory,
        remarks: row.remarks,
        items: row.items,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))),
      makeSheetPayload('Gain/Loss', fxTransactions.map((row) => ({
        companyName: row.companyName,
        date: row.date,
        voucherNo: row.voucherNo,
        supplierName: row.supplierName,
        amountPaid: row.amountPaid,
        landedCost: row.landedCost,
        loss: row.loss,
        gain: row.gain,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))),
      makeSheetPayload('Reports', reportRows)
    ];
  }

  async function connect() {
    if (!state.webAppUrl || !state.syncToken) {
      throw new Error('Google Apps Script configuration is incomplete.');
    }
    
    try {
      const response = await fetch(state.webAppUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'ping',
          token: state.syncToken
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.status === 'error') {
        throw new Error(data.message || 'Verification failed.');
      }

      state.spreadsheetUrl = data.spreadsheetUrl || state.spreadsheetUrl;
      state.lastVerifiedAt = nowIso();
      state.lastError = '';
      persistState();

      // immediately kick off a background sync so the sheet gets populated
      scheduleSync('connect');

      return getStatus();
    } catch (err) {
      setLastError(err.message || 'Failed to verify Apps Script connection.');
      throw err;
    }
  }

  function disconnect() {
    state.webAppUrl = '';
    state.syncToken = '';
    state.spreadsheetUrl = '';
    state.lastSyncAt = null;
    state.lastError = '';
    persistState();
    return getStatus();
  }

  async function syncNow() {
    if (!state.webAppUrl || !state.syncToken) {
      throw new Error('Google Apps Script configuration is incomplete.');
    }

    if (syncInFlight) {
      return syncInFlight;
    }

    syncInFlight = (async () => {
      try {
        const sheetsData = await buildTabData();
        
        const response = await fetch(state.webAppUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'sync',
            token: state.syncToken,
            sheets: sheetsData
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.status === 'error') {
          throw new Error(data.message || 'Apps Script sync returned error.');
        }

        state.lastSyncAt = data.lastSyncAt || nowIso();
        state.spreadsheetUrl = data.spreadsheetUrl || state.spreadsheetUrl;
        setLastError('');
        persistState();

        return getStatus();
      } catch (error) {
        setLastError(error?.message || 'Google Sheets Apps Script sync failed.');
        throw error;
      } finally {
        syncInFlight = null;
      }
    })();

    return syncInFlight;
  }

  function scheduleSync(reason = 'data-change') {
    if (!state.webAppUrl || !state.syncToken) {
      return;
    }

    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      void syncNow().catch((error) => {
        console.error(`[google-sheets-gas] sync failed after ${reason}:`, error.message);
      });
    }, 2000);
    syncTimer.unref?.();
  }

  function openSpreadsheet() {
    if (!state.spreadsheetUrl) {
      throw new Error('No Google Sheet URL is linked yet.');
    }
    return shell.openExternal(state.spreadsheetUrl);
  }

  return {
    getStatus,
    saveConfig,
    connect,
    disconnect,
    syncNow,
    scheduleSync,
    openSpreadsheet,
    getConfigInfo,
    openConfigFolder,
    dispose() {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
  };
}
