const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

const store = new Store({
  defaults: {
    serverUrl: 'https://industria.app',
    authToken: null,
    userEmail: null,
    machines: {},
    pollingInterval: 5000,
    autoStart: true,
    minimizeToTray: true
  }
});

let mainWindow = null;
let tray = null;
let pollingTimer = null;
let licenseCheckTimer = null;
let updateCheckTimer = null;
let isPolling = false;
let licenseStatus = { activa: false, estado: 'desconocido', mensaje: '' };
let latestVersion = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setMenuBarVisibility(false);

    mainWindow.on('close', (event) => {
    if (!app.isQuitting && store.get('minimizeToTray')) {
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/icon.png');
  let trayIcon;
  
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createEmpty();
    }
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  
  updateTrayMenu();
  
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
}

function updateTrayMenu() {
  const isConnected = !!store.get('authToken');
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: `IndustrIA Bridge v${app.getVersion()}`,
      enabled: false 
    },
    { type: 'separator' },
    { 
      label: isConnected ? `Conectado: ${store.get('userEmail')}` : 'No conectado',
      enabled: false 
    },
    { 
      label: isPolling ? 'Buscando trabajos...' : 'En espera',
      enabled: false 
    },
    { type: 'separator' },
    { 
      label: 'Abrir Panel',
      click: () => mainWindow?.show()
    },
    { 
      label: 'Ver Logs',
      click: () => shell.openPath(getLogPath())
    },
    { type: 'separator' },
    { 
      label: 'Salir',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray?.setContextMenu(contextMenu);
  tray?.setToolTip(`IndustrIA Bridge - ${isConnected ? 'Conectado' : 'Desconectado'}`);
}

function getLogPath() {
  const logDir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return path.join(logDir, 'bridge.log');
}

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
  
  const logPath = getLogPath();
  fs.appendFileSync(logPath, logLine);
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', { timestamp, type, message });
  }
}

async function fetchWithAuth(endpoint, options = {}) {
  const serverUrl = store.get('serverUrl');
  const authToken = store.get('authToken');
  
  if (!authToken) {
    throw new Error('No autenticado');
  }
  
  const response = await fetch(`${serverUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...options.headers
    }
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      store.set('authToken', null);
      updateTrayMenu();
      throw new Error('Sesión expirada');
    }
    throw new Error(`Error ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

async function checkLicense() {
  if (!store.get('authToken')) {
    licenseStatus = { activa: false, estado: 'no_autenticado', mensaje: 'Inicia sesión primero' };
    return false;
  }
  
  try {
    const wasActive = licenseStatus.activa;
    const result = await fetchWithAuth('/api/cnc/puente/licencia');
    licenseStatus = result;
    
    if (!result.activa) {
      log(`Licencia no activa: ${result.mensaje}`, 'warn');
      stopPolling();
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('license-expired', result);
      }
    } else if (!wasActive && result.activa) {
      log('Licencia reactivada, reiniciando polling', 'info');
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('license-activated', result);
      }
      
      await syncMachines();
      
      if (!pollingTimer) {
        startPolling();
      }
    }
    
    return result.activa;
  } catch (error) {
    log(`Error verificando licencia: ${error.message}`, 'error');
    licenseStatus = { activa: false, estado: 'error', mensaje: error.message };
    return false;
  }
}

function startLicenseCheck() {
  if (licenseCheckTimer) {
    clearInterval(licenseCheckTimer);
  }
  
  checkLicense();
  
  licenseCheckTimer = setInterval(checkLicense, 60 * 60 * 1000);
  
  log('Verificación de licencia iniciada (cada 1 hora)');
}

function stopLicenseCheck() {
  if (licenseCheckTimer) {
    clearInterval(licenseCheckTimer);
    licenseCheckTimer = null;
  }
}

function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  
  return 0;
}

async function checkForUpdates() {
  try {
    const serverUrl = store.get('serverUrl');
    const currentVersion = app.getVersion();
    
    const response = await fetch(`${serverUrl}/api/cnc/puente/version`);
    
    if (!response.ok) {
      log('No se pudo verificar actualizaciones', 'warn');
      return null;
    }
    
    const versionInfo = await response.json();
    latestVersion = versionInfo;
    
    if (compareVersions(versionInfo.version, currentVersion) > 0) {
      log(`Nueva versión disponible: ${versionInfo.version} (actual: ${currentVersion})`);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', {
          currentVersion,
          newVersion: versionInfo.version,
          releaseNotes: versionInfo.releaseNotes,
          downloadUrl: `${serverUrl}${versionInfo.downloadUrl}`
        });
      }
      
      const notification = {
        title: 'Actualización disponible',
        body: `Nueva versión ${versionInfo.version} disponible. Haz clic para actualizar.`
      };
      
      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        const notif = new Notification(notification);
        notif.on('click', () => {
          mainWindow?.show();
        });
        notif.show();
      }
      
      return versionInfo;
    } else {
      log(`Versión actual (${currentVersion}) está actualizada`);
    }
    
    return null;
  } catch (error) {
    log(`Error verificando actualizaciones: ${error.message}`, 'error');
    return null;
  }
}

