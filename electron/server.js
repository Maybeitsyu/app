import express from 'express';
import cors from 'cors';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Creates and manages a local network sync server.
 * Exposes the same repository methods as IPC handlers via a single RPC endpoint.
 * Uses version-based polling for live sync (no WebSocket dependency).
 */
export function createSyncServer(repository, photosDir, uiDir) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Serve photos for clients
  if (photosDir) {
    app.use('/api/photos', express.static(photosDir));
  }

  // Serve static built UI files for mobile phone web browsers
  if (uiDir && fs.existsSync(uiDir)) {
    app.use(express.static(uiDir));
    
    // Fallback route using direct RegExp to serve index.html for all non-API requests
    app.get(/^(?!\/api).*/, (req, res, next) => {
      const indexPath = path.join(uiDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  }

  let server = null;
  let dataVersion = 0;

  // SSE clients for live push
  const sseClients = new Set();

  function broadcastChange(channel) {
    dataVersion++;
    const msg = JSON.stringify({ type: 'data-changed', channel, version: dataVersion });
    for (const client of sseClients) {
      try {
        client.write(`data: ${msg}\n\n`);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  // ── Channel → repository method mapping ──
  function getHandler(channel) {
    const handlers = {
      'app:getMeta':                   (p) => repository.getAppMeta(),
      'lookups:get':                   (p) => repository.getLookups(),
      'settings:getTax':               (p) => repository.getTaxSettings(),
      'settings:saveTax':              (p) => repository.saveTaxSettings(p),
      'dashboard:getOverview':         (p) => repository.getDashboardSummary(p),
      'reports:getFinancialStatement': (p) => repository.getFinancialStatement(p),

      'products:list':       (p) => repository.listProducts(p),
      'products:save':       (p) => repository.saveProduct(p),
      'products:delete':     (p) => repository.deleteProduct(p),
      'products:bulkDelete': (p) => repository.bulkDeleteProducts(p),
      'products:getStock':   (p) => repository.getProductStock(p),
      'products:split':      (p) => repository.splitProduct(p.productId, p.quantity, p.laborCost, p.packagingCost, p.srp, p.batchId),
      'products:uploadPhotoFile': (p) => {
        const buffer = p.isBase64 ? Buffer.from(p.fileData, 'base64') : p.fileData;
        return repository.uploadPhotoFile(p.fileName, buffer);
      },

      'customers:list':       (p) => repository.listCustomers(p),
      'customers:save':       (p) => repository.saveCustomer(p),
      'customers:delete':     (p) => repository.deleteCustomer(p),
      'customers:bulkDelete': (p) => repository.bulkDeleteCustomers(p),

      'suppliers:list':       (p) => repository.listSuppliers(p),
      'suppliers:save':       (p) => repository.saveSupplier(p),
      'suppliers:delete':     (p) => repository.deleteSupplier(p),
      'suppliers:bulkDelete': (p) => repository.bulkDeleteSuppliers(p),

      'fct:list':       (p) => repository.listForeignCurrencyTransactions(p),
      'fct:save':       (p) => repository.saveForeignCurrencyTransaction(p),
      'fct:delete':     (p) => repository.deleteForeignCurrencyTransaction(p),
      'fct:bulkDelete': (p) => repository.bulkDeleteForeignCurrencyTransactions(p),

      'sales:list':       (p) => repository.listSales(p),
      'sales:save':       (p) => repository.saveSale(p),
      'sales:delete':     (p) => repository.deleteSale(p),
      'sales:bulkDelete': (p) => repository.bulkDeleteSales(p),
      'sales:get':        (p) => repository.getSaleById(p),

      'purchases:list':       (p) => repository.listPurchases(p),
      'purchases:save':       (p) => repository.savePurchase(p),
      'purchases:delete':     (p) => repository.deletePurchase(p),
      'purchases:bulkDelete': (p) => repository.bulkDeletePurchases(p),

      'app:analyzeExcel': (p) => {
        if (p.fileData) {
          return repository.analyzeExcelFile(p.fileData, true);
        }
        return repository.analyzeExcelFile(p.filePath);
      },
      'sales:importExcel': (p) => {
        if (p.fileData) {
          return repository.importSalesFromExcel(p.fileData, p.selectedSheetNames, true);
        }
        return repository.importSalesFromExcel(p.filePath, p.selectedSheetNames);
      },
      'sales:importCsv': (p) => repository.importSalesFromCsv(p.csvContent),
      'sales:exportExcel':             (p) => repository.exportSalesToExcel(p?.filePath),
      'reports:exportFinancialStatementExcel': (p) => repository.exportFinancialStatementToExcel(p?.filePath, p?.filters),
      'app:exportFullExcel':           (p) => repository.exportFullToExcel(p?.filePath, { fromDate: p?.fromDate, toDate: p?.toDate }),
      'products:exportExcel':          (p) => repository.exportProductsToExcel(p?.filePath),
      'purchases:exportExcel':         (p) => repository.exportPurchasesToExcel(p?.filePath),
      'customers:exportExcel':         (p) => repository.exportCustomersToExcel(p?.filePath),
    };

    return handlers[channel] || null;
  }

  const WRITE_CHANNELS = new Set([
    'settings:saveTax',
    'products:save', 'products:delete', 'products:bulkDelete', 'products:split', 'products:uploadPhotoFile',
    'customers:save', 'customers:delete', 'customers:bulkDelete',
    'suppliers:save', 'suppliers:delete', 'suppliers:bulkDelete',
    'sales:save', 'sales:delete', 'sales:bulkDelete', 'sales:importCsv', 'sales:importExcel',
    'purchases:save', 'purchases:delete', 'purchases:bulkDelete',
    'fct:save', 'fct:delete', 'fct:bulkDelete',
  ]);

  // Channels that should NOT be served over network
  const LOCAL_ONLY_CHANNELS = new Set([
    'app:saveFileDialog', 'app:openFileDialog', 'app:writeFile', 'app:readFile',
    'app:openPath', 'app:openDataFolder',
    'products:uploadPhoto',
  ]);

  // ── Routes ──

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      name: 'AgriLedger Sync Server',
      version: dataVersion,
      hostname: os.hostname(),
      platform: process.platform
    });
  });

  app.get('/api/version', (_req, res) => {
    res.json({ version: dataVersion });
  });

  // SSE endpoint for live push notifications
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', version: dataVersion })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // Single RPC endpoint — mirrors all IPC handlers
  app.post('/api/rpc', async (req, res) => {
    const { channel, payload } = req.body;

    if (!channel) {
      return res.status(400).json({ error: 'Missing channel' });
    }

    if (LOCAL_ONLY_CHANNELS.has(channel)) {
      return res.status(403).json({ error: 'This operation is only available on the host computer.' });
    }

    const handler = getHandler(channel);
    if (!handler) {
      return res.status(404).json({ error: `Unknown channel: ${channel}` });
    }

    try {
      const result = await handler(payload);

      // Broadcast change for write operations
      if (WRITE_CHANNELS.has(channel)) {
        broadcastChange(channel);
      }

      res.json({ result: result ?? null });
    } catch (err) {
      console.error(`[sync-server] RPC error on ${channel}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Server lifecycle ──

  return {
    start(port = 3847) {
      return new Promise((resolve, reject) => {
        server = http.createServer(app);
        server.listen(port, () => {
          console.log(`[sync-server] Listening on wildcard port ${port}`);
          resolve(port);
        });
        server.on('error', (err) => {
          console.error('[sync-server] Failed to start:', err.message);
          reject(err);
        });
      });
    },

    stop() {
      return new Promise((resolve) => {
        if (!server) return resolve();
        // Close all SSE connections
        for (const client of sseClients) {
          try { client.end(); } catch { /* ignore */ }
        }
        sseClients.clear();
        server.close(() => {
          server = null;
          resolve();
        });
      });
    },

    get isRunning() {
      return server !== null && server.listening;
    },

    get connectedClients() {
      return sseClients.size;
    },

    broadcastChange
  };
}

/**
 * Returns the local IP address, prioritizing physical Wi-Fi and Ethernet adapters
 * and avoiding virtual adapters (e.g. VirtualBox, VMware, WSL).
 */
export function getLanIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal) {
        candidates.push({ name: name.toLowerCase(), address: iface.address });
      }
    }
  }

  if (candidates.length === 0) {
    return '127.0.0.1';
  }

  // Prioritize active physical interfaces (Wi-Fi, Ethernet, macOS en0/en1, etc.)
  const preferredKeywords = ['wi-fi', 'wifi', 'wlan', 'ethernet', 'local area connection', 'en0', 'en1'];
  for (const keyword of preferredKeywords) {
    const match = candidates.find(c => c.name.includes(keyword));
    if (match) {
      return match.address;
    }
  }

  // Filter out known virtual/host-only network adapters
  const virtualKeywords = ['virtual', 'vbox', 'vmware', 'vethernet', 'host-only', 'pseudo', 'loopback', 'wsl'];
  const physicalCandidates = candidates.filter(c => 
    !virtualKeywords.some(keyword => c.name.includes(keyword))
  );

  if (physicalCandidates.length > 0) {
    return physicalCandidates[0].address;
  }

  return candidates[0].address;
}
