import { contextBridge, ipcRenderer } from 'electron';

// ── Connection state (lives in the preload's isolated world) ──
let _serverUrl = null;
let _eventSource = null;
let _onDataChanged = null;
let _onConnectionStatusChange = null;
let _reconnectTimer = null;
let _connected = false;

// ── Channels that only work on the host (file system operations) ──
const LOCAL_ONLY_CHANNELS = new Set([
  'app:saveFileDialog', 'app:openFileDialog', 'app:writeFile', 'app:readFile',
  'app:openPath', 'app:openDataFolder',
  'products:uploadPhoto',
]);

// ── HTTP-based invoke for client mode ──
async function httpInvoke(channel, payload) {
  const res = await fetch(`${_serverUrl}/api/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, payload })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Network request failed (${res.status})`);
  }

  return data.result;
}

// ── Smart invoke: routes to IPC (host) or HTTP (client) ──
function invoke(channel, payload) {
  if (_serverUrl) {
    // Client mode — route over HTTP
    if (LOCAL_ONLY_CHANNELS.has(channel)) {
      return Promise.reject(new Error('This feature is only available on the host computer.'));
    }
    return httpInvoke(channel, payload);
  }
  // Host mode — use standard IPC
  return ipcRenderer.invoke(channel, payload);
}

// ── SSE connection for live updates ──
function connectSSE(url) {
  if (_eventSource) {
    _eventSource.close();
    _eventSource = null;
  }

  const sseUrl = `${url}/api/events`;

  try {
    _eventSource = new EventSource(sseUrl);

    _eventSource.onopen = () => {
      _connected = true;
      if (_onConnectionStatusChange) _onConnectionStatusChange({ connected: true, url });
    };

    _eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data-changed' && _onDataChanged) {
          _onDataChanged(msg);
        }
      } catch { /* ignore parse errors */ }
    };

    _eventSource.onerror = () => {
      _connected = false;
      if (_onConnectionStatusChange) _onConnectionStatusChange({ connected: false, url });

      // EventSource auto-reconnects, but if it keeps failing, we should report
      if (_eventSource?.readyState === 2) {
        // CLOSED — attempt manual reconnect after delay
        _eventSource.close();
        _eventSource = null;
        if (_serverUrl) {
          clearTimeout(_reconnectTimer);
          _reconnectTimer = setTimeout(() => {
            if (_serverUrl) connectSSE(_serverUrl);
          }, 3000);
        }
      }
    };
  } catch (err) {
    console.error('[preload] Failed to connect SSE:', err);
  }
}

// ── Connect to a remote host ──
async function connectToHost(url) {
  const cleanUrl = url.replace(/\/+$/, '');

  // Verify the host is reachable
  try {
    const res = await fetch(`${cleanUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('Host not reachable');
    const data = await res.json();
    if (data.status !== 'ok') throw new Error('Invalid server response');
  } catch (err) {
    throw new Error(`Cannot connect to ${cleanUrl}: ${err.message}`);
  }

  _serverUrl = cleanUrl;
  _connected = true;
  connectSSE(cleanUrl);

  if (_onConnectionStatusChange) _onConnectionStatusChange({ connected: true, url: cleanUrl });

  return { connected: true, url: cleanUrl };
}

// ── Disconnect from remote host ──
function disconnectFromHost() {
  _serverUrl = null;
  _connected = false;

  if (_eventSource) {
    _eventSource.close();
    _eventSource = null;
  }

  clearTimeout(_reconnectTimer);
  if (_onConnectionStatusChange) _onConnectionStatusChange({ connected: false, url: null });

  return { connected: false, url: null };
}

// ── Resolve a photo path to a URL (Host vs Client) ──
function resolvePhotoUrl(photoPath) {
  if (!photoPath) return '';
  if (_serverUrl) {
    // Client mode — extract filename and point to host server
    const filename = photoPath.split(/[/\\]/).pop();
    return `${_serverUrl}/api/photos/${filename}`;
  }
  // Host mode — use local file protocol
  return `file://${photoPath}`;
}

// ── Expose API to renderer ──
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
    uploadPhotoFile: (payload) => {
      let fileData = payload.fileData;
      if (fileData instanceof ArrayBuffer) {
        let binary = '';
        const bytes = new Uint8Array(fileData);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        fileData = window.btoa(binary);
      }
      return invoke('products:uploadPhotoFile', {
        fileName: payload.fileName,
        fileData,
        isBase64: true
      });
    },
    getStock: (productId) => invoke('products:getStock', productId),
    split: (payload) => invoke('products:split', payload)
  },
  customers: {
    list: (filters) => invoke('customers:list', filters),
    save: (payload) => invoke('customers:save', payload),
    delete: (id) => invoke('customers:delete', id),
    bulkDelete: (ids) => invoke('customers:bulkDelete', ids)
  },
  suppliers: {
    list: (filters) => invoke('suppliers:list', filters),
    save: (payload) => invoke('suppliers:save', payload),
    delete: (id) => invoke('suppliers:delete', id),
    bulkDelete: (ids) => invoke('suppliers:bulkDelete', ids)
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
  sync: {
    getServerInfo: () => ipcRenderer.invoke('sync:getServerInfo'),
    toggleServer: (enabled) => ipcRenderer.invoke('sync:toggleServer', enabled),
    connectToHost: (url) => connectToHost(url),
    disconnectFromHost: () => disconnectFromHost(),
    resolvePhotoUrl: (path) => resolvePhotoUrl(path),
    getConnectionStatus: () => ({ connected: _connected, url: _serverUrl, isClientMode: !!_serverUrl }),
    onDataChanged: (callback) => { _onDataChanged = callback; },
    onConnectionStatusChange: (callback) => { _onConnectionStatusChange = callback; }
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
  fct: {
    list: (filters) => invoke('fct:list', filters),
    save: (payload) => invoke('fct:save', payload),
    delete: (id) => invoke('fct:delete', id),
    bulkDelete: (ids) => invoke('fct:bulkDelete', ids)
  },
  reports: {
    getFinancialStatement: (filters) => invoke('reports:getFinancialStatement', filters),
    exportFinancialStatementExcel: (options) => invoke('reports:exportFinancialStatementExcel', options)
  }
});