function startUpdateCheck() {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
  }
  
  setTimeout(checkForUpdates, 10000);
  
  updateCheckTimer = setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
  
  log('Verificación de actualizaciones iniciada (cada 6 horas)');
}

function stopUpdateCheck() {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
}

async function pollForJobs() {
  if (!store.get('authToken')) {
    return;
  }
  
  if (!licenseStatus.activa) {
    log('Polling omitido: licencia no activa', 'warn');
    return;
  }
  
  isPolling = true;
  updateTrayMenu();
  
  try {
    const jobs = await fetchWithAuth('/api/cnc/puente/trabajos');
    
    if (jobs && jobs.length > 0) {
      log(`Encontrados ${jobs.length} trabajo(s) pendiente(s)`);
      
      for (const job of jobs) {
        await processJob(job);
      }
    }
  } catch (error) {
    log(`Error al buscar trabajos: ${error.message}`, 'error');
  } finally {
    isPolling = false;
    updateTrayMenu();
  }
}

async function processJob(job) {
  try {
    const machines = store.get('machines') || {};
    const machineConfig = machines[job.maquinaId];
    
    if (!machineConfig || !machineConfig.carpetaDestino) {
      log(`Máquina ${job.maquinaId} no tiene carpeta configurada, omitiendo`, 'warn');
      return;
    }
    
    const destFolder = machineConfig.carpetaDestino;
    
    if (!fs.existsSync(destFolder)) {
      try {
        fs.mkdirSync(destFolder, { recursive: true });
      } catch (e) {
        log(`No se pudo crear carpeta ${destFolder}: ${e.message}`, 'error');
        return;
      }
    }
    
    const filePath = path.join(destFolder, job.nombreArchivo);
    
    fs.writeFileSync(filePath, job.contenidoArchivo, 'utf8');
    
    log(`Archivo guardado: ${filePath}`);
    
    await fetchWithAuth(`/api/cnc/puente/trabajos/${job.id}/completar`, {
      method: 'POST'
    });
    
    log(`Trabajo ${job.id} completado`);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('job-completed', {
        fileName: job.nombreArchivo,
        folder: destFolder
      });
    }
    
  } catch (error) {
    log(`Error procesando trabajo ${job.id}: ${error.message}`, 'error');
  }
}

async function syncMachines() {
  try {
    const machinesFromServer = await fetchWithAuth('/api/cnc/puente/configuracion');
    const localMachines = store.get('machines') || {};
    
    for (const machine of machinesFromServer) {
      if (!localMachines[machine.id]) {
        localMachines[machine.id] = {
          nombre: machine.nombre,
          marca: machine.marca,
          carpetaDestino: machine.carpetaDestino || ''
        };
      } else {
        localMachines[machine.id].nombre = machine.nombre;
        localMachines[machine.id].marca = machine.marca;
        if (machine.carpetaDestino && !localMachines[machine.id].carpetaDestino) {
          localMachines[machine.id].carpetaDestino = machine.carpetaDestino;
        }
      }
    }
    
    store.set('machines', localMachines);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('machines-synced', localMachines);
    }
    
    log(`Sincronizadas ${machinesFromServer.length} máquina(s)`);
    
  } catch (error) {
    log(`Error sincronizando máquinas: ${error.message}`, 'error');
  }
}

function startPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
  }
  
  const interval = store.get('pollingInterval') || 5000;
  
  pollForJobs();
  
  pollingTimer = setInterval(pollForJobs, interval);
  
  log('Polling iniciado');
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    log('Polling detenido');
  }
}

