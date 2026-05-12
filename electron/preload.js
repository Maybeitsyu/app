import { contextBridge, ipcRenderer } from 'electron';

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

contextBridge.exposeInMainWorld('agriLedger', {
  app: {
    getMeta: () => invoke('app:getMeta'),
    openPath: (path) => invoke('app:openPath', path),
    openDataFolder: () => invoke('app:openDataFolder'),
    analyzeExcel: (options) => invoke('app:analyzeExcel', options)
  },
  lookups: {
    get: () => invoke('lookups:get')
  },
  settings: {
    getTax: () => invoke('settings:getTax'),
    saveTax: (payload) => invoke('settings:saveTax', payload)
  },
  dashboard: {
    getOverview: (filters) => invoke('dashboard:getOverview', filters)
  },
  products: {
    list: (filters) => invoke('products:list', filters),
    save: (payload) => invoke('products:save', payload),
    delete: (id) => invoke('products:delete', id),
    bulkDelete: (ids) => invoke('products:bulkDelete', ids),
    uploadPhoto: (filePath) => invoke('products:uploadPhoto', filePath),
    uploadPhotoFile: (payload) => invoke('products:uploadPhotoFile', payload),
    getStock: (productId) => invoke('products:getStock', productId),
    split: (payload) => invoke('products:split', payload)
  },
  customers: {
    list: (filters) => invoke('customers:list', filters),
    save: (payload) => invoke('customers:save', payload),
    delete: (id) => invoke('customers:delete', id),
    bulkDelete: (ids) => invoke('customers:bulkDelete', ids)
  },
  sales: {
    list: (filters) => invoke('sales:list', filters),
    save: (payload) => invoke('sales:save', payload),
    delete: (id) => invoke('sales:delete', id),
    bulkDelete: (ids) => invoke('sales:bulkDelete', ids),
    get: (id) => invoke('sales:get', id)
  },
  purchases: {
    list: (filters) => invoke('purchases:list', filters),
    save: (payload) => invoke('purchases:save', payload),
    delete: (id) => invoke('purchases:delete', id),
    bulkDelete: (ids) => invoke('purchases:bulkDelete', ids)
  },
  batches: {
    create: (payload) => invoke('batches:create', payload)
  },
  files: {
    saveDialog: (options) => invoke('app:saveFileDialog', options),
    openDialog: (options) => invoke('app:openFileDialog', options),
    write: (options) => invoke('app:writeFile', options),
    read: (options) => invoke('app:readFile', options)
  },
  data: {
    exportSalesExcel: (options) => invoke('sales:exportExcel', options),
    exportProductsExcel: (options) => invoke('products:exportExcel', options),
    exportPurchasesExcel: (options) => invoke('purchases:exportExcel', options),
    exportCustomersExcel: (options) => invoke('customers:exportExcel', options),
    importSalesCsv: (options) => invoke('sales:importCsv', options),
    importSalesExcel: (options) => invoke('sales:importExcel', options),
    exportFullExcel: (options) => invoke('app:exportFullExcel', options)
  },
  reports: {
    getFinancialStatement: (filters) => invoke('reports:getFinancialStatement', filters),
    exportFinancialStatementExcel: (options) => invoke('reports:exportFinancialStatementExcel', options)
  }
});
