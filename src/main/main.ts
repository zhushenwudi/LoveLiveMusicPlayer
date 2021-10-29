/* eslint global-require: off, no-console: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `yarn build` or `yarn build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import path from 'path';
import {app, BrowserWindow, ipcMain, shell, dialog} from 'electron';
import {autoUpdater} from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import {portIsOccupied, resolveHtmlPath} from './util';

const httpserver = require('http-server');

// 当前HTTP服务是否开启
let isHttpServerOpen = false
// http-server实例
let mServer: any

export default class AppUpdater {
    constructor() {
        log.transports.file.level = 'info';
        autoUpdater.logger = log;
        autoUpdater.checkForUpdatesAndNotify();
    }
}

let mainWindow: BrowserWindow | null = null;

// 开启HTTP服务 或 切换端口重启服务
ipcMain.handle('openHttp', async (event, arg) => {
    const [rootDir, port] = arg
    // 获取可用端口号
    portIsOccupied(port).then(port => {
        // 服务已被打开的话要先释放再开启
        if (isHttpServerOpen) {
            mServer.close()
        }
        console.log("start http-server")
        // 创建HTTP服务(禁用缓存)
        mServer = httpserver.createServer({root: rootDir, cache: -1})
        mServer.listen(port)
        isHttpServerOpen = true
        event.sender.send("openHttpReply", port)
    })
})

/**
 * 创建多态弹窗
 * @param args[0] "none", "info", "error", "question", "warning"
 * @param args[1] message
 */
ipcMain.on('msgDialog', (event, args) => {
    let title = ""
    switch (args.type) {
        case "info":
            title = "提示"
            break
        case "error":
            title = "错误"
            break
        case "question":
            title = "请示"
            break
        case "warning":
            title = "警告"
            break
        default:
            break
    }
    dialog.showMessageBox({
        type: args.type,// 图标类型
        title: title,// 信息提示框标题
        message: args.message,// 信息提示框内容
        buttons: ["知道了"],// 下方显示的按钮
        noLink: true, // win下的样式
        // icon:nativeImage.createFromPath("./icon/png.png"),// 图标
        // cancelId: 1// 点击x号关闭返回值
    }).then(index => {
        event.sender.send("msgDialogCallback", index)
    })
})

// 打开一个获取文件的窗口
ipcMain.handle("fileDialog", (_event, _args) => {
    dialog.showOpenDialogSync({properties: ['openFile', 'multiSelections']})
})

if (process.env.NODE_ENV === 'production') {
    const sourceMapSupport = require('source-map-support');
    sourceMapSupport.install();
}

const isDevelopment =
    process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDevelopment) {
    require('electron-debug')();
}

const installExtensions = async () => {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS'];

    return installer
        .default(
            extensions.map((name) => installer[name]),
            forceDownload
        )
        .catch(console.log);
};

const createWindow = async () => {
    if (
        process.env.NODE_ENV === 'development' ||
        process.env.DEBUG_PROD === 'true'
    ) {
        await installExtensions();
    }

    const RESOURCES_PATH = app.isPackaged
        ? path.join(process.resourcesPath, 'assets')
        : path.join(__dirname, '../../assets');

    const getAssetPath = (...paths: string[]): string => {
        return path.join(RESOURCES_PATH, ...paths);
    };

    mainWindow = new BrowserWindow({
        show: false,
        width: 1025,
        height: 728,
        titleBarStyle: 'customButtonsOnHover',
        frame: false,
        minWidth: 1025,
        minHeight: 728,
        icon: getAssetPath('icon.png'),
        webPreferences: {
            // preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            nodeIntegrationInWorker: false,
            contextIsolation: false,
        },
    });

    mainWindow.loadURL(resolveHtmlPath('index.html'));

    // @TODO: Use 'ready-to-show' event
    //        https://github.com/electron/electron/blob/main/docs/api/browser-window.md#using-ready-to-show-event
    mainWindow.webContents.on('did-finish-load', () => {
        if (!mainWindow) {
            throw new Error('"mainWindow" is not defined');
        }
        if (process.env.START_MINIMIZED) {
            mainWindow.minimize();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    const menuBuilder = new MenuBuilder(mainWindow);
    menuBuilder.buildMenu();

    // Open urls in the user's browser
    mainWindow.webContents.on('new-window', (event, url) => {
        event.preventDefault();
        shell.openExternal(url);
    });

    // Remove this if your app does not use auto updates
    // eslint-disable-next-line
    new AppUpdater();
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

app.whenReady().then(createWindow).catch(console.log);

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) createWindow();
});
