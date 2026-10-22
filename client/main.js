const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const APP_ID = 'com.zhtvwn.gongshi.client';
const APP_TITLE = '公式手册';

let mainWindow = null;
let lastError = '';

// ---------- 本地配置 ----------
function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath(), 'utf-8'));
    return cfg && typeof cfg === 'object' ? cfg : {};
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf-8');
}

// ---------- 地址处理 ----------
function normalizeUrl(input) {
  let u = String(input || '').trim();
  if (!u) return '';
  u = u.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u;
}

function httpGet(urlStr, timeout = 6000) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch {
      return reject(new Error('地址格式不正确'));
    }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: (u.pathname || '/') + (u.search || ''),
        method: 'GET',
        timeout,
        headers: { 'User-Agent': 'gongshi-client' }
      },
      (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode || 0, body }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('连接超时')));
    req.on('error', reject);
    req.end();
  });
}

/** 连通性测试：优先 /api/health，兼容未升级的旧服务端 */
async function testConnection(rawUrl) {
  const base = normalizeUrl(rawUrl);
  if (!base) return { ok: false, message: '请输入 NAS 地址' };

  try {
    const r = await httpGet(base + '/api/health');
    if (r.status === 200) return { ok: true, url: base, message: '连接成功' };

    if (r.status === 404) {
      const old = await httpGet(base + '/api/stats');
      if (old.status === 200) return { ok: true, url: base, message: '连接成功（旧版服务端）' };
      return { ok: false, message: `地址可访问，但不是公式手册服务（HTTP ${r.status}）` };
    }
    return { ok: false, message: `服务返回 HTTP ${r.status}` };
  } catch (err) {
    return {
      ok: false,
      message: `无法连接：${err.message}。请确认 NAS 服务已启动、地址与端口正确、且客户端与 NAS 在同一网络。`
    };
  }
}

// ---------- 窗口 ----------
function loadSetupPage() {
  if (!mainWindow) return;
  mainWindow.setTitle(`${APP_TITLE} - 连接 NAS`);
  mainWindow.loadFile(path.join(__dirname, 'setup.html'));
}

function openNas(url) {
  if (!mainWindow) return;
  lastError = '';
  mainWindow.setTitle(APP_TITLE);
  mainWindow.loadURL(url).catch((err) => {
    lastError = err.message;
    loadSetupPage();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: APP_TITLE,
    backgroundColor: '#0f172a',
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => (mainWindow = null));

  // 远程页面加载失败（NAS 关机/地址变更）时自动回到配置页
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || !mainWindow) return;
    if (code === -3 || String(desc).includes('ERR_ABORTED')) return;
    if (String(validatedURL).startsWith('file:')) return;
    lastError = `无法访问 ${validatedURL}（${desc}）`;
    loadSetupPage();
  });

  // 外链用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && !url.startsWith('file:')) shell.openExternal(url);
    return { action: 'deny' };
  });

  const cfg = readConfig();
  if (cfg.nasUrl) openNas(cfg.nasUrl);
  else loadSetupPage();
}

// ---------- 菜单 ----------
function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '修改 NAS 地址', accelerator: 'CmdOrCtrl+,', click: () => loadSetupPage() },
        { label: '重新连接', accelerator: 'CmdOrCtrl+R', click: () => {
          const cfg = readConfig();
          if (cfg.nasUrl) openNas(cfg.nasUrl);
          else loadSetupPage();
        } },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '刷新', role: 'reload' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏切换', role: 'togglefullscreen' },
        { label: '开发者工具', role: 'toggleDevTools' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            const cfg = readConfig();
            dialog.showMessageBox({
              type: 'info',
              title: `关于 ${APP_TITLE}`,
              message: `${APP_TITLE} 客户端 v${app.getVersion()}`,
              detail: `当前 NAS 地址：${cfg.nasUrl || '未配置'}\n数据与服务由 NAS 提供，客户端仅作为访问入口。`
            });
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { label: `关于 ${APP_TITLE}`, role: 'about' },
        { type: 'separator' },
        { label: '服务', role: 'services' },
        { type: 'separator' },
        { label: '隐藏', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- IPC ----------
ipcMain.handle('config:get', () => ({ ...readConfig(), lastError }));

ipcMain.handle('config:test', (_e, url) => testConnection(url));

ipcMain.handle('config:connect', async (_e, url) => {
  const r = await testConnection(url);
  if (!r.ok) return r;
  const cfg = readConfig();
  cfg.nasUrl = r.url;
  cfg.updatedAt = new Date().toISOString();
  writeConfig(cfg);
  openNas(r.url);
  return r;
});

ipcMain.handle('config:forget', () => {
  const cfg = readConfig();
  delete cfg.nasUrl;
  writeConfig(cfg);
  loadSetupPage();
  return { ok: true };
});

ipcMain.handle('app:version', () => app.getVersion());

// ---------- 生命周期 ----------
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
