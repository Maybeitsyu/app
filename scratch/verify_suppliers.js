import { readFileSync } from 'fs';

const app = readFileSync('src/renderer/App.jsx', 'utf8');
const db = readFileSync('electron/db.js', 'utf8');
const main = readFileSync('electron/main.js', 'utf8');
const preload = readFileSync('electron/preload.js', 'utf8');
const schema = readFileSync('electron/schema.js', 'utf8');
const server = readFileSync('electron/server.js', 'utf8');

const checks = [
  // Schema
  ['schema: suppliers table',        schema.includes('CREATE TABLE IF NOT EXISTS suppliers')],
  ['schema: migration block',        schema.includes('idx_suppliers_name')],
  // DB
  ['db: serializeSupplier',          db.includes('serializeSupplier')],
  ['db: listSuppliers',              db.includes('function listSuppliers')],
  ['db: upsertSupplier',             db.includes('function upsertSupplier')],
  ['db: deleteSupplier',             db.includes('function deleteSupplier')],
  ['db: repository.saveSupplier',    db.includes('saveSupplier(payload)')],
  // IPC
  ['main: suppliers:list handler',   main.includes("'suppliers:list'")],
  ['main: suppliers:save handler',   main.includes("'suppliers:save'")],
  // Preload
  ['preload: suppliers exposed',     preload.includes("'suppliers:list'")],
  // Server
  ['server: suppliers RPC routes',   server.includes("'suppliers:list'")],
  // UI
  ['ui: blankSupplierForm',          app.includes('function blankSupplierForm')],
  ['ui: supplierToForm',             app.includes('function supplierToForm')],
  ['ui: SuppliersTab component',     app.includes('function SuppliersTab(')],
  ['ui: handleSupplierSubmit',       app.includes('handleSupplierSubmit')],
  ['ui: handleSupplierDelete',       app.includes('handleSupplierDelete')],
  ['ui: suppliers state var',        app.includes('[suppliers, setSuppliers]')],
  ['ui: supplierSearch state',       app.includes('[supplierSearch, setSupplierSearch]')],
  ['ui: showSupplierForm state',     app.includes('[showSupplierForm, setShowSupplierForm]')],
  ['ui: Suppliers in tabMeta',       app.includes("title: 'Suppliers'")],
  ['ui: SuppliersTab rendered',      app.includes("activeTab === 'suppliers'")],
  ['ui: loadSuppliersData',          app.includes('function loadSuppliersData')],
  ['ui: remote API suppliers',       app.includes("'suppliers:list'")],
  // New Refinements
  ['ui: address column in table',    app.includes('handleSort(\'address\')')],
  ['ui: address row rendering',      app.includes('supplier.address || \'-\'')],
  ['ui: supplier_contact in form',   app.includes('supplier_contact: \'\'')],
  ['ui: supplier_category in form',  app.includes('supplier_category: \'\'')],
  ['ui: contact field in purchase',  app.includes('placeholder="Phone or mobile..."')],
  ['ui: auto-save contact info',     app.includes('contact_number: existing.contactNumber || submissionForm.supplier_contact || \'\'')],
];

let pass = 0, fail = 0;
checks.forEach(([label, result]) => {
  const icon = result ? '✓' : '✗';
  console.log(`${icon} ${label}`);
  result ? pass++ : fail++;
});
console.log(`\n${pass}/${checks.length} checks passed${fail > 0 ? ' — ' + fail + ' FAILED' : ' — all good!'}`);
