/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { resolveHtmlPath } from './util';

let mainWindow: BrowserWindow | null = null;
let splashScreen: BrowserWindow | null = null;

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../../assets');

const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.webContents.once('did-finish-load', () => {
    // The port is returned by a function on the original code.
    mainWindow?.webContents.send('set-server-port', 1234);
  });

  mainWindow.on('ready-to-show', () => {
    splashScreen?.destroy();
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }

    mainWindow.minimize();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(resolveHtmlPath('index.html'));
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Fake for this test project
async function executeBackend(): Promise<[boolean, string]> {
  await sleep(3000);
  return [true, ''];
}

function menuTemplateFactory(window: BrowserWindow) {
  return [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open EcuExtract File',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            window.webContents.send('open-file', 1);
          },
        },
      ],
    },
  ];
}

async function createSplashWindow() {
  splashScreen = new BrowserWindow({
    width: 1024,
    height: 300,
    transparent: true,
    frame: false,
    show: false,
    icon: getAssetPath('images/icon.ico'),
  });

  splashScreen.once('ready-to-show', async () => {
    splashScreen!.center();
    splashScreen!.show();
    const [backendStarted, message] = await executeBackend();
    if (!backendStarted) {
      await dialog.showMessageBox({ message });
      app.quit();
      return;
    }

    await createWindow();
    const menuTemplate = menuTemplateFactory(mainWindow!);
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
  });

  const splashPath = getAssetPath('icon.png');
  await splashScreen.loadFile(splashPath);
}

// Fake for this test project
function getServerPort() {
  return 1234;
}

/**
 * Add event listeners...
 */

app.on('ready', async () => {
  await createSplashWindow();
  ipcMain.handle('get-server-port', () => getServerPort());
  ipcMain.on('show-item-in-folder', (event, item) => {
    shell.showItemInFolder(item);
  });
  ipcMain.on('shell.open-external', (event, url) => {
    shell.openExternal(url);
  });
  ipcMain.on('show-alert', (event, msg) => {
    dialog.showMessageBox({ title: app.getName(), message: msg });
  });
});

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (!mainWindow) {
    const [backendStarted, message] = await executeBackend();
    if (!backendStarted) {
      dialog.showMessageBoxSync({ message });
      app.quit();
      return;
    }
    await createWindow();
  }
});
