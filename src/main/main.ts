
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { app, globalShortcut, ipcMain } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import ElectronStore from 'electron-store';
import { mainZustandBridge } from 'zutron/main';

import * as env from '@main/env';
import { logger } from '@main/logger';
import {
  LauncherWindow,
  createMainWindow,
  createSettingsWindow,
} from '@main/window/index';

import { store } from './store/create';
import { createTray } from './tray';
import { startApiServer } from './api';

const { isProd } = env;

app.commandLine.appendSwitch('force-renderer-accessibility');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (squirrelStartup) {
  app.quit();
}

logger.debug('[env]', env);

ElectronStore.initRenderer();

class AppUpdater {
  constructor() {
    // autoUpdater.logger = logger;
    // autoUpdater.checkForUpdatesAndNotify();
  }
}

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

if (isProd) {
  import('source-map-support').then(({ default: sourceMapSupport }) => {
    sourceMapSupport.install();
  });
}

const loadDevDebugTools = async () => {
  import('electron-debug').then(({ default: electronDebug }) => {
    electronDebug({ showDevTools: false });
  });

  import('electron-devtools-installer')
    .then(({ default: installExtensionDefault, REACT_DEVELOPER_TOOLS }) => {
      // @ts-ignore
      const installExtension = installExtensionDefault?.default;
      const extensions = [installExtension(REACT_DEVELOPER_TOOLS)];

      return Promise.all(extensions)
        .then((names) => logger.info('Added Extensions:', names.join(', ')))
        .catch((err) =>
          logger.error('An error occurred adding extension:', err),
        );
    })
    .catch(logger.error);
};

const initializeApp = async () => {
  try {
    // Start API server first
    logger.info('[Main] Starting API server...');
    const server = await startApiServer();
    logger.info('[Main] API Server started successfully');

    // Cleanup API server on quit
    app.on('before-quit', () => {
      logger.info('[Main] Closing API server...');
      server.close(() => {
        logger.info('[Main] API server closed');
      });
    });

    const isAccessibilityEnabled = app.isAccessibilitySupportEnabled();
    logger.info('isAccessibilityEnabled', isAccessibilityEnabled);
    if (env.isMacOS) {
      app.setAccessibilitySupportEnabled(true);
      const { ensurePermissions } = await import('@main/utils/systemPermissions');

      const ensureScreenCapturePermission = ensurePermissions();
      logger.info('ensureScreenCapturePermission', ensureScreenCapturePermission);
    }

    // if (isDev) {
    await loadDevDebugTools();
    // }

    logger.info('createTray');
    // Tray
    await createTray();

    const launcherWindowIns = LauncherWindow.getInstance();

    globalShortcut.register('Alt+T', () => {
      launcherWindowIns.show();
    });

    logger.info('createMainWindow');
    const mainWindow = createMainWindow();
    const settingsWindow = createSettingsWindow({
      showInBackground: true,
    });

    // Remove this if your app does not use auto updates
    // eslint-disable-next-line
    new AppUpdater();

    logger.info('mainZustandBridge');

    const { unsubscribe } = mainZustandBridge(
      ipcMain,
      store,
      [
        mainWindow,
        settingsWindow,
        ...(launcherWindowIns.getWindow()
          ? [launcherWindowIns.getWindow()!]
          : []),
      ],
      {
        // reducer: rootReducer,
      },
    );

    app.on('quit', unsubscribe);

    logger.info('initializeApp end');
  } catch (error) {
    logger.error('[Main] Initialization error:', error);
    app.quit();
  }
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(async () => {
    electronApp.setAppUserModelId('com.electron');

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    await initializeApp();

    logger.info('app.whenReady end');
  })
  .catch(console.log);
