import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron';
import fs from 'node:fs';
import os from 'os';
import { createRepository } from './db.js';
import { createSyncServer, getLanIpAddress } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow = null;
let repository = null;
let syncServer = null;

const SYNC_PORT = 3847;

function getPreloadPath() {
  return path.join(__dirname, 'preload.js');
}

function getRendererUrl() {
  return process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
}

function getRendererIndexPath() {
  return path.join(app.getAppPath(), 'dist', 'renderer', 'index.html');
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#f4efe7',
    title: 'AgriLedger',
    icon: path.join(__dirname, process.platform === 'win32' ? '../logo/icon.ico' : '../logo/logo.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    window.loadURL(getRendererUrl());
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    window.loadFile(getRendererIndexPath());
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

function buildMenu() {
  Menu.setApplicationMenu(null);
}

function registerIpcHandlers() {
  ipcMain.handle('app:getMeta', () => repository.getAppMeta());
  ipcMain.handle('app:openPath', async (_, filePath) => {
    await shell.openPath(filePath);
    return true;
  });
  ipcMain.handle('app:openDataFolder', async () => {
    if (repository) {
      await shell.openPath(path.dirname(repository.dbPath));
    }

    return true;
  });
  ipcMain.handle('lookups:get', () => repository.getLookups());
  ipcMain.handle('settings:getTax', () => repository.getTaxSettings());
  ipcMain.handle('settings:saveTax', (_, payload) => repository.saveTaxSettings(payload));
  ipcMain.handle('dashboard:getOverview', (_, filters) => repository.getDashboardSummary(filters));
  ipcMain.handle('reports:getFinancialStatement', (_, filters) => repository.getFinancialStatement(filters));

  ipcMain.handle('products:list', (_, filters) => repository.listProducts(filters));
  ipcMain.handle('products:save', (_, payload) => {
    const res = repository.saveProduct(payload);
    syncServer?.broadcastChange('products:save');
    return res;
  });
  ipcMain.handle('products:uploadPhoto', (_, filePath) => repository.uploadPhoto(filePath));
  ipcMain.handle('products:uploadPhotoFile', (_, payload) => {
    return repository.uploadPhotoFile(payload.fileName, payload.fileData, payload.isBase64);
  });
  ipcMain.handle('products:delete', (_, id) => {
    const res = repository.deleteProduct(id);
    syncServer?.broadcastChange('products:delete');
    return res;
  });
  ipcMain.handle('products:bulkDelete', (_, ids) => {
    const res = repository.bulkDeleteProducts(ids);
    syncServer?.broadcastChange('products:bulkDelete');
    return res;
  });
  ipcMain.handle('products:split', (_, { productId, quantity, laborCost, packagingCost, srp }) => {
    const res = repository.splitProduct(productId, quantity, laborCost, packagingCost, srp);
    syncServer?.broadcastChange('products:split');
    return res;
  });

  ipcMain.handle('customers:list', (_, filters) => repository.listCustomers(filters));
  ipcMain.handle('customers:save', (_, payload) => {
    const res = repository.saveCustomer(payload);
    syncServer?.broadcastChange('customers:save');
    return res;
  });
  ipcMain.handle('customers:delete', (_, id) => {
    const res = repository.deleteCustomer(id);
    syncServer?.broadcastChange('customers:delete');
    return res;
  });
  ipcMain.handle('customers:bulkDelete', (_, ids) => {
    const res = repository.bulkDeleteCustomers(ids);
    syncServer?.broadcastChange('customers:bulkDelete');
    return res;
  });

  ipcMain.handle('suppliers:list', (_, filters) => repository.listSuppliers(filters));
  ipcMain.handle('suppliers:save', (_, payload) => {
    const res = repository.saveSupplier(payload);
    syncServer?.broadcastChange('suppliers:save');
    return res;
  });
  ipcMain.handle('suppliers:delete', (_, id) => {
    const res = repository.deleteSupplier(id);
    syncServer?.broadcastChange('suppliers:delete');
    return res;
  });
  ipcMain.handle('suppliers:bulkDelete', (_, ids) => {
    const res = repository.bulkDeleteSuppliers(ids);
    syncServer?.broadcastChange('suppliers:bulkDelete');
    return res;
  });

  ipcMain.handle('sales:list', (_, filters) => repository.listSales(filters));
  ipcMain.handle('sales:save', (_, payload) => {
    const res = repository.saveSale(payload);
    syncServer?.broadcastChange('sales:save');
    return res;
  });
  ipcMain.handle('sales:delete', (_, id) => {
    const res = repository.deleteSale(id);
    syncServer?.broadcastChange('sales:delete');
    return res;
  });
  ipcMain.handle('sales:bulkDelete', (_, ids) => {
    const res = repository.bulkDeleteSales(ids);
    syncServer?.broadcastChange('sales:bulkDelete');
    return res;
  });
  ipcMain.handle('sales:get', (_, id) => repository.getSaleById(id));

  ipcMain.handle('purchases:list', (_, filters) => repository.listPurchases(filters));
  ipcMain.handle('purchases:save', (_, payload) => {
    const res = repository.savePurchase(payload);
    syncServer?.broadcastChange('purchases:save');
    return res;
  });
  ipcMain.handle('purchases:delete', (_, id) => {
    const res = repository.deletePurchase(id);
    syncServer?.broadcastChange('purchases:delete');
    return res;
  });
  ipcMain.handle('purchases:bulkDelete', (_, ids) => {
    const res = repository.bulkDeletePurchases(ids);
    syncServer?.broadcastChange('purchases:bulkDelete');
    return res;
  });


  ipcMain.handle('products:getStock', (_, productId) => repository.getProductStock(productId));

  // Data Import/Export
  ipcMain.handle('app:saveFileDialog', async (_, { title, defaultPath, filters }) => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title,
      defaultPath,
      filters
    });
    return canceled ? null : filePath;
  });

  ipcMain.handle('app:openFileDialog', async (_, { title, filters }) => {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title,
      properties: ['openFile'],
      filters
    });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle('app:writeFile', async (_, { filePath, content, encoding = 'utf8' }) => {
    fs.writeFileSync(filePath, content, encoding);
    return true;
  });

  ipcMain.handle('app:readFile', async (_, { filePath, encoding = 'utf8' }) => {
    return fs.readFileSync(filePath, encoding);
  });

  ipcMain.handle('sales:exportExcel', async (_, { filePath }) => {
    return repository.exportSalesToExcel(filePath);
  });
  ipcMain.handle('reports:exportFinancialStatementExcel', async (_, { filePath, filters }) => {
    return repository.exportFinancialStatementToExcel(filePath, filters);
  });
  ipcMain.handle('app:exportFullExcel', async (_, { filePath }) => {
    return repository.exportFullToExcel(filePath);
  });
  ipcMain.handle('app:analyzeExcel', async (_, { filePath }) => {
    return repository.analyzeExcelFile(filePath);
  });

  ipcMain.handle('sales:importCsv', async (_, { csvContent }) => {
    return repository.importSalesFromCsv(csvContent);
  });

  ipcMain.handle('sales:importExcel', async (_, { filePath, selectedSheetNames }) => {
    return repository.importSalesFromExcel(filePath, selectedSheetNames);
  });
  ipcMain.handle('products:exportExcel', async (_, { filePath }) => {
    return repository.exportProductsToExcel(filePath);
  });
  ipcMain.handle('purchases:exportExcel', async (_, { filePath }) => {
    return repository.exportPurchasesToExcel(filePath);
  });
  ipcMain.handle('customers:exportExcel', async (_, { filePath }) => {
    return repository.exportCustomersToExcel(filePath);
  });


  // ── Foreign Currency Transactions ──
  ipcMain.handle('fct:list', (_, filters) => repository.listForeignCurrencyTransactions(filters));
  ipcMain.handle('fct:save', (_, payload) => {
    const res = repository.saveForeignCurrencyTransaction(payload);
    syncServer?.broadcastChange('fct:save');
    return res;
  });
  ipcMain.handle('fct:delete', (_, id) => {
    const res = repository.deleteForeignCurrencyTransaction(id);
    syncServer?.broadcastChange('fct:delete');
    return res;
  });
  ipcMain.handle('fct:bulkDelete', (_, ids) => {
    const res = repository.bulkDeleteForeignCurrencyTransactions(ids);
    syncServer?.broadcastChange('fct:bulkDelete');
    return res;
  });

  // ── Sync Server IPC ──
  ipcMain.handle('sync:getServerInfo', () => {
    return {
      running: syncServer?.isRunning ?? false,
      port: SYNC_PORT,
      ip: getLanIpAddress(),
      hostname: os.hostname(),
      connectedClients: syncServer?.connectedClients ?? 0
    };
  });

  ipcMain.handle('sync:toggleServer', async (_, enabled) => {
    if (enabled && syncServer && !syncServer.isRunning) {
      await syncServer.start(SYNC_PORT);
    } else if (!enabled && syncServer?.isRunning) {
      await syncServer.stop();
    }
    return {
      running: syncServer?.isRunning ?? false,
      port: SYNC_PORT,
      ip: getLanIpAddress(),
      hostname: os.hostname(),
      connectedClients: syncServer?.connectedClients ?? 0
    };
  });
}

async function bootstrap() {
  await app.whenReady();

  repository = createRepository();
  registerIpcHandlers();

  // Determine photos directory for the sync server
  const photosDir = path.join(app.getPath('userData'), 'data', 'photos');
  const uiDir = path.join(app.getAppPath(), 'dist', 'renderer');

  // Start sync server automatically
  syncServer = createSyncServer(repository, photosDir, uiDir);
  try {
    await syncServer.start(SYNC_PORT);
    console.log(`[AgriLedger] Sync server started at http://${getLanIpAddress()}:${SYNC_PORT}`);
  } catch (err) {
    console.error('[AgriLedger] Failed to start sync server:', err.message);
  }

  buildMenu();
  mainWindow = createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
}

app.setName('AgriLedger');

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (syncServer?.isRunning) {
    try { await syncServer.stop(); } catch { /* ignore */ }
  }
  if (repository) {
    repository.close();
    repository = null;
  }
});

bootstrap().catch((error) => {
  console.error('Failed to bootstrap AgriLedger:', error);
  app.quit();
});
