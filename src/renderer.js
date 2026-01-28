const { ipcRenderer } = require('electron');

const loginView = document.getElementById('login-view');
const mainView = document.getElementById('main-view');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const syncBtn = document.getElementById('sync-btn');
const userEmailSpan = document.getElementById('user-email');
const statusBadge = document.getElementById('status-badge');
const machineList = document.getElementById('machine-list');
const logBox = document.getElementById('log-box');

const serverUrlInput = document.getElementById('server-url');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

let logs = [];

async function init() {
  const config = await ipcRenderer.invoke('get-config');
  
  serverUrlInput.value = config.serverUrl || '';
  
  if (config.isConnected) {
    showMainView(config);
  } else {
    showLoginView();
  }
}

function showLoginView() {
  loginView.classList.add('active');
  mainView.classList.remove('active');
}

function showMainView(config) {
  loginView.classList.remove('active');
  mainView.classList.add('active');
  
  userEmailSpan.textContent = config.userEmail || '-';
  
  if (config.machines) {
    renderMachines(config.machines);
  }
}

function renderMachines(machines) {
  const entries = Object.entries(machines);
  
  if (entries.length === 0) {
    machineList.innerHTML = `
      <p style="color: #666; font-size: 13px; text-align: center; padding: 20px;">
        No hay máquinas configuradas
      </p>
    `;
    return;
  }
  
  machineList.innerHTML = entries.map(([id, machine]) => `
    <div class="machine-item" data-id="${id}">
      <div class="machine-info">
        <h4>${machine.nombre}</h4>
        <p>${machine.marca}</p>
        <div class="machine-folder ${machine.carpetaDestino ? '' : 'not-set'}">
          ${machine.carpetaDestino || 'Sin carpeta configurada'}
        </div>
      </div>
      <button class="btn btn-secondary btn-folder" onclick="selectFolder('${id}')">
        Carpeta
      </button>
    </div>
  `).join('');
}

async function selectFolder(machineId) {
  const folder = await ipcRenderer.invoke('select-folder');
  
  if (folder) {
    const result = await ipcRenderer.invoke('set-machine-folder', {
      machineId,
      folder
    });
    
    if (result.success) {
      const config = await ipcRenderer.invoke('get-config');
      renderMachines(config.machines);
    }
  }
}

window.selectFolder = selectFolder;

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  loginBtn.disabled = true;
  loginBtn.textContent = 'Conectando...';
  loginError.textContent = '';
  
  const result = await ipcRenderer.invoke('login', {
    email: emailInput.value,
    password: passwordInput.value,
    serverUrl: serverUrlInput.value
  });
  
  loginBtn.disabled = false;
  loginBtn.textContent = 'Conectar';
  
  if (result.success) {
    const config = await ipcRenderer.invoke('get-config');
    showMainView(config);
  } else {
    loginError.textContent = result.error || 'Error de conexión';
  }
});

logoutBtn.addEventListener('click', async () => {
  await ipcRenderer.invoke('logout');
  showLoginView();
  passwordInput.value = '';
});

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Sincronizando...';
  
  await ipcRenderer.invoke('sync-machines');
  
  const config = await ipcRenderer.invoke('get-config');
  renderMachines(config.machines);
  
  syncBtn.disabled = false;
  syncBtn.textContent = 'Sincronizar';
});

function addLog(log) {
  logs.unshift(log);
  if (logs.length > 50) logs.pop();
  
  const time = new Date(log.timestamp).toLocaleTimeString();
  const typeClass = `log-${log.type}`;
  
  logBox.innerHTML = logs.map(l => {
    const t = new Date(l.timestamp).toLocaleTimeString();
    return `
      <div class="log-entry">
        <span class="log-time">${t}</span>
        <span class="log-${l.type}">${l.message}</span>
      </div>
    `;
  }).join('');
}

ipcRenderer.on('log', (event, log) => {
  addLog(log);
});

ipcRenderer.on('machines-synced', (event, machines) => {
  renderMachines(machines);
});

ipcRenderer.on('job-completed', (event, { fileName, folder }) => {
  addLog({
    timestamp: Date.now(),
    type: 'info',
    message: `Archivo entregado: ${fileName}`
  });
});

init();