ipcMain.handle('login', async (event, { email, password, serverUrl }) => {
  try {
    store.set('serverUrl', serverUrl || 'https://industria.app');
    
    const response = await fetch(`${store.get('serverUrl')}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Credenciales incorrectas');
    }
    
    const data = await response.json();
    
    store.set('authToken', data.token);
    store.set('userEmail', email);
    
    updateTrayMenu();
    log(`Usuario ${email} conectado`);
    
    const hasLicense = await checkLicense();
    
    if (!hasLicense) {
      return { 
        success: false, 
        error: licenseStatus.mensaje || 'Necesitas una licencia activa para usar la App Puente',
        licenseRequired: true
      };
    }
    
    startLicenseCheck();
    await syncMachines();
    startPolling();
    
    return { success: true, email, license: licenseStatus };
    
  } catch (error) {
    log(`Error de login: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('logout', async () => {
  stopPolling();
  stopLicenseCheck();
  store.set('authToken', null);
  store.set('userEmail', null);
  licenseStatus = { activa: false, estado: 'desconectado', mensaje: '' };
  updateTrayMenu();
  log('Usuario desconectado');
  return { success: true };
});

ipcMain.handle('get-license-status', () => {
  return licenseStatus;
});

ipcMain.handle('check-license', async () => {
  const isActive = await checkLicense();
  return { activa: isActive, ...licenseStatus };
});

ipcMain.handle('check-updates', async () => {
  const update = await checkForUpdates();
  return {
    hasUpdate: !!update,
    currentVersion: app.getVersion(),
    latestVersion: update?.version || app.getVersion(),
    downloadUrl: update ? `${store.get('serverUrl')}${update.downloadUrl}` : null
  };
});

ipcMain.handle('download-update', async () => {
  try {
    const serverUrl = store.get('serverUrl');
    const authToken = store.get('authToken');
    
    if (!authToken) {
      return { success: false, error: 'No autenticado' };
    }
    
    const downloadPath = path.join(app.getPath('downloads'), 'IndustrIA-Bridge-Update.zip');
    
    const response = await fetch(`${serverUrl}/api/cnc/puente/descargar`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
      return { success: false, error: error.mensaje || error.error || 'Error al descargar' };
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(downloadPath, Buffer.from(buffer));
    
    log(`Actualización descargada: ${downloadPath}`);
    
    shell.showItemInFolder(downloadPath);
    
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización descargada',
      message: 'La nueva versión se ha descargado correctamente.',
      detail: `Archivo: ${downloadPath}\n\nPara completar la actualización:\n1. Cierra esta aplicación\n2. Descomprime el ZIP descargado\n3. Reemplaza los archivos de la app\n4. Ejecuta npm install && npm start`,
      buttons: ['Entendido', 'Cerrar app ahora'],
      defaultId: 0
    });
    
    if (result.response === 1) {
      app.quit();
    }
    
    return { success: true, path: downloadPath };
  } catch (error) {
    log(`Error descargando actualización: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-version', () => {
  return {
    current: app.getVersion(),
    latest: latestVersion?.version || app.getVersion()
  };
});

ipcMain.handle('get-config', () => {
  return {
    serverUrl: store.get('serverUrl'),
    userEmail: store.get('userEmail'),
    isConnected: !!store.get('authToken'),
    machines: store.get('machines'),
    pollingInterval: store.get('pollingInterval'),
    autoStart: store.get('autoStart'),
    minimizeToTray: store.get('minimizeToTray')
  };
});

ipcMain.handle('set-machine-folder', async (event, { machineId, folder }) => {
  const machines = store.get('machines') || {};
  
  if (machines[machineId]) {
    machines[machineId].carpetaDestino = folder;
    store.set('machines', machines);
    log(`Carpeta configurada para máquina ${machineId}: ${folder}`);
    return { success: true };
  }
  
  return { success: false, error: 'Máquina no encontrada' };
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  
  return null;
});

ipcMain.handle('sync-machines', syncMachines);

ipcMain.handle('set-config', (event, config) => {
  if (config.pollingInterval) {
    store.set('pollingInterval', config.pollingInterval);
    if (store.get('authToken')) {
      startPolling();
    }
  }
  if (typeof config.autoStart === 'boolean') {
    store.set('autoStart', config.autoStart);
    app.setLoginItemSettings({ openAtLogin: config.autoStart });
  }
  if (typeof config.minimizeToTray === 'boolean') {
    store.set('minimizeToTray', config.minimizeToTray);
  }
  return { success: true };
});

app.whenReady().then(async () => {
  createWindow();
  createTray();
  
  startUpdateCheck();
  
  if (store.get('authToken')) {
    const hasLicense = await checkLicense();
    
    if (hasLicense) {
      startLicenseCheck();
      syncMachines();
      startPolling();
    } else {
      log('Licencia no activa al iniciar, esperando renovación', 'warn');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('license-expired', licenseStatus);
      }
    }
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (!store.get('minimizeToTray')) {
      app.quit();
    }
  }
});

app.on('before-quit', () => {
  stopPolling();
  stopLicenseCheck();
  stopUpdateCheck();
});
