process.env.TZ = 'America/Caracas';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const { initDatabase } = require('./database/db');
const DatabaseService = require('./database/services/DatabaseService');
const LicenciaService = require('./database/services/LicenciaService');
const IPCHandlers = require('./ipc/handlers');

const PRELOAD_PATH = path.join(__dirname, 'preload.js');
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Finovixe',
    icon: path.join(__dirname, '../../build/icono.ico'),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const estaActivado = LicenciaService.verificarLicencia();

  if (estaActivado) {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/activacion.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      parent: mainWindow,
      modal: true,
      width: 350,
      height: 600,
      autoHideMenuBar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true,
        nodeIntegration: false
      }
    }
  }));

  mainWindow.maximize();
  mainWindow.focus();
}

ipcMain.handle('obtener-hwid', () => LicenciaService.getHWID());

ipcMain.handle('intentar-activacion', (_, llave) => {
  const exito = LicenciaService.activar(llave);
  if (exito) {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  return exito;
});

app.whenReady().then(async () => {
  await initDatabase();

  const actualizarTasaBCV = async () => {
    try {
      const modoActual = DatabaseService.obtener_config('modo_tasa');
      if (modoActual === 'Manual') return;

      const respuesta = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      const datos = await respuesta.json();
      if (datos?.promedio) {
        const tasa = parseFloat(Number(datos.promedio).toFixed(2));
        DatabaseService.actualizar_tasa_y_precios(tasa, false);
      }
    } catch {
      // Fallo silencioso; la tasa manual sigue vigente
    }
  };

  await actualizarTasaBCV();
  setInterval(actualizarTasaBCV, 2 * 60 * 60 * 1000);

  IPCHandlers.init();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('browser-window-focus', () => {
  mainWindow?.focus();
});