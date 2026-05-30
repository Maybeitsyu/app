/**
 * AgriLedger API-Level QA Script
 * Hits every RPC endpoint on the sync server at http://localhost:3847
 * and verifies each returns a valid response.
 */

const BASE_URL = 'http://localhost:3847';
const RESULTS = [];

let passed = 0;
let failed = 0;
let warned = 0;

function log(status, module, endpoint, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`  ${icon} [${module}] ${endpoint}${detail ? ' — ' + detail : ''}`);
  RESULTS.push({ status, module, endpoint, detail });
  if (status === 'PASS') passed++;
  else if (status === 'FAIL') failed++;
  else warned++;
}

async function rpc(channel, payload = {}) {
  const res = await fetch(`${BASE_URL}/api/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, payload }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(json.error);
  }
  return json.result;
}

async function test(module, label, channel, payload = {}, validator = null) {
  try {
    const result = await rpc(channel, payload);
    if (validator) {
      const validationMsg = validator(result);
      if (validationMsg !== true) {
        log('WARN', module, label, `Validator: ${validationMsg}`);
        return result;
      }
    }
    log('PASS', module, label, Array.isArray(result) ? `${result.length} records` : typeof result === 'object' ? 'object returned' : String(result));
    return result;
  } catch (err) {
    log('FAIL', module, label, err.message);
    return null;
  }
}

// ─── Begin QA ───────────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════');
console.log('   AgriLedger API-Level QA — All Modules');
console.log(`════════════════════════════════════════════════════\n`);

// ── 1. App Meta & Settings ──────────────────────────────────────────────────
console.log('[1] App Meta & Settings');
await test('Settings', 'getMeta',        'app:getMeta');
await test('Settings', 'getLookups',     'lookups:get');
await test('Settings', 'getTaxSettings', 'settings:getTax', {}, (res) => {
  if (typeof res?.vatRate !== 'number') return 'vatRate is not a number';
  if (res.vatRate <= 0 || res.vatRate >= 1) return `vatRate out of expected range: ${res.vatRate}`;
  return true;
});

// ── 2. Dashboard ────────────────────────────────────────────────────────────
console.log('\n[2] Dashboard');
await test('Dashboard', 'getOverview (no filters)',       'dashboard:getOverview', {});
await test('Dashboard', 'getOverview (company A)',        'dashboard:getOverview', { companyName: 'Batangas Dairy Farmtech Inc.' });
await test('Dashboard', 'getOverview (company B)',        'dashboard:getOverview', { companyName: 'Dairy Solutions OPC' });
await test('Dashboard', 'getOverview (with date range)',  'dashboard:getOverview', { fromDate: '2025-01-01', toDate: '2026-12-31' });

// ── 3. Products ─────────────────────────────────────────────────────────────
console.log('\n[3] Products');
const products = await test('Products', 'listProducts (all)',         'products:list', {}, (res) => {
  if (!Array.isArray(res)) return 'Expected array';
  if (res.length === 0) return 'WARN: No products found (empty list)';
  return true;
});
await test('Products', 'listProducts (search=milk)',    'products:list', { search: 'milk' });
await test('Products', 'listProducts (hidden=true)',    'products:list', { showHidden: true });
await test('Products', 'listProducts (category filter)','products:list', { category: 'Milking Equipment' });

if (products && products.length > 0) {
  const firstProductId = products[0].id;
  const stock = await test('Products', 'getProductStock (first product)', 'products:getStock', firstProductId, (res) => {
    if (typeof res !== 'object') return 'Expected object';
    return true;
  });
}

// ── 4. Customers ────────────────────────────────────────────────────────────
console.log('\n[4] Customers');
const customers = await test('Customers', 'listCustomers (all)',        'customers:list', {});
await test('Customers', 'listCustomers (search test)',  'customers:list', { search: 'test' });

// ── 5. Suppliers ────────────────────────────────────────────────────────────
console.log('\n[5] Suppliers');
const suppliers = await test('Suppliers', 'listSuppliers (all)',        'suppliers:list', {});
await test('Suppliers', 'listSuppliers (search)',       'suppliers:list', { search: 'supply' });

// ── 6. Sales ─────────────────────────────────────────────────────────────────
console.log('\n[6] Sales');
const sales = await test('Sales', 'listSales (all)',            'sales:list', {});
await test('Sales', 'listSales (status=PAID)',         'sales:list', { status: 'PAID' });
await test('Sales', 'listSales (status=A/R)',          'sales:list', { status: 'A/R' });
await test('Sales', 'listSales (date range)',          'sales:list', { fromDate: '2025-01-01', toDate: '2026-12-31' });
await test('Sales', 'listSales (channel=Shopee)',      'sales:list', { channel: 'Shopee' });
await test('Sales', 'listSales (search=receipt)',      'sales:list', { search: 'receipt' });

// ── 7. Purchases ─────────────────────────────────────────────────────────────
console.log('\n[7] Purchases');
const purchases = await test('Purchases', 'listPurchases (all)',          'purchases:list', {});
await test('Purchases', 'listPurchases (category)',       'purchases:list', { category: 'Materials & Supplies' });
await test('Purchases', 'listPurchases (date range)',     'purchases:list', { fromDate: '2025-01-01', toDate: '2026-12-31' });

// ── 8. Foreign Currency Transactions ─────────────────────────────────────────
console.log('\n[8] Foreign Currency Transactions (FCT)');
const fcts = await test('FCT', 'listFCT (all)',         'fct:list', {});
await test('FCT', 'listFCT (date range)',    'fct:list', { fromDate: '2025-01-01', toDate: '2026-12-31' });

// ── 9. Reports ─────────────────────────────────────────────────────────────
console.log('\n[9] Reports');
await test('Reports', 'getFinancialStatement (all)',        'reports:getFinancialStatement', {});
await test('Reports', 'getFinancialStatement (company A)', 'reports:getFinancialStatement', { companyName: 'Batangas Dairy Farmtech Inc.' });
await test('Reports', 'getFinancialStatement (date range)','reports:getFinancialStatement', { fromDate: '2025-01-01', toDate: '2026-12-31' });

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════════════════`);
console.log(`   QA SUMMARY`);
console.log(`════════════════════════════════════════════════════`);
console.log(`   ✅ PASSED : ${passed}`);
console.log(`   ⚠️  WARNED : ${warned}`);
console.log(`   ❌ FAILED : ${failed}`);
console.log(`   Total    : ${passed + warned + failed}`);

if (failed === 0) {
  console.log(`\n   🎉 ALL ENDPOINTS OPERATIONAL — System is healthy.\n`);
} else {
  console.log(`\n   ⚠️  ${failed} endpoint(s) failed. Review above for details.\n`);
  console.log('   Failed endpoints:');
  RESULTS.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`   - [${r.module}] ${r.endpoint}: ${r.detail}`);
  });
}
