import { autoUpdater } from 'electron-updater';
import { app, ipcMain, BrowserWindow } from 'electron';

// Configure updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

export function initAutoUpdater(mainWindow: BrowserWindow): void {
    const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

    // Initial check (delayed to not slow startup)
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch(() => {});
    }, 30_000);

    // Periodic check
    setInterval(() => {
        autoUpdater.checkForUpdates().catch(() => {});
    }, CHECK_INTERVAL);

    // Event handlers — forward to renderer
    autoUpdater.on('update-available', (info) => {
        console.log('[Updater] Update available:', info.version);
        mainWindow.webContents.send('update:available', {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes,
        });
    });

    autoUpdater.on('update-not-available', () => {
        console.log('[Updater] No update available');
    });

    autoUpdater.on('download-progress', (progress) => {
        mainWindow.webContents.send('update:progress', {
            percent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            total: progress.total,
            transferred: progress.transferred,
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[Updater] Update downloaded:', info.version);
        mainWindow.webContents.send('update:downloaded', {
            version: info.version,
        });
    });

    autoUpdater.on('error', (err) => {
        console.error('[Updater] Error:', err.message);
        // Don't forward to renderer — user doesn't need to see update errors
    });

    // IPC handlers for renderer control
    ipcMain.handle('update:check', async () => {
        try {
            const result = await autoUpdater.checkForUpdates();
            return { updateAvailable: !!result?.updateInfo };
        } catch {
            return { updateAvailable: false };
        }
    });

    ipcMain.handle('update:download', async () => {
        try {
            await autoUpdater.downloadUpdate();
            return { success: true };
        } catch {
            return { success: false, error: 'Download failed' };
        }
    });

    ipcMain.handle('update:install', () => {
        autoUpdater.quitAndInstall(false, true);
    });

    ipcMain.handle('update:getVersion', () => {
        return app.getVersion();
    });
}
