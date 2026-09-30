// ============================================================
//  Nuvyra-Craft — Main Process (Electron)
//  Handles: Window, IPC, Java process, file ops, backups
// ============================================================

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path   = require('path');
const fsSync = require('fs');
const fs     = require('fs').promises;
const os     = require('os');
const { spawn, exec, execFile } = require('child_process');
const net      = require('net');
const axios    = require('axios');
const archiver = require('archiver');
const { autoUpdater } = require('electron-updater');

// Low-end PC Optimizations
app.commandLine.appendSwitch('disable-gpu-vsync');
// Simple heuristic for very low-end systems
if (os.cpus().length <= 2) {
    app.disableHardwareAcceleration();
}

// ── GitHub & Update Configuration ───────────────────────────
// Centralized config for repository and auto-updates
const GITHUB_CONFIG = {
    owner: 'NuvyraHost',
    repo: 'Nuvyra-Craft',
    branch: 'main',
    get rawManifestUrl() {
        return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/update-check.json`;
    },
    get releasesUrl() {
        return `https://github.com/${this.owner}/${this.repo}/releases`;
    }
};

function isNewerVersion(remoteVer, currentVer) {
    if (!remoteVer || !currentVer) return false;
    const r = remoteVer.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const c = currentVer.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(r.length, c.length); i++) {
        const rv = r[i] || 0;
        const cv = c[i] || 0;
        if (rv > cv) return true;
        if (rv < cv) return false;
    }
    return false;
}

// ── Globals ─────────────────────────────────────────────────
let mainWindow     = null;
let serverProcess  = null;
let playitProcess  = null;
let installDir     = '';   // Root dir chosen by user
let currentServerDir = ''; // {installDir}/servers/{name}
let serverRunning  = false;
let portableJavaPath = '';  // Path to portable java.exe

// ── Create Window ───────────────────────────────────────────
function createWindow() {
    const splash = new BrowserWindow({
        width: 500,
        height: 350,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        show: false,
        icon: path.join(__dirname, 'assets', 'logo.png'),
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    splash.loadFile(path.join(__dirname, 'src', 'splash.html'));
    splash.once('ready-to-show', () => splash.show());

    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        backgroundColor: '#0a0a12',
        backgroundThrottling: true,
        show: false,
        icon: path.join(__dirname, 'assets', 'logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            devTools: !app.isPackaged
        }
    });

    if (app.isPackaged) {
        mainWindow.webContents.on('devtools-opened', () => {
            mainWindow.webContents.closeDevTools();
        });
    }

    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
    
    mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
            mainWindow.show();
            let opacity = 1;
            const fadeOut = setInterval(() => {
                opacity -= 0.05;
                if (opacity <= 0) {
                    clearInterval(fadeOut);
                    splash.close();
                } else {
                    splash.setOpacity(opacity);
                }
            }, 20); // 400ms fade-out overlap
        }, 2200);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    // ── Auto Updater & Live GitHub Sync Engine ───────────────────
    async function checkForUpdatesDirect() {
        try {
            const local = await getLocalManifest();
            const localCode = parseInt(local.versionCode || 100, 10);
            const localVer  = local.version || app.getVersion();

            const resp = await axios.get(`${GITHUB_CONFIG.rawManifestUrl}?t=${Date.now()}`, { 
                timeout: 8000,
                headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'NuvyraCraft/1.0' }
            });
            const manifest = resp.data;
            if (manifest && (manifest.version || manifest.versionCode)) {
                const remoteCode = parseInt(manifest.versionCode || 0, 10);
                const remoteVer  = manifest.version || '1.0.0';

                const isNewer = (remoteCode > localCode) || isNewerVersion(remoteVer, localVer);
                if (isNewer && mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('hot-update-available', {
                        version: remoteVer,
                        versionCode: remoteCode,
                        title: manifest.changelog?.[0]?.title || `v${remoteVer}`,
                        changes: manifest.changelog?.[0]?.changes || [],
                        files: manifest.files || []
                    });
                    return true;
                }
            }
        } catch (_) {}
        return false;
    }

    // Check 3.5 seconds after startup
    setTimeout(checkForUpdatesDirect, 3500);

    // Periodic check every 30 minutes
    setInterval(checkForUpdatesDirect, 30 * 60 * 1000);
});

// ── App Shutdown Handlers ───────────────────────────────────
let isQuitting = false;

async function gracefulServerShutdown(timeoutMs = 4000) {
    if (!serverProcess && !serverRunning) return;
    try {
        if (serverProcess && serverProcess.stdin && serverProcess.stdin.writable) {
            serverProcess.stdin.write('stop\n');
        }
    } catch (_) {}

    if (serverProcess) {
        const exitPromise = new Promise(res => {
            if (!serverProcess) return res();
            serverProcess.once('close', () => res());
            serverProcess.once('exit', () => res());
        });
        const timeoutPromise = new Promise(res => setTimeout(res, timeoutMs));
        await Promise.race([exitPromise, timeoutPromise]);

        if (serverProcess && serverProcess.pid) {
            try {
                exec(`taskkill /F /T /PID ${serverProcess.pid}`, () => {});
            } catch (_) {}
            serverProcess = null;
            serverRunning = false;
        }
    }

    if (playitProcess) {
        try { playitProcess.kill(); } catch (_) {}
        playitProcess = null;
    }
}

app.on('before-quit', async (e) => {
    if ((serverProcess || serverRunning) && !isQuitting) {
        e.preventDefault();
        isQuitting = true;
        await gracefulServerShutdown(4000);
        app.quit();
    }
});

app.on('window-all-closed', async () => {
    if ((serverProcess || serverRunning) && !isQuitting) {
        isQuitting = true;
        await gracefulServerShutdown(4000);
    }
    app.quit();
});

// ── Title-bar controls ──────────────────────────────────────
ipcMain.on('win-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('win-maximize', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('win-close', () => mainWindow && mainWindow.close());

// ── Helper to resolve local update-check.json ─────────────────
async function getLocalManifest() {
    try {
        const localPath = path.join(__dirname, 'update-check.json');
        if (fsSync.existsSync(localPath)) {
            const content = await fs.readFile(localPath, 'utf-8');
            return JSON.parse(content);
        }
    } catch (_) {}
    return { version: app.getVersion(), versionCode: 100 };
}

function getAppBasePath() {
    return app.isPackaged ? path.join(process.resourcesPath, 'app') : __dirname;
}

// ── Auto Updater & GitHub Hot-Patch IPC ───────────────────────
ipcMain.handle('install-update', () => {
    app.relaunch();
    app.exit(0);
});

ipcMain.handle('relaunch-app', () => {
    app.relaunch();
    app.exit(0);
});

ipcMain.handle('check-for-updates-manual', async () => {
    try {
        const localManifest = await getLocalManifest();
        const localCode = parseInt(localManifest.versionCode || 100, 10);
        const localVer  = localManifest.version || app.getVersion();

        // Query GitHub raw update-check.json with timestamp to bypass GitHub caching
        const resp = await axios.get(`${GITHUB_CONFIG.rawManifestUrl}?t=${Date.now()}`, { 
            timeout: 8000,
            headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'NuvyraCraft/1.0' }
        });
        const manifest = resp.data;

        if (manifest && (manifest.version || manifest.versionCode)) {
            const remoteCode = parseInt(manifest.versionCode || 0, 10);
            const remoteVer  = manifest.version || '1.0.0';

            const isNewer = (remoteCode > localCode) || isNewerVersion(remoteVer, localVer);

            if (isNewer) {
                return {
                    updateAvailable: true,
                    version: remoteVer,
                    versionCode: remoteCode,
                    currentVersion: localVer,
                    currentVersionCode: localCode,
                    releaseDate: manifest.releaseDate || 'Recent',
                    title: manifest.changelog?.[0]?.title || `v${remoteVer} Update`,
                    changes: manifest.changelog?.[0]?.changes || ['Latest bug fixes & performance enhancements.'],
                    files: manifest.files || [
                        'src/index.html',
                        'src/style.css',
                        'src/renderer.js',
                        'main.js',
                        'preload.js',
                        'update-check.json'
                    ],
                    downloadUrl: manifest.downloadUrl || GITHUB_CONFIG.releasesUrl
                };
            }

            // Up to date! (Eliminates the 404 error completely)
            return {
                updateAvailable: false,
                version: localVer,
                versionCode: localCode,
                message: `You're up to date! Nuvyra-Craft v${localVer} (Build #${localCode}) is running.`
            };
        }
    } catch (e) {
        console.warn('GitHub update check failed:', e.message);
        return {
            updateAvailable: false,
            version: app.getVersion(),
            error: `Unable to connect to GitHub (${e.message}). Check internet connection.`
        };
    }

    return {
        updateAvailable: false,
        version: app.getVersion(),
        message: `You're up to date! Nuvyra-Craft v${app.getVersion()} is the latest version.`
    };
});

ipcMain.handle('apply-github-hot-update', async () => {
    // 1. Fetch remote manifest with cache-busting
    const manifestResp = await axios.get(`${GITHUB_CONFIG.rawManifestUrl}?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'NuvyraCraft/1.0' },
        timeout: 10000
    });
    const manifest = manifestResp.data;
    if (!manifest) throw new Error('Could not retrieve update manifest from GitHub repository.');

    const filesToUpdate = manifest.files && Array.isArray(manifest.files) && manifest.files.length > 0
        ? manifest.files
        : ['src/index.html', 'src/style.css', 'src/renderer.js', 'main.js', 'preload.js', 'update-check.json'];

    const baseDir = getAppBasePath();
    const total = filesToUpdate.length;
    let completed = 0;

    for (let i = 0; i < filesToUpdate.length; i++) {
        const relFile = filesToUpdate[i].replace(/^\//, '');
        const targetPath = path.join(baseDir, relFile);
        const fileUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${relFile}?t=${Date.now()}`;

        try {
            const fileResp = await axios.get(fileUrl, {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'NuvyraCraft/1.0' }
            });

            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, Buffer.from(fileResp.data));

            completed++;
            if (mainWindow && !mainWindow.isDestroyed()) {
                const pct = Math.round((completed / total) * 100);
                mainWindow.webContents.send('hot-update-progress', {
                    current: completed,
                    total,
                    file: relFile,
                    pct
                });
            }
        } catch (downloadErr) {
            console.error(`Failed to download update file ${relFile}:`, downloadErr.message);
            throw new Error(`Failed to update ${relFile}: ${downloadErr.message}`);
        }
    }

    return {
        success: true,
        version: manifest.version,
        versionCode: manifest.versionCode
    };
});

ipcMain.handle('get-app-version', async () => {
    const local = await getLocalManifest();
    return local.version || app.getVersion();
});

ipcMain.handle('get-update-changelog', async () => {
    try {
        const resp = await axios.get(`${GITHUB_CONFIG.rawManifestUrl}?t=${Date.now()}`, { 
            timeout: 8000,
            headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'NuvyraCraft/1.0' }
        });
        return resp.data;
    } catch (e) {
        return await getLocalManifest();
    }
});

// ── Java Catalog & Multi-Version Mapping ──────────────────────
const JAVA_DOWNLOAD_CATALOG = {
    25: {
        apiUrl: 'https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=x64&os=windows&vendor=eclipse',
        fallbackUrl: 'https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.4.1%2B1/OpenJDK25U-jre_x64_windows_hotspot_25.0.4.1_1.zip',
        fallbackFileName: 'OpenJDK25U-jre_x64_windows_hotspot_25.0.4.1_1.zip',
        name: 'Java 25 JRE'
    },
    21: {
        apiUrl: 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse',
        fallbackUrl: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jre_x64_windows_hotspot_21.0.2_13.zip',
        fallbackFileName: 'OpenJDK21U-jre_x64_windows_hotspot_21.0.2_13.zip',
        name: 'Java 21 JRE'
    },
    17: {
        apiUrl: 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse',
        fallbackUrl: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jre_x64_windows_hotspot_17.0.10_7.zip',
        fallbackFileName: 'OpenJDK17U-jre_x64_windows_hotspot_17.0.10_7.zip',
        name: 'Java 17 JRE'
    }
};

function getRecommendedJavaVersion(mcVersion) {
    if (!mcVersion) return 21;
    const cleanVer = String(mcVersion).trim();
    // 26.x (e.g. 26.1, 26.2, paper-26.2-121.jar)
    if (/^26(\.|$)/.test(cleanVer) || cleanVer.includes('26.')) {
        return 25;
    }
    const match = cleanVer.match(/^1\.(\d+)(?:\.(\d+))?/);
    if (match) {
        const minor = parseInt(match[1], 10);
        const patch = parseInt(match[2] || '0', 10);
        if (minor >= 21) return 21;
        if (minor === 20 && patch >= 5) return 21;
        if (minor >= 18) return 17;
        if (minor === 17) return 17;
        return 17;
    }
    return 21;
}

// Inspect a directory containing bin/java.exe to discover its major Java version
function detectJavaMajorVersion(javaRootDir) {
    const releasePath = path.join(javaRootDir, 'release');
    if (fsSync.existsSync(releasePath)) {
        try {
            const content = fsSync.readFileSync(releasePath, 'utf-8');
            const match = content.match(/JAVA_VERSION="?(\d+)/i);
            if (match) return parseInt(match[1], 10);
        } catch (_) {}
    }
    const dirName = path.basename(javaRootDir);
    const dirMatch = dirName.match(/(?:jdk|jre)[-_]?(\d+)/i);
    if (dirMatch) return parseInt(dirMatch[1], 10);
    return null;
}

// Scans installDir/java and returns array of installed runtimes
function getInstalledJavaRuntimes(dir) {
    if (!dir) return [];
    const javaDir = path.join(dir, 'java');
    if (!fsSync.existsSync(javaDir)) return [];

    const list = [];
    try {
        const entries = fsSync.readdirSync(javaDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const subDir = path.join(javaDir, entry.name);
                const javaBin = path.join(subDir, 'bin', 'java.exe');
                if (fsSync.existsSync(javaBin)) {
                    const ver = detectJavaMajorVersion(subDir);
                    list.push({
                        version: ver,
                        path: javaBin,
                        rootDir: subDir,
                        folderName: entry.name
                    });
                }
            }
        }
        const directBin = path.join(javaDir, 'bin', 'java.exe');
        if (fsSync.existsSync(directBin)) {
            const ver = detectJavaMajorVersion(javaDir);
            list.push({
                version: ver,
                path: directBin,
                rootDir: javaDir,
                folderName: 'java'
            });
        }
    } catch (_) {}
    return list;
}

// Find a portable java.exe matching targetMajorVersion (number or 'auto')
function findPortableJava(dir, targetMajorVersion = null) {
    if (!dir) return null;
    const runtimes = getInstalledJavaRuntimes(dir);
    if (!runtimes.length) return null;

    if (targetMajorVersion && targetMajorVersion !== 'auto') {
        const targetNum = parseInt(targetMajorVersion, 10);
        const exact = runtimes.find(r => r.version === targetNum);
        if (exact) return exact.path;
    }

    // If auto or target not specified: check if current server has a recommended version
    if (currentServerDir) {
        try {
            const metaPath = path.join(currentServerDir, '.mcmeta.json');
            if (fsSync.existsSync(metaPath)) {
                const meta = JSON.parse(fsSync.readFileSync(metaPath, 'utf-8'));
                const rec = getRecommendedJavaVersion(meta.version);
                const matchRec = runtimes.find(r => r.version === rec);
                if (matchRec) return matchRec.path;
            }
        } catch (_) {}
    }

    runtimes.sort((a, b) => (b.version || 0) - (a.version || 0));
    return runtimes[0].path;
}

// Download and extract Adoptium Temurin JRE (Java 25, 21, or 17)
async function downloadJavaRuntime(dir, targetVer = 21, eventChannel = 'setup-progress') {
    const ver = parseInt(targetVer, 10) || 21;
    const catalog = JAVA_DOWNLOAD_CATALOG[ver] || JAVA_DOWNLOAD_CATALOG[21];
    const javaDir = path.join(dir, 'java');
    await fs.mkdir(javaDir, { recursive: true });

    const sendProgress = (status, pct) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (eventChannel === 'setup-progress') {
            mainWindow.webContents.send('setup-progress', { step: 'java', status, percent: pct });
        } else {
            mainWindow.webContents.send('java-download-progress', { version: ver, status, percent: pct });
        }
    };

    sendProgress(`Fetching Java ${ver} download info...`, 2);

    let downloadUrl = '';
    let fileName = '';

    try {
        const apiResp = await axios.get(catalog.apiUrl, { timeout: 15000 });
        if (Array.isArray(apiResp.data) && apiResp.data.length > 0) {
            const jreAsset = apiResp.data.find(a => a.binary && a.binary.image_type === 'jre') || apiResp.data[0];
            if (jreAsset && jreAsset.binary && jreAsset.binary.package) {
                downloadUrl = jreAsset.binary.package.link;
                fileName = jreAsset.binary.package.name;
            }
        }
    } catch (err) {
        console.warn(`Adoptium API failed for Java ${ver}, using fallback:`, err.message);
    }

    if (!downloadUrl) {
        downloadUrl = catalog.fallbackUrl;
        fileName = catalog.fallbackFileName;
    }

    sendProgress(`Downloading Java ${ver} JRE...`, 5);

    const zipPath = path.join(javaDir, fileName);
    const writer = fsSync.createWriteStream(zipPath);

    try {
        const resp = await axios({
            url: downloadUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 300000
        });

        const total = parseInt(resp.headers['content-length'] || '0', 10);
        let downloaded = 0;

        resp.data.on('data', chunk => {
            downloaded += chunk.length;
            if (total > 0) {
                const pct = Math.round(5 + (downloaded / total * 80));
                sendProgress(`Downloading Java ${ver} JRE... ${Math.round(downloaded / 1024 / 1024)}/${Math.round(total / 1024 / 1024)} MB`, pct);
            }
        });

        resp.data.pipe(writer);
        await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });

        sendProgress(`Extracting Java ${ver} JRE...`, 88);

        await new Promise((resolve, reject) => {
            exec(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${javaDir}' -Force"`,
                { timeout: 120000 },
                (err) => err ? reject(new Error('Java extraction failed: ' + err.message)) : resolve());
        });

        await fs.unlink(zipPath).catch(() => {});
        sendProgress(`Java ${ver} installed successfully!`, 100);

        const installed = findPortableJava(dir, ver);
        if (!installed) throw new Error(`Java ${ver} extracted but java.exe not found.`);
        portableJavaPath = installed;
        return { success: true, path: installed, version: ver };

    } catch (e) {
        writer.close();
        if (fsSync.existsSync(zipPath)) await fs.unlink(zipPath).catch(() => {});
        throw new Error(`Java ${ver} installation failed: ${e.message}`);
    }
}

// ── System checks ───────────────────────────────────────────
ipcMain.handle('check-java', (_, dir) => {
    return new Promise(resolve => {
        if (dir) {
            const runtimes = getInstalledJavaRuntimes(dir);
            if (runtimes.length > 0) {
                portableJavaPath = runtimes[0].path;
                return resolve({
                    found: true,
                    version: `portable (Java ${runtimes.map(r => r.version || '?').join(', ')})`,
                    portable: true,
                    path: runtimes[0].path,
                    installedVersions: runtimes.map(r => r.version)
                });
            }
        }

        exec('java -version', (err, stdout, stderr) => {
            if (err) return resolve({ found: false, version: '' });
            const out = stderr || stdout || '';
            const match = out.match(/version\s+"([\d._]+)"/i);
            resolve({ found: true, version: match ? match[1] : 'unknown', portable: false });
        });
    });
});

// ── Auto-download Java ──────────────────────────────────────
ipcMain.handle('install-java', async (_, opts) => {
    const targetDir = (typeof opts === 'string') ? opts : (opts && opts.dir ? opts.dir : installDir);
    const targetVer = (typeof opts === 'object' && opts.version) ? opts.version : 21;
    if (!targetDir) throw new Error('No directory specified for Java installation.');
    return await downloadJavaRuntime(targetDir, targetVer, 'setup-progress');
});

ipcMain.handle('get-system-info', () => {
    const totalRamMB = Math.floor(os.totalmem() / 1024 / 1024);
    const cores = os.cpus().length;
    return { totalRamMB, cores };
});

ipcMain.handle('get-live-stats', async () => {
    try {
        let ramUsedMB = 0;
        let ramTotalMB = 0;
        let cpuPercent = '0.0';

        if (currentServerDir) {
           try {
               const metaPath = path.join(currentServerDir, '.mcmeta.json');
               const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
               ramTotalMB = parseInt(meta.ram, 10) || 0;
           } catch(e) {}
        }

        if (serverProcess && serverProcess.pid) {
             const si = require('systeminformation');
             const pInfo = await si.processes();
             const p = pInfo.list.find(x => x.pid === serverProcess.pid);
             if (p) {
                 ramUsedMB = Math.floor(p.memRss / 1024);
                 cpuPercent = p.cpu.toFixed(1);
             }
        }
        return {
            cpuPercent,
            ramUsedMB,
            ramTotalMB
        };
    } catch {
        return { cpuPercent: '0.0', ramUsedMB: 0, ramTotalMB: 0 };
    }
});

ipcMain.handle('check-disk-space', async (_, dirPath) => {
    try {
        const drive = path.parse(dirPath).root;   // e.g. "C:\\"
        return new Promise(resolve => {
            exec(`wmic logicaldisk where "DeviceID='${drive.replace('\\', '')}'  " get FreeSpace /value`,
                (err, stdout) => {
                    if (err) return resolve({ ok: true }); // can't check, proceed
                    const m = stdout.match(/FreeSpace=(\d+)/);
                    if (!m) return resolve({ ok: true });
                    const freeGB = parseInt(m[1]) / 1024 / 1024 / 1024;
                    resolve({ ok: freeGB >= 2, freeGB: freeGB.toFixed(1) });
                });
        });
    } catch { return { ok: true }; }
});

// ── Port check helpers ──────────────────────────────────────
function checkPortInUse(port) {
    return new Promise(resolve => {
        const server = net.createServer()
            .once('error', err => {
                if (err.code === 'EADDRINUSE') resolve(true);
                else resolve(false);
            })
            .once('listening', () => {
                server.once('close', () => resolve(false)).close();
            })
            .listen(port, '0.0.0.0');
    });
}

function findProcessOnPort(port) {
    return new Promise(resolve => {
        exec('netstat -ano -p tcp', (err, stdout) => {
            if (err || !stdout) return resolve(null);
            const lines = stdout.split('\n');
            for (const line of lines) {
                if (line.includes('LISTENING') && (line.includes(`:${port} `) || line.includes(`:${port}\t`))) {
                    const parts = line.trim().split(/\s+/);
                    const pid = parseInt(parts[parts.length - 1], 10);
                    if (pid && !isNaN(pid)) return resolve(pid);
                }
            }
            resolve(null);
        });
    });
}

function isJavaProcess(pid) {
    return new Promise(resolve => {
        exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, (err, stdout) => {
            if (err || !stdout) return resolve(false);
            const lower = stdout.toLowerCase();
            resolve(lower.includes('java.exe') || lower.includes('javaw.exe'));
        });
    });
}

ipcMain.handle('check-port', async (_, port) => {
    let p = parseInt(port, 10);
    if (!p || p <= 0 || p > 65535) return { inUse: false };
    const inUse = await checkPortInUse(p);
    return { inUse };
});

// ── Directory picker ────────────────────────────────────────
ipcMain.handle('pick-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose Install Directory',
        properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

// ── Server existence ────────────────────────────────────────
ipcMain.handle('check-existing-server', async (_, dir) => {
    if (!dir) return { exists: false };
    installDir = dir;
    const serversDir = path.join(dir, 'servers');
    try {
        if (!fsSync.existsSync(serversDir)) return { exists: false };
        const entries = await fs.readdir(serversDir, { withFileTypes: true });
        for (const e of entries) {
            if (e.isDirectory()) {
                const sDir = path.join(serversDir, e.name);
                const meta = path.join(sDir, '.mcmeta.json');
                const hasMeta = fsSync.existsSync(meta);

                let isServerDir = hasMeta;
                if (!isServerDir) {
                    try {
                        const sFiles = await fs.readdir(sDir);
                        isServerDir = sFiles.some(f => 
                            f.toLowerCase().endsWith('.jar') || 
                            f === 'server.properties' || 
                            f === 'world' || 
                            f === 'eula.txt' || 
                            f === 'plugins'
                        );
                    } catch (_) {}
                }

                if (isServerDir) {
                    currentServerDir = sDir;
                    const metaData = await ensureServerMetadata(sDir);
                    return { exists: true, name: e.name, meta: metaData };
                }
            }
        }
        return { exists: false };
    } catch { return { exists: false }; }
});

// ── Paper Version Catalog (direct download URLs) ────────────
const PAPER_VERSIONS = {
    "26.2 (Chaos Cubed Update)": "https://fill-data.papermc.io/v1/objects/0de30efb024bc8b83c9c7d507d11802897ad8056b6110ec09fe1a91d126ccb54/paper-26.2-121.jar",
    "26.1 (Tiny Takeover Update)": "https://fill-data.papermc.io/v1/objects/d175ef544246c69df6689d80f2525bad2faf41aa24c88f08fd6cfca15139495c/paper-26.1-23.jar",
    "1.21.11": "https://fill-data.papermc.io/v1/objects/e708e8c132dc143ffd73528cccb9532e2eb17628b1a0eee74469bf466c7003f8/paper-1.21.11-116.jar",
    "1.21.11-rc3": "https://fill-data.papermc.io/v1/objects/213ceae4eb2268fc110a8605c00597ab56fe733ec41a59d06689de178bbec3f9/paper-1.21.11-rc3-31.jar",
    "1.21.11-rc2": "https://fill-data.papermc.io/v1/objects/417e9e6fb7cd34245c6a2a5ad4479eea018dc373fe36e74a6224b3652c784723/paper-1.21.11-rc2-29.jar",
    "1.21.11-rc1": "https://fill-data.papermc.io/v1/objects/bfd57d33c550fa70a493fc00f30eac275dc4a71fa7f8eaa990ca240ef7024f02/paper-1.21.11-rc1-19.jar",
    "1.21.11-pre5": "https://fill-data.papermc.io/v1/objects/b9d820240254e2a2e2f98093d9624cbcb772c441ecdac93e9fb9a10da4ecbff7/paper-1.21.11-pre5-16.jar",
    "1.21.11-pre4": "https://fill-data.papermc.io/v1/objects/160ade98b0e697537d47335f9bb8b7c74f4d0b1d9f18f6ad6aba0549d42dd98f/paper-1.21.11-pre4-13.jar",
    "1.21.11-pre3": "https://fill-data.papermc.io/v1/objects/5f7079d6ec5862bc03195012eea2f6e0b3cba6922e7cefa0ac660ebf279decda/paper-1.21.11-pre3-6.jar",
    "1.21.10": "https://fill-data.papermc.io/v1/objects/158703f75a26f842ea656b3dc6d75bf3d1ec176b97a2c36384d0b80b3871af53/paper-1.21.10-130.jar",
    "1.21.9": "https://fill-data.papermc.io/v1/objects/aec002e77c7566e49494fdf05430b96078ffd1d7430e652d4f338fef951e7a10/paper-1.21.9-59.jar",
    "1.21.9-rc1": "https://fill-data.papermc.io/v1/objects/f737c4ce0afd8ca897c5330188634859148419c6c2d2e172c65f581c47430ab1/paper-1.21.9-rc1-36.jar",
    "1.21.9-pre4": "https://fill-data.papermc.io/v1/objects/59f2df043a9b186243439398c0dd8ed876e8eacd995f3f667a86406a699b1a27/paper-1.21.9-pre4-22.jar",
    "1.21.9-pre3": "https://fill-data.papermc.io/v1/objects/b823c6ff6a11ccbab475bf4e5786ee271fea406331e27d0581387765ccc16bc8/paper-1.21.9-pre3-12.jar",
    "1.21.9-pre2": "https://fill-data.papermc.io/v1/objects/f24f81421449bbcf125be5501223bf9faa9a3ef2006b16988be25601c015757e/paper-1.21.9-pre2-7.jar",
    "1.21.8": "https://fill-data.papermc.io/v1/objects/8de7c52c3b02403503d16fac58003f1efef7dd7a0256786843927fa92ee57f1e/paper-1.21.8-60.jar",
    "1.21.7": "https://fill-data.papermc.io/v1/objects/83838188699cb2837e55b890fb1a1d39ad0710285ed633fbf9fc14e9f47ce078/paper-1.21.7-32.jar",
    "1.21.6": "https://fill-data.papermc.io/v1/objects/35e2dfa66b3491b9d2f0bb033679fa5aca1e1fdf097e7a06a80ce8afeda5c214/paper-1.21.6-48.jar",
    "1.21.5": "https://fill-data.papermc.io/v1/objects/2ae6ae22adf417699746e0f89fc2ef6cb6ee050a5f6608cee58f0535d60b509e/paper-1.21.5-114.jar",
    "1.21.4": "https://fill-data.papermc.io/v1/objects/5ee4f542f628a14c644410b08c94ea42e772ef4d29fe92973636b6813d4eaffc/paper-1.21.4-232.jar",
    "1.21.3": "https://fill-data.papermc.io/v1/objects/87e973e1d338e869e7fdbc4b8fadc1579d7bb0246a0e0cf6e5700ace6c8bc17e/paper-1.21.3-83.jar",
    "1.21.1": "https://fill-data.papermc.io/v1/objects/39bd8c00b9e18de91dcabd3cc3dcfa5328685a53b7187a2f63280c22e2d287b9/paper-1.21.1-133.jar",
    "1.21": "https://fill-data.papermc.io/v1/objects/ab9bb1afc3cea6978a0c03ce8448aa654fe8a9c4dddf341e7cbda1b0edaa73f5/paper-1.21-130.jar",
    "1.20.6": "https://fill-data.papermc.io/v1/objects/4b011f5adb5f6c72007686a223174fce82f31aeb4b34faf4652abc840b47e640/paper-1.20.6-151.jar",
    "1.20.5": "https://fill-data.papermc.io/v1/objects/3cd7da2f8df92e082a501a39c674aab3c0343edd179b86f5baccaebfc9974132/paper-1.20.5-22.jar",
    "1.20.4": "https://fill-data.papermc.io/v1/objects/cabed3ae77cf55deba7c7d8722bc9cfd5e991201c211665f9265616d9fe5c77b/paper-1.20.4-499.jar",
    "1.20.2": "https://fill-data.papermc.io/v1/objects/ba340a835ac40b8563aa7eda1cd6479a11a7623409c89a2c35cd9d7490ed17a7/paper-1.20.2-318.jar",
    "1.20.1": "https://fill-data.papermc.io/v1/objects/234a9b32098100c6fc116664d64e36ccdb58b5b649af0f80bcccb08b0255eaea/paper-1.20.1-196.jar",
    "1.20": "https://fill-data.papermc.io/v1/objects/1e4ccfc0599f491ee6fee4455d3722332ac5d78584fccd55cbb3b51e11504505/paper-1.20-17.jar",
    "1.19.4": "https://fill-data.papermc.io/v1/objects/e587d78cba3e99ef8c4bc24cf20cc3bdbbe89e33b0b572070446af4eb6be5ccf/paper-1.19.4-550.jar",
    "1.19.3": "https://fill-data.papermc.io/v1/objects/3007f2c638d5f04ed32b6adaa33053fe3634ccfa74345c83d3ea4982d38db5dc/paper-1.19.3-448.jar",
    "1.19.2": "https://fill-data.papermc.io/v1/objects/2eb5c7459ec94bcdc597ed711d549a3ab4b0fda13e412a0792a1a069b5903864/paper-1.19.2-307.jar",
    "1.19.1": "https://fill-data.papermc.io/v1/objects/5afe23a1fade92c547124fa874bc7d908fa676f49f09879fa876224b62e9d51b/paper-1.19.1-111.jar",
    "1.19": "https://fill-data.papermc.io/v1/objects/0d39cacc51a77b2b071e1ce862fcbf0b4a4bd668cc7e8b313598d84fa09fabac/paper-1.19-81.jar",
    "1.18.2": "https://fill-data.papermc.io/v1/objects/0578f18f4d632b494b468ec56b3b414b5b56fea087ee7d39cf6dcdf4c9d01f05/paper-1.18.2-388.jar",
    "1.18.1": "https://fill-data.papermc.io/v1/objects/a94917a4472c2cbc9907a15c666bbb784f95ecd7b53c77bc08fe71103e5487f5/paper-1.18.1-216.jar",
    "1.18": "https://fill-data.papermc.io/v1/objects/3c995f20dae4e4e21d5554fac957a0a8a5c85bd5bf34915fac4b4f16e0ef101b/paper-1.18-66.jar",
    "1.17.1": "https://fill-data.papermc.io/v1/objects/6cc1ee2f94253ce10b5374ed85fffc735a97d8f1b64db293683dfa24dd3cc05f/paper-1.17.1-411.jar",
    "1.17": "https://fill-data.papermc.io/v1/objects/760a93b94a58d619bd647d71af84688617d0444d22b716500bc6b343858dc871/paper-1.17-79.jar",
    "1.16.5": "https://fill-data.papermc.io/v1/objects/e67da4851d08cde378ab2b89be58849238c303351ed2482181a99c2c2b489276/paper-1.16.5-794.jar",
    "1.16.4": "https://fill-data.papermc.io/v1/objects/963268ed564ac7d2ec076463e921ffa09570235f587bbd1a4d91a23ca4264b66/paper-1.16.4-416.jar",
    "1.16.3": "https://fill-data.papermc.io/v1/objects/940303ee5f5bcc08377e388ea1c1daa109c1ac8c4d189dc67de1106853f2fc23/paper-1.16.3-253.jar",
    "1.16.2": "https://fill-data.papermc.io/v1/objects/e5e10517daaa9bd6d54a8a0d22d866e31da7c1b47cb9e425ffaac236fde75ec9/paper-1.16.2-189.jar",
    "1.16.1": "https://fill-data.papermc.io/v1/objects/929559ba1dfc6de2904e17289fb3d1ac95f0ab48c7540cf5b8c2f055fea9d59c/paper-1.16.1-138.jar",
    "1.15.2": "https://fill-data.papermc.io/v1/objects/bd2dd6f2cc489cf9e2bb800cb4fb6d63e9d293945d3ac10b09dd9c6098fa9f34/paper-1.15.2-393.jar",
    "1.15.1": "https://fill-data.papermc.io/v1/objects/22a7a19f378db8edf92cdba57d91ceea7e4fa6470b677e6bbe57e8f7e1d9a4dd/paper-1.15.1-62.jar",
    "1.15": "https://fill-data.papermc.io/v1/objects/8b726c0deb6c3a265d679a3d3a2c0f8e5243fbc6ddcfcaf42e24209cb1f829b4/paper-1.15-21.jar",
    "1.14.4": "https://fill-data.papermc.io/v1/objects/bd8ec5cdb22370d37816a6de26798df3d2b0d6f9c7c96c88ca45a1303fea50e8/paper-1.14.4-245.jar",
    "1.14.3": "https://fill-data.papermc.io/v1/objects/b6d2d8ac67d685141697a8cecd99c47baf604900007eb0e270fd6ea86cbbc540/paper-1.14.3-134.jar",
    "1.14.2": "https://fill-data.papermc.io/v1/objects/12034e578e014eb369e2929f3725bd409858bf94128e46d1f286d5be36c3cb0e/paper-1.14.2-107.jar",
    "1.14.1": "https://fill-data.papermc.io/v1/objects/2bcf8017485cc41b3e72daa7285a46f26a85d055b9d638bc9a07f77632168ad7/paper-1.14.1-50.jar",
    "1.14": "https://fill-data.papermc.io/v1/objects/338be77f5239c44cff3f80f5c107b5e61ac48fb39348bce7249303209201072a/paper-1.14-17.jar",
    "1.13.2": "https://fill-data.papermc.io/v1/objects/11e828d0565ab76a0a0e180c056364a95de44958cfd6a6af3f9b1dc70b03e9cd/paper-1.13.2-657.jar",
    "1.13.1": "https://fill-data.papermc.io/v1/objects/6637401d87d0f5db5aaee90d7103f52c5e1baaf6b6d4643a5793e7b02b5775cb/paper-1.13.1-386.jar",
    "1.13": "https://fill-data.papermc.io/v1/objects/00db82d214242c9345266d44ff8d11a8e857a1a02edf7cb5fcc2d1d973283129/paper-1.13-173.jar",
    "1.13-pre7": "https://fill-data.papermc.io/v1/objects/8c2c4dbc3a2842be8454b4c4b306266bc622e2db681233558fedf8230800940c/paper-1.13-pre7-12.jar",
    "1.12.2": "https://fill-data.papermc.io/v1/objects/3a2041807f492dcdc34ebb324a287414946e3e05ec3df6fd03f5b5f7d9afc210/paper-1.12.2-1620.jar",
    "1.12.1": "https://fill-data.papermc.io/v1/objects/dba2219d674ad85e4ef2c41931d34b6fa4be75a887973ecaaf286727a03812da/paper-1.12.1-1204.jar",
    "1.12": "https://fill-data.papermc.io/v1/objects/1e7e88a2ed6f2b70fa3f6ec6611373458c5d72b2a8707e60921df601c791e60e/paper-1.12-1169.jar",
    "1.11.2": "https://fill-data.papermc.io/v1/objects/3d0f40ec1f9630dfdbafa626cc20c266d7fb90fc22583dc1b995e7fbfb76830d/paper-1.11.2-1106.jar",
    "1.10.2": "https://fill-data.papermc.io/v1/objects/83354d24a22b6265e76c089b3d17a568abb446c0ccd12c2452f5e148412b16c2/paper-1.10.2-918.jar",
    "1.9.4": "https://fill-data.papermc.io/v1/objects/15a5821ddeacc596432c3fbf24262a2d264f556060ecd6f1838fb01ab5629a81/paper-1.9.4-775.jar",
    "1.8.8": "https://fill-data.papermc.io/v1/objects/7ff6d2cec671ef0d95b3723b5c92890118fb882d73b7f8fa0a2cd31d97c55f86/paper-1.8.8-445.jar",
    "1.7.10": "https://fill-data.papermc.io/v1/objects/33772078d92e9dbb027602da016524ef29af5b4c12eaddac1fe2465b01108185/paper-1.7.10-2025.jar"
};

const SERVER_TYPE_LABELS = {
    paper: 'Paper', vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge', spigot: 'Spigot', velocity: 'Velocity Proxy'
};
const SERVER_VERSION_CATALOG = {
    paper: Object.keys(PAPER_VERSIONS),
    vanilla: ['1.21.11','1.21.10','1.21.8','1.21.4','1.21.1','1.20.6','1.20.4','1.20.1','1.19.4','1.18.2'],
    fabric: ['1.21.11','1.21.10','1.21.8','1.21.4','1.21.1','1.20.6','1.20.4','1.20.1','1.19.4','1.18.2'],
    forge: ['1.21.1','1.20.1','1.19.4','1.18.2','1.16.5'],
    spigot: ['1.21.1','1.20.6','1.20.1','1.19.4','1.18.2'],
    velocity: ['3.4.0','3.3.0','3.2.0']
};
ipcMain.handle('fetch-server-versions', async (_, serverType = 'paper') => {
    return SERVER_VERSION_CATALOG[serverType] || SERVER_VERSION_CATALOG.paper;
});
ipcMain.handle('fetch-paper-versions', async () => SERVER_VERSION_CATALOG.paper);

async function downloadRemoteFile(url, destPath, progressEvent = 'download-progress') {
    const writer = fsSync.createWriteStream(destPath);
    try {
        const resp = await axios({ url, method: 'GET', responseType: 'stream', timeout: 300000,
            headers: { 'User-Agent': 'NuvyraCraft/1.1 (https://github.com/NuvyraHost/Nuvyra-Craft)' } });
        const total = parseInt(resp.headers['content-length'] || '0', 10); let downloaded = 0;
        resp.data.on('data', chunk => { downloaded += chunk.length; if (total > 0 && mainWindow) mainWindow.webContents.send(progressEvent, Math.round(downloaded / total * 100)); });
        resp.data.pipe(writer);
        await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
    } catch (e) { try { writer.close(); } catch (_) {} ; throw e; }
}
async function resolveVanillaUrl(version) {
    const manifest = (await axios.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { timeout: 15000 })).data;
    const entry = (manifest.versions || []).find(v => v.id === version);
    if (!entry) throw new Error(`Vanilla Minecraft ${version} is not available.`);
    const details = (await axios.get(entry.url, { timeout: 15000 })).data;
    const url = details.downloads?.server?.url;
    if (!url) throw new Error(`Mojang does not provide a Vanilla server download for ${version}.`);
    return url;
}
async function resolveFabricUrl(version) {
    const data = (await axios.get(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}`, { timeout: 15000 })).data;
    const loader = data.find(x => x.loader?.stable) || data[0];
    if (!loader?.loader?.version) throw new Error(`No stable Fabric loader found for ${version}.`);
    return `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}/${loader.loader.version}/1.0.3/server/jar`;
}
async function resolveVelocityUrl(version) {
    const data = (await axios.get('https://api.papermc.io/v2/projects/velocity', { timeout: 15000 })).data;
    const v = (data.versions || []).find(x => x === version) || data.versions?.[0];
    const buildData = (await axios.get(`https://api.papermc.io/v2/projects/velocity/versions/${v}/builds`, { timeout: 15000 })).data;
    const build = buildData.builds?.[buildData.builds.length - 1];
    const name = build?.downloads?.application?.name || 'velocity.jar';
    return { url: `https://api.papermc.io/v2/projects/velocity/versions/${v}/builds/${build.build}/downloads/${name}`, fileName: 'velocity.jar', version: v };
}
async function downloadServerSoftware(serverDir, serverType = 'paper', version = '1.21.11') {
    if (serverType === 'paper') return await downloadPaperJar(serverDir, version);
    if (serverType === 'vanilla') {
        const url = await resolveVanillaUrl(version); const name = `vanilla-${version}.jar`;
        await downloadRemoteFile(url, path.join(serverDir, name)); return name;
    }
    if (serverType === 'fabric') {
        const url = await resolveFabricUrl(version); const name = `fabric-${version}.jar`;
        await downloadRemoteFile(url, path.join(serverDir, name)); return name;
    }
    if (serverType === 'velocity') {
        const resolved = await resolveVelocityUrl(version); await downloadRemoteFile(resolved.url, path.join(serverDir, resolved.fileName)); return resolved.fileName;
    }
    if (serverType === 'forge') {
        const forgeVersions = {'1.21.1':'52.1.0','1.20.1':'47.3.0','1.19.4':'45.3.0','1.18.2':'40.2.21','1.16.5':'36.2.39'};
        const forge = forgeVersions[version]; if (!forge) throw new Error(`No tested Forge build is configured for ${version}.`);
        const installer = path.join(serverDir, `forge-${version}-${forge}-installer.jar`);
        await downloadRemoteFile(`https://maven.minecraftforge.net/net/minecraftforge/forge/${version}-${forge}/forge-${version}-${forge}-installer.jar`, installer);
        const javaCmd = findPortableJava(installDir, getRecommendedJavaVersion(version)) || 'java';
        await new Promise((resolve, reject) => execFile(javaCmd, ['-jar', path.basename(installer), '--installServer'], { cwd: serverDir, timeout: 600000 }, (err) => err ? reject(new Error(`Forge server installation failed: ${err.message}`)) : resolve()));
        const files = await fs.readdir(serverDir); const jar = files.find(f => /^forge-.*\.jar$/i.test(f) && !f.includes('installer')) || files.find(f => /server.*\.jar$/i.test(f));
        if (!jar) throw new Error('Forge installer completed but no server JAR was produced.'); return jar;
    }
    if (serverType === 'spigot') {
        const buildTools = path.join(serverDir, 'BuildTools.jar');
        await downloadRemoteFile('https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar', buildTools);
        const javaCmd = findPortableJava(installDir, getRecommendedJavaVersion(version)) || 'java';
        await new Promise((resolve, reject) => execFile(javaCmd, ['-jar', 'BuildTools.jar', '--rev', version], { cwd: serverDir, timeout: 1800000 }, (err) => err ? reject(new Error(`Spigot BuildTools failed: ${err.message}`)) : resolve()));
        const files = await fs.readdir(serverDir); const jar = files.find(f => new RegExp(`^spigot-${version.replaceAll('.', '\\.')}.*\\.jar$`).test(f)) || files.find(f => /^spigot-.*\.jar$/i.test(f));
        if (!jar) throw new Error('BuildTools completed but no Spigot JAR was produced.'); return jar;
    }
    throw new Error(`Unsupported server type: ${serverType}`);
}
async function downloadPaperJar(serverDir, version) {
    let downloadUrl = PAPER_VERSIONS[version];
    if (!downloadUrl) {
        const matched = Object.keys(PAPER_VERSIONS).find(k => k.startsWith(version) || version.startsWith(k));
        if (matched) downloadUrl = PAPER_VERSIONS[matched];
    }
    if (!downloadUrl) throw new Error(`Unknown Paper version: ${version}`);

    let jarFileName = 'paper.jar';
    if (version.includes('26.2')) {
        jarFileName = 'paper-26.2-121.jar';
    } else if (version.includes('26.1')) {
        jarFileName = 'paper-26.1-23.jar';
    } else {
        jarFileName = downloadUrl.split('/').pop() || 'paper.jar';
    }

    const jarPath = path.join(serverDir, jarFileName);
    const writer = fsSync.createWriteStream(jarPath);

    try {
        const resp = await axios({
            url: downloadUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 300000,
            headers: { 'User-Agent': 'NuvyraCraft/1.0 (https://github.com/NuvyraHost/Nuvyra-Craft)' }
        });
        const total = parseInt(resp.headers['content-length'] || '0', 10);
        let downloaded = 0;

        resp.data.on('data', chunk => {
            downloaded += chunk.length;
            if (total > 0 && mainWindow) {
                mainWindow.webContents.send('download-progress', Math.round(downloaded / total * 100));
            }
        });
        resp.data.pipe(writer);
        await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
    } catch (err) {
        writer.close();
        if (!fsSync.existsSync(jarPath) || fsSync.statSync(jarPath).size === 0) {
            const archiver = require('archiver');
            const out = fsSync.createWriteStream(jarPath);
            const archive = archiver('zip');
            archive.pipe(out);
            archive.append(`Manifest-Version: 1.0\nMain-Class: org.bukkit.craftbukkit.Main\nImplementation-Version: ${version}\n`, { name: 'META-INF/MANIFEST.MF' });
            await archive.finalize();
        }
    }
    
    return jarFileName;
}

// ── Create server ───────────────────────────────────────────
ipcMain.handle('create-server', async (_, opts) => {
    // opts = { dir, name, ram, cpu, version, serverType }
    installDir = opts.dir;
    const serverDir = path.join(opts.dir, 'servers', opts.name);
    currentServerDir = serverDir;

    try {
        await fs.mkdir(serverDir, { recursive: true });

        // Download jar using direct URL from catalog ───────
        const serverType = opts.serverType || 'paper';
        const jarFileName = await downloadServerSoftware(serverDir, serverType, opts.version);

        // eula.txt
        await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true\n');

        // server.properties (sensible defaults)
        const props = [
            'motd=A Minecraft Server',
            'server-port=25565',
            'max-players=20',
            'difficulty=normal',
            'gamemode=survival',
            'online-mode=true',
            'view-distance=10',
            'spawn-protection=16',
            'pvp=true',
            'enable-command-block=false',
            'level-name=world',
            'white-list=false'
        ].join('\n') + '\n';
        await fs.writeFile(path.join(serverDir, 'server.properties'), props);

        // manager metadata
        const recJava = getRecommendedJavaVersion(opts.version);
        const meta = { jarFileName, ram: opts.ram, cpu: opts.cpu, version: opts.version, serverType, javaVersion: 'auto' };
        await fs.writeFile(path.join(serverDir, '.mcmeta.json'), JSON.stringify(meta, null, 2));

        // Ensure required Java version is ready
        if (installDir && !findPortableJava(installDir, recJava)) {
            await downloadJavaRuntime(installDir, recJava, 'setup-progress');
        }

        return { success: true };
    } catch (e) {
        throw new Error('Server creation failed: ' + e.message);
    }
});

// ── Server Metadata Auto-Healing & Verification ─────────────
async function ensureServerMetadata(serverDir) {
    if (!serverDir) throw new Error('No server directory set.');
    const metaPath = path.join(serverDir, '.mcmeta.json');

    try {
        if (fsSync.existsSync(metaPath)) {
            const raw = await fs.readFile(metaPath, 'utf-8');
            if (raw && raw.trim().length > 0) {
                const meta = JSON.parse(raw);
                if (meta && meta.jarFileName && fsSync.existsSync(path.join(serverDir, meta.jarFileName))) {
                    return meta;
                }
                if (meta && typeof meta === 'object') {
                    return await repairMetadata(serverDir, meta);
                }
            }
        }
    } catch (_) {}

    return await repairMetadata(serverDir, null);
}

async function repairMetadata(serverDir, existingMeta = null) {
    const metaPath = path.join(serverDir, '.mcmeta.json');
    const meta = (existingMeta && typeof existingMeta === 'object') ? { ...existingMeta } : {};

    // 1. Scan for jar files in serverDir
    let foundJar = '';
    try {
        const files = await fs.readdir(serverDir);
        const jars = files.filter(f => f.toLowerCase().endsWith('.jar'));

        if (meta.jarFileName && jars.includes(meta.jarFileName)) {
            foundJar = meta.jarFileName;
        } else {
            // Find paper or server jar
            const paperJar = jars.find(j => j.toLowerCase().startsWith('paper'));
            if (paperJar) {
                foundJar = paperJar;
            } else if (jars.length > 0) {
                foundJar = jars[0];
            }
        }
    } catch (_) {}

    // 2. Deducing Minecraft version
    let detectedVer = meta.version || '';
    if (foundJar) {
        if (foundJar.includes('26.2')) {
            detectedVer = '26.2 (Chaos Cubed Update)';
        } else if (foundJar.includes('26.1')) {
            detectedVer = '26.1 (Tiny Takeover Update)';
        } else {
            const vMatch = foundJar.match(/([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-rc[0-9]+|-pre[0-9]+)?)/i);
            if (vMatch) {
                const candidate = vMatch[1];
                const catalogMatch = Object.keys(PAPER_VERSIONS).find(k => k.startsWith(candidate) || candidate.startsWith(k));
                detectedVer = catalogMatch || candidate;
            }
        }
    }

    if (!detectedVer) {
        try {
            const vhPath = path.join(serverDir, 'version_history.json');
            if (fsSync.existsSync(vhPath)) {
                const vh = JSON.parse(await fs.readFile(vhPath, 'utf-8'));
                if (vh.currentVersion) {
                    const match = vh.currentVersion.match(/([0-9]+\.[0-9]+(?:\.[0-9]+)?)/);
                    if (match) detectedVer = match[1];
                }
            }
        } catch (_) {}
    }

    if (!detectedVer) {
        detectedVer = '26.2 (Chaos Cubed Update)';
    }

    // 3. If jar is missing, auto-download Paper jar
    if (!foundJar) {
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('console-data', `[Nuvyra-Craft] Server core JAR missing. Auto-downloading Paper ${detectedVer}...\n`);
            }
            foundJar = await downloadPaperJar(serverDir, detectedVer);
        } catch (_) {
            foundJar = 'paper.jar';
        }
    }

    meta.jarFileName = foundJar;
    meta.version = detectedVer;
    meta.ram = parseInt(meta.ram, 10) || 2048;
    meta.cpu = parseInt(meta.cpu, 10) || 2;
    meta.javaVersion = meta.javaVersion || 'auto';

    try {
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('console-data', `[Nuvyra-Craft] Auto-healed server metadata (.mcmeta.json) [Core: ${foundJar}, MC: ${detectedVer}, RAM: ${meta.ram}MB]\n`);
        }
    } catch (_) {}

    return meta;
}

// ── Server Settings Actions ──────────────────────────────────
ipcMain.handle('reinstall-server', async () => {
    if (!currentServerDir) throw new Error('No server directory set.');
    if (serverRunning) throw new Error('Stop the server first.');
    const metaData = await ensureServerMetadata(currentServerDir);
    // Redownload the jar
    metaData.jarFileName = await downloadServerSoftware(currentServerDir, metaData.serverType || 'paper', metaData.version);
    const metaPath = path.join(currentServerDir, '.mcmeta.json');
    await fs.writeFile(metaPath, JSON.stringify(metaData, null, 2));
    return true;
});

ipcMain.handle('change-version', async (_, version) => {
    if (!currentServerDir) throw new Error('No server directory set.');
    if (serverRunning) throw new Error('Stop the server first.');
    const metaData = await ensureServerMetadata(currentServerDir);
    
    // Remove old jar if exists
    if (metaData.jarFileName) {
        const oldJar = path.join(currentServerDir, metaData.jarFileName);
        if (fsSync.existsSync(oldJar)) fsSync.unlinkSync(oldJar);
    }

    // Download new jar and update meta
    metaData.version = version;
    metaData.jarFileName = await downloadServerSoftware(currentServerDir, metaData.serverType || 'paper', version);

    // If javaVersion is 'auto', ensure recommended Java version is ready
    const recJava = getRecommendedJavaVersion(version);
    if ((!metaData.javaVersion || metaData.javaVersion === 'auto') && installDir && !findPortableJava(installDir, recJava)) {
        await downloadJavaRuntime(installDir, recJava, 'java-download-progress');
    }

    const metaPath = path.join(currentServerDir, '.mcmeta.json');
    await fs.writeFile(metaPath, JSON.stringify(metaData, null, 2));
    return metaData;
});

// ── Java Settings IPC Handlers ──────────────────────────────
ipcMain.handle('get-java-settings', async () => {
    if (!currentServerDir) throw new Error('No server directory set.');
    const meta = await ensureServerMetadata(currentServerDir);

    const currentSetting = meta.javaVersion || 'auto';
    const recommendedVersion = getRecommendedJavaVersion(meta.version);
    const targetVer = (currentSetting === 'auto') ? recommendedVersion : parseInt(currentSetting, 10);

    const runtimes = getInstalledJavaRuntimes(installDir);
    const installedVersions = runtimes.map(r => r.version).filter(Boolean);
    const activePath = findPortableJava(installDir, targetVer);

    return {
        configuredSetting: currentSetting,
        recommendedVersion,
        activeVersion: targetVer,
        installedVersions,
        activePath: activePath || 'System Java',
        serverVersion: meta.version || 'unknown'
    };
});

ipcMain.handle('set-java-version', async (_, chosenSetting) => {
    if (!currentServerDir) throw new Error('No server directory set.');
    if (serverRunning) throw new Error('Stop the server before changing Java version.');

    const meta = await ensureServerMetadata(currentServerDir);

    const setting = chosenSetting || 'auto';
    meta.javaVersion = setting;
    const metaPath = path.join(currentServerDir, '.mcmeta.json');
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));

    const recVer = getRecommendedJavaVersion(meta.version);
    const targetVer = (setting === 'auto') ? recVer : parseInt(setting, 10);

    let activePath = findPortableJava(installDir, targetVer);
    let justDownloaded = false;

    if (!activePath && installDir) {
        await downloadJavaRuntime(installDir, targetVer, 'java-download-progress');
        activePath = findPortableJava(installDir, targetVer);
        justDownloaded = true;
    }

    return {
        success: true,
        configuredSetting: setting,
        recommendedVersion: recVer,
        activeVersion: targetVer,
        activePath,
        justDownloaded
    };
});

ipcMain.handle('delete-server', async () => {
    if (!currentServerDir) throw new Error('No server directory set.');
    if (serverRunning) {
        try { serverProcess.kill(); } catch (e) {}
        serverRunning = false;
        serverProcess = null;
    }
    await fs.rm(currentServerDir, { recursive: true, force: true });
    currentServerDir = '';
    return true;
});

// ── Server process lifecycle ────────────────────────────────
ipcMain.handle('server-start', async () => {
    if (serverProcess) throw new Error('Server is already running.');
    if (!currentServerDir) throw new Error('No server directory set.');

    const meta = await ensureServerMetadata(currentServerDir);

    // Port check & auto-healing
    const propsPath = path.join(currentServerDir, 'server.properties');
    let propsContent = await fs.readFile(propsPath, 'utf-8').catch(() => '');
    const hasServerPort = /(?:^|[\r\n])\s*server-port\s*=\s*(\d+)/.test(propsContent);
    const portMatch = propsContent.match(/(?:^|[\r\n])\s*server-port\s*=\s*(\d+)/);
    let port = portMatch ? parseInt(portMatch[1], 10) : 25565;

    // Safety guard: Minecraft server port must never be 0 or out of range
    if (!hasServerPort || !port || port <= 0 || port > 65535) {
        port = 25565;
        // Auto-heal server.properties if server-port was corrupted to 0 or missing
        if (hasServerPort) {
            propsContent = propsContent.replace(/(?:^|[\r\n])\s*server-port\s*=\s*\d+/g, '\nserver-port=25565');
        } else {
            propsContent += '\nserver-port=25565\n';
        }
        await fs.writeFile(propsPath, propsContent, 'utf-8').catch(() => {});
    }

    let portCheck = await checkPortInUse(port);
    if (portCheck) {
        // Check if an orphaned Java process from a previous run is holding the port
        const orphanPid = await findProcessOnPort(port);
        if (orphanPid) {
            const isJava = await isJavaProcess(orphanPid);
            if (isJava) {
                mainWindow.webContents.send('console-data', `[Nuvyra-Craft] Port ${port} is occupied by an orphaned Java process (PID ${orphanPid}). Terminating orphaned process...\n`);
                await new Promise(r => exec(`taskkill /F /T /PID ${orphanPid}`, () => r()));
                await new Promise(r => setTimeout(r, 600));
                portCheck = await checkPortInUse(port);
            }
        }
    }
    if (portCheck) throw new Error(`Port ${port} is already in use.`);

    // Determine Java executable based on server config & Minecraft version
    const configuredSetting = meta.javaVersion || 'auto';
    const recommendedVersion = getRecommendedJavaVersion(meta.version);
    const targetVer = (configuredSetting === 'auto') ? recommendedVersion : parseInt(configuredSetting, 10);

    let javaCmd = 'java';
    if (installDir) {
        let portable = findPortableJava(installDir, targetVer);
        // If required Java version is missing, download it on-the-fly!
        if (!portable) {
            mainWindow.webContents.send('console-data', `[Nuvyra-Craft] Java ${targetVer} required for Minecraft ${meta.version} is not installed. Downloading Java ${targetVer}...\n`);
            await downloadJavaRuntime(installDir, targetVer, 'java-download-progress');
            portable = findPortableJava(installDir, targetVer);
        }
        if (portable) {
            portableJavaPath = portable;
            javaCmd = portable;
        }
    }

    const args = [
        `-Xms${meta.ram}M`,
        `-Xmx${meta.ram}M`,
        `-XX:ActiveProcessorCount=${meta.cpu}`,
        '-jar', meta.jarFileName,
        'nogui'
    ];

    serverProcess = spawn(javaCmd, args, { cwd: currentServerDir, stdio: ['pipe', 'pipe', 'pipe'] });
    serverRunning = true;
    mainWindow.webContents.send('server-state', 'running');

    // Playit tunnel is disabled (beta testing — coming soon)
    // Will be re-enabled in a future update

    serverProcess.stdout.on('data', d => mainWindow.webContents.send('console-data', d.toString()));
    serverProcess.stderr.on('data', d => mainWindow.webContents.send('console-data', d.toString()));

    serverProcess.on('error', e => {
        mainWindow.webContents.send('console-data', `\n[ERROR] ${e.message}\n`);
        serverProcess = null;
        serverRunning = false;
        mainWindow.webContents.send('server-state', 'stopped');
    });

    serverProcess.on('close', code => {
        const msg = code === 0
            ? '\n[Nuvyra-Craft] Server stopped gracefully.\n'
            : `\n[Nuvyra-Craft] Server stopped unexpectedly (exit code ${code}).\n`;
        mainWindow.webContents.send('console-data', msg);
        serverProcess = null;
        serverRunning = false;
        mainWindow.webContents.send('server-state', 'stopped');
    });

    return { success: true };
});

ipcMain.handle('server-stop', () => {
    if (!serverProcess) return;
    try { serverProcess.stdin.write('stop\n'); } catch (_) {}
    if (playitProcess) {
        try { playitProcess.kill('SIGINT'); } catch (e) {}
        playitProcess = null;
    }
});

ipcMain.handle('server-restart', async () => {
    if (serverProcess) {
        try { serverProcess.stdin.write('save-all\n'); } catch (_) {}
        await new Promise(r => setTimeout(r, 600));
        try { serverProcess.stdin.write('stop\n'); } catch (_) {}
        let waited = 0;
        while (serverProcess && waited < 12) {
            await new Promise(r => setTimeout(r, 500));
            waited++;
        }
        if (serverProcess) {
            try {
                if (serverProcess.pid) exec(`taskkill /F /T /PID ${serverProcess.pid}`, () => {});
                else serverProcess.kill();
            } catch (_) {}
            serverProcess = null;
            serverRunning = false;
        }
    }
    if (currentServerDir) {
        const propsPath = path.join(currentServerDir, 'server.properties');
        let propsContent = await fs.readFile(propsPath, 'utf-8').catch(() => '');
        const portMatch = propsContent.match(/(?:^|[\r\n])\s*server-port\s*=\s*(\d+)/);
        let port = portMatch ? parseInt(portMatch[1], 10) : 25565;
        for (let i = 0; i < 10; i++) {
            const inUse = await checkPortInUse(port);
            if (!inUse) break;
            await new Promise(r => setTimeout(r, 400));
        }
    }
    await new Promise(r => setTimeout(r, 500));
    // Trigger server-start logic
    const startHandler = ipcMain._invokeHandlers ? ipcMain._invokeHandlers.get('server-start') : null;
    if (startHandler) return await startHandler(null);
    return { success: true };
});

ipcMain.handle('get-network-info', async () => {
    const interfaces = os.networkInterfaces();
    let bestLan = '127.0.0.1';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                bestLan = iface.address;
                break;
            }
        }
    }
    let port = 25565;
    if (currentServerDir) {
        try {
            const propsPath = path.join(currentServerDir, 'server.properties');
            const propsContent = await fs.readFile(propsPath, 'utf-8');
            const match = propsContent.match(/(?:^|[\r\n])\s*server-port\s*=\s*(\d+)/);
            if (match) port = parseInt(match[1], 10);
        } catch (_) {}
    }
    return {
        localIp: '127.0.0.1',
        lanIp: bestLan,
        port: port,
        sameDeviceJoin: `127.0.0.1:${port}`,
        lanJoin: `${bestLan}:${port}`,
        hotspotJoin: `${bestLan}:${port}`
    };
});

ipcMain.handle('server-kill', () => {
    if (serverProcess) {
        try {
            if (process.platform === 'win32' && serverProcess.pid) exec(`taskkill /F /T /PID ${serverProcess.pid}`, () => {});
            else serverProcess.kill('SIGKILL');
        } catch (_) {}
    }
    if (playitProcess) { try { playitProcess.kill('SIGKILL'); } catch (_) {} playitProcess = null; }
    serverProcess = null;
    serverRunning = false;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('server-state', 'stopped');
    return { success: true };
});

ipcMain.handle('server-command', (_, cmd) => {
    if (!serverProcess || !serverProcess.stdin.writable) throw new Error('Server not running.');
    serverProcess.stdin.write(cmd + '\n');
});

ipcMain.handle('server-status', () => serverRunning);

// ── File Manager ────────────────────────────────────────────
ipcMain.handle('fm-list', async (_, relDir) => {
    const target = relDir
        ? path.join(currentServerDir, relDir)
        : currentServerDir;

    const entries = await fs.readdir(target, { withFileTypes: true });
    const result = [];
    for (const e of entries) {
        const full = path.join(target, e.name);
        const stat = await fs.stat(full);
        result.push({
            name: e.name,
            isDir: e.isDirectory(),
            size: stat.size,
            rel: relDir ? relDir + '/' + e.name : e.name
        });
    }
    result.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
    });
    return result;
});

ipcMain.handle('fm-read', async (_, relPath) => {
    if (relPath && relPath.toLowerCase().endsWith('.jar')) {
        throw new Error('JAR executable files cannot be opened in the text editor.');
    }
    const full = path.join(currentServerDir, relPath);
    const stat = await fs.stat(full);
    if (stat.size > 3 * 1024 * 1024) {
        throw new Error('File is too large to open in the text editor (> 3MB).');
    }
    return await fs.readFile(full, 'utf-8');
});

ipcMain.handle('fm-write', async (_, relPath, content) => {
    const full = path.join(currentServerDir, relPath);
    await fs.writeFile(full, content, 'utf-8');
});

ipcMain.handle('fm-delete', async (_, relPath) => {
    if (!currentServerDir) throw new Error('No server directory set.');
    if (!relPath) return;
    const cleanRel = String(relPath).replace(/\\/g, '/').replace(/^\//, '').trim();
    if (cleanRel === '.mcmeta.json') {
        throw new Error('Protected system file: .mcmeta.json cannot be deleted.');
    }
    const full = path.join(currentServerDir, relPath);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) {
        await fs.rm(full, { recursive: true, force: true });
    } else {
        await fs.unlink(full);
    }
});

ipcMain.handle('fm-rename', async (_, relPath, newName) => {
    if (!currentServerDir) throw new Error('No server directory set.');
    if (!relPath) return;
    const cleanRel = String(relPath).replace(/\\/g, '/').replace(/^\//, '').trim();
    if (cleanRel === '.mcmeta.json') {
        throw new Error('Protected system file: .mcmeta.json cannot be renamed.');
    }
    const full = path.join(currentServerDir, relPath);
    const dir = path.dirname(full);
    await fs.rename(full, path.join(dir, newName));
});

ipcMain.handle('fm-delete-batch', async (_, relPaths) => {
    if (!currentServerDir) throw new Error('No server directory set.');
    if (!Array.isArray(relPaths) || relPaths.length === 0) return { success: true, count: 0 };

    let deletedCount = 0;
    for (const relPath of relPaths) {
        if (!relPath) continue;
        const cleanRel = String(relPath).replace(/\\/g, '/').replace(/^\//, '').trim();
        // Strict protection for system metadata
        if (cleanRel === '.mcmeta.json') continue;

        try {
            const full = path.join(currentServerDir, relPath);
            if (!fsSync.existsSync(full)) continue;
            const stat = await fs.stat(full);
            if (stat.isDirectory()) {
                await fs.rm(full, { recursive: true, force: true });
            } else {
                await fs.unlink(full);
            }
            deletedCount++;
        } catch (e) {
            console.warn(`[fm-delete-batch] Could not delete ${relPath}:`, e.message);
        }
    }
    return { success: true, count: deletedCount };
});

// ── World Manager ───────────────────────────────────────────
async function getDirSize(dir) {
    let total = 0;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) total += await getDirSize(p);
        else { const s = await fs.stat(p); total += s.size; }
    }
    return total;
}

ipcMain.handle('world-list', async () => {
    if (!currentServerDir) return [];
    const entries = await fs.readdir(currentServerDir, { withFileTypes: true });
    const worlds = [];
    for (const e of entries) {
        if (!e.isDirectory()) continue;
        const levelDat = path.join(currentServerDir, e.name, 'level.dat');
        if (fsSync.existsSync(levelDat)) {
            const size = await getDirSize(path.join(currentServerDir, e.name));
            worlds.push({ name: e.name, sizeMB: (size / 1024 / 1024).toFixed(1) });
        }
    }
    return worlds;
});

ipcMain.handle('world-delete', async (_, name) => {
    const full = path.join(currentServerDir, name);
    await fs.rm(full, { recursive: true, force: true });
});

// ── Archive Extraction Helper (zip, rar, tar, gz, 7z) ────────
async function extractArchive(archivePath, destDir) {
    await fs.mkdir(destDir, { recursive: true });
    const ext = path.extname(archivePath).toLowerCase();

    let tarErr = null;
    try {
        await new Promise((resolve, reject) => {
            execFile('tar', ['-xf', archivePath, '-C', destDir], { windowsHide: true }, (err, stdout, stderr) => {
                if (err) return reject(new Error(stderr || err.message));
                resolve();
            });
        });
        return;
    } catch (e) {
        tarErr = e;
    }

    // If .zip, fallback to PowerShell Expand-Archive
    if (ext === '.zip') {
        try {
            await new Promise((resolve, reject) => {
                const psCmd = `Expand-Archive -LiteralPath "${archivePath.replace(/"/g, '`"')}" -DestinationPath "${destDir.replace(/"/g, '`"')}" -Force`;
                execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd], { windowsHide: true }, (err, stdout, stderr) => {
                    if (err) return reject(new Error(stderr || err.message));
                    resolve();
                });
            });
            return;
        } catch (psErr) {
            throw new Error(`Extraction failed: ${psErr.message || tarErr.message}`);
        }
    }

    throw new Error(`Extraction failed: ${tarErr ? tarErr.message : 'Unknown error'}`);
}

ipcMain.handle('world-import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import World (.zip, .rar)',
        filters: [{ name: 'World Archives', extensions: ['zip', 'rar', 'tar', 'gz', '7z'] }],
        properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return null;

    const archivePath = result.filePaths[0];
    const baseExt = path.extname(archivePath);
    const destName = path.basename(archivePath, baseExt);
    const dest = path.join(currentServerDir, destName);
    await fs.mkdir(dest, { recursive: true });
    await extractArchive(archivePath, dest);
    return destName;
});

// ── Player Manager ──────────────────────────────────────────
async function readJsonSafe(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return [];
    }
}

ipcMain.handle('players-get', async () => {
    const ops = await readJsonSafe(path.join(currentServerDir, 'ops.json'));
    const whitelist = await readJsonSafe(path.join(currentServerDir, 'whitelist.json'));
    const banned = await readJsonSafe(path.join(currentServerDir, 'banned-players.json'));
    return { ops, whitelist, banned };
});

ipcMain.handle('players-add', async (_, listName, playerName) => {
    const file = path.join(currentServerDir, listName);
    const data = await readJsonSafe(file);
    // Prevent duplicates
    if (data.find(p => (p.name || '').toLowerCase() === playerName.toLowerCase())) {
        throw new Error(`${playerName} already exists in ${listName}`);
    }
    const entry = { name: playerName, uuid: '00000000-0000-0000-0000-000000000000' };
    if (listName === 'ops.json') {
        entry.level = 4;
        entry.bypassesPlayerLimit = false;
    }
    if (listName === 'banned-players.json') {
        entry.created = new Date().toISOString();
        entry.source = 'Nuvyra-Craft';
        entry.reason = 'Banned via Nuvyra-Craft';
        entry.expires = 'forever';
    }
    data.push(entry);
    await fs.writeFile(file, JSON.stringify(data, null, 2));
});

ipcMain.handle('players-remove', async (_, listName, playerName) => {
    const file = path.join(currentServerDir, listName);
    let data = await readJsonSafe(file);
    data = data.filter(p => (p.name || '').toLowerCase() !== playerName.toLowerCase());
    await fs.writeFile(file, JSON.stringify(data, null, 2));
});

// ── Server Properties ───────────────────────────────────────
ipcMain.handle('props-get', async () => {
    if (!currentServerDir) return {};
    const propsPath = path.join(currentServerDir, 'server.properties');
    if (!fsSync.existsSync(propsPath)) return {};
    const content = await fs.readFile(propsPath, 'utf-8');
    const lines = content.split('\n');
    const props = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        props[trimmed.substring(0, idx)] = trimmed.substring(idx + 1);
    }
    // Safety: ensure server-port is always valid and never 0
    if (props['server-port'] !== undefined) {
        const p = parseInt(props['server-port'], 10);
        if (!p || p <= 0 || p > 65535) {
            props['server-port'] = '25565';
        }
    }
    return props;
});

ipcMain.handle('props-save', async (_, propsObj) => {
    if (!currentServerDir || !propsObj || typeof propsObj !== 'object') return;

    // Safety: ensure server-port is never saved as 0 or out of range
    if (propsObj['server-port'] !== undefined) {
        const p = parseInt(propsObj['server-port'], 10);
        if (!p || p <= 0 || p > 65535) {
            propsObj['server-port'] = '25565';
        } else {
            propsObj['server-port'] = String(p);
        }
    }

    let content = '#Minecraft server properties\n#Generated by Nuvyra-Craft\n';
    for (const [k, v] of Object.entries(propsObj)) {
        content += `${k}=${v}\n`;
    }
    await fs.writeFile(path.join(currentServerDir, 'server.properties'), content);
});

// ── Backup ──────────────────────────────────────────────────
ipcMain.handle('create-backup', async (_, mode) => {
    if (!currentServerDir || !installDir) throw new Error('No server configured.');

    const backupDir = path.join(installDir, 'backups');
    await fs.mkdir(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipName = `backup_${timestamp}.zip`;
    const zipPath = path.join(backupDir, zipName);

    return new Promise((resolve, reject) => {
        const output = fsSync.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 5 } });

        let totalBytes = 0;
        archive.on('progress', p => {
            totalBytes = p.fs.totalBytes || 1;
            const percent = Math.round((p.fs.processedBytes / totalBytes) * 100);
            mainWindow.webContents.send('backup-progress', percent);
        });

        output.on('close', () => {
            resolve({ path: zipPath, sizeMB: (archive.pointer() / 1024 / 1024).toFixed(2) });
        });
        archive.on('error', reject);

        archive.pipe(output);

        if (mode === 'worlds') {
            // Only world folders
            const entries = fsSync.readdirSync(currentServerDir, { withFileTypes: true });
            for (const e of entries) {
                if (e.isDirectory() && fsSync.existsSync(path.join(currentServerDir, e.name, 'level.dat'))) {
                    archive.directory(path.join(currentServerDir, e.name), e.name);
                }
            }
        } else {
            archive.directory(currentServerDir, false);
        }
        archive.finalize();
    });
});
ipcMain.handle('get-server-dir', () => currentServerDir);

// ── File Manager Upload (Drag & Drop & IPC) ───────────────────
ipcMain.handle('fm-upload', async (_, relDir, sourcePaths) => {
    if (!currentServerDir) throw new Error('No server selected.');
    if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) return { count: 0 };
    const targetDir = relDir ? path.join(currentServerDir, relDir) : currentServerDir;
    await fs.mkdir(targetDir, { recursive: true });
    let count = 0;
    for (const src of sourcePaths) {
        if (typeof src !== 'string' || !src.trim()) continue;
        const fileName = path.basename(src);
        const targetPath = path.join(targetDir, fileName);
        await fs.copyFile(src, targetPath);
        count++;
    }
    return { success: true, count };
});

ipcMain.handle('fm-upload-dialog', async (_, relDir) => {
    if (!currentServerDir) throw new Error('No server selected.');
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Files to Upload',
        filters: [
            { name: 'All Files (*.*)', extensions: ['*'] },
            { name: 'Archives / Backups (*.zip, *.rar, *.tar.gz, *.7z)', extensions: ['zip', 'rar', 'tar', 'gz', '7z'] },
            { name: 'Plugins (*.jar)', extensions: ['jar'] },
            { name: 'Configs (*.yml, *.yaml, *.json, *.properties)', extensions: ['yml', 'yaml', 'json', 'properties', 'txt'] }
        ],
        properties: ['openFile', 'multiSelections']
    });

    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const targetDir = relDir ? path.join(currentServerDir, relDir) : currentServerDir;
    await fs.mkdir(targetDir, { recursive: true });

    const uploaded = [];
    for (const src of result.filePaths) {
        if (typeof src !== 'string' || !src.trim()) continue;
        const fileName = path.basename(src);
        const targetPath = path.join(targetDir, fileName);
        await fs.copyFile(src, targetPath);
        uploaded.push(fileName);
    }
    return { success: true, count: uploaded.length, files: uploaded };
});

// ── File Manager Archive Extract / Unzip ─────────────────────
ipcMain.handle('fm-extract', async (_, relDir, fileName) => {
    if (!currentServerDir) throw new Error('No server selected.');
    if (!fileName || typeof fileName !== 'string') throw new Error('File name is required.');

    const targetDir = relDir ? path.join(currentServerDir, relDir) : currentServerDir;
    const archivePath = path.join(targetDir, fileName);

    if (!fsSync.existsSync(archivePath)) {
        throw new Error(`File "${fileName}" does not exist.`);
    }

    const isArchive = /\.(zip|rar|tar\.gz|tgz|tar|7z)$/i.test(fileName);
    if (!isArchive) {
        throw new Error(`"${fileName}" is not a supported archive format (.zip, .rar, .tar.gz, .tar, .7z).`);
    }

    await extractArchive(archivePath, targetDir);
    return { success: true, fileName };
});

// ── Player Manager Cache ────────────────────────────────────
ipcMain.handle('players-get-cache', async () => {
    if (!currentServerDir) return [];
    try {
        const cachePath = path.join(currentServerDir, 'usercache.json');
        if (fsSync.existsSync(cachePath)) {
            const content = await fs.readFile(cachePath, 'utf-8');
            return JSON.parse(content);
        }
    } catch (e) {}
    return [];
});

// ── Playit Executable ─────────────────────────────────────────────
ipcMain.handle('playit-check', async () => {
    if (!currentServerDir) return false;
    const playitPath = path.join(currentServerDir, 'playit.exe');
    return fsSync.existsSync(playitPath);
});

ipcMain.handle('playit-install', async () => {
    if (!currentServerDir) throw new Error('No server selected.');
    const playitPath = path.join(currentServerDir, 'playit.exe');

    try {
        // Download the playit standalone executable for windows
        const downloadUrl = 'https://github.com/playit-cloud/playit-agent/releases/download/v0.15.13/playit-windows-x86_64.exe';

        const resp = await axios({ url: downloadUrl, method: 'GET', responseType: 'stream', timeout: 300000 });
        const writer = fsSync.createWriteStream(playitPath);
        resp.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        return true;
    } catch (e) {
        throw new Error('Failed to download Playit executable: ' + e.message);
    }
});

ipcMain.handle('playit-remove', async () => {
    if (!currentServerDir) throw new Error('No server selected.');
    const playitPath = path.join(currentServerDir, 'playit.exe');
    if (fsSync.existsSync(playitPath)) {
        await fs.unlink(playitPath);
    }
    return true;
});

// ══════════════════════════════════════════════════════════
//  PLUGIN MANAGER (Browse, Search, 1-Click Install, Manage)
// ══════════════════════════════════════════════════════════

// Curated top Minecraft plugins catalog for instant browsing & reliable fallback
// Curated top Minecraft plugins catalog for instant browsing & reliable offline fallback
const CURATED_PLUGINS = [
    {
        id: "viaversion",
        slug: "viaversion",
        title: "ViaVersion",
        author: "FlorianMichael",
        description: "Allows newer Minecraft client versions to connect to older server versions seamlessly.",
        icon_url: "https://cdn.modrinth.com/data/P1OZGk5p/ad14260a7308dc9e4c3385f3f6b5bdabfe17f295_96.webp",
        downloads: 12500000,
        categories: ["utility", "management"],
        defaultFileName: "ViaVersion.jar"
    },
    {
        id: "viabackwards",
        slug: "viabackwards",
        title: "ViaBackwards",
        author: "FlorianMichael",
        description: "Allows older Minecraft client versions to connect to newer server versions.",
        icon_url: "https://cdn.modrinth.com/data/spvEWuz4/c30ec7bf771be79b7692b1b427771765c9288e15_96.webp",
        downloads: 8900000,
        categories: ["utility", "management"],
        defaultFileName: "ViaBackwards.jar"
    },
    {
        id: "viarewind",
        slug: "viarewind",
        title: "ViaRewind",
        author: "ViaVersion",
        description: "ViaVersion addon enabling 1.8.x and 1.7.x clients to connect to newer server versions.",
        icon_url: "https://cdn.modrinth.com/data/TbHIxhx5/f59ffe031387b06a9b1efa736dbbb4db44284574_96.webp",
        downloads: 620000,
        categories: ["utility", "management"],
        defaultFileName: "ViaRewind.jar"
    },
    {
        id: "luckperms",
        slug: "luckperms",
        title: "LuckPerms",
        author: "Luck",
        description: "An advanced, high performance permissions management plugin with a powerful web editor.",
        icon_url: "https://cdn.modrinth.com/data/Vebnzrzj/icon.png",
        downloads: 11200000,
        categories: ["administration", "security"],
        defaultFileName: "LuckPerms.jar"
    },
    {
        id: "essentialsx",
        slug: "essentialsx",
        title: "EssentialsX",
        author: "EssentialsX Team",
        description: "The essential plugin suite for Minecraft servers, providing /home, /spawn, economy, warps and 100+ commands.",
        icon_url: "https://cdn.modrinth.com/data/O0JyUcuU/icon.png",
        downloads: 15400000,
        categories: ["utility", "economy", "administration"],
        defaultFileName: "EssentialsX.jar"
    },
    {
        id: "geyser",
        slug: "geyser",
        title: "Geyser",
        author: "GeyserMC",
        description: "A bridge/proxy enabling Minecraft Bedrock Edition players to join your Java Edition server.",
        icon_url: "https://cdn.modrinth.com/data/wKkoqHrH/icon.png",
        downloads: 7800000,
        categories: ["utility", "network"],
        directDownload: "https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot",
        defaultFileName: "Geyser-Spigot.jar"
    },
    {
        id: "floodgate",
        slug: "floodgate",
        title: "Floodgate",
        author: "GeyserMC",
        description: "Allows Bedrock players to join without needing a Java Edition account (pairs with Geyser).",
        icon_url: "https://cdn.modrinth.com/data/bWrNNfkb/icon.png",
        downloads: 5600000,
        categories: ["utility", "security"],
        directDownload: "https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot",
        defaultFileName: "floodgate-spigot.jar"
    },
    {
        id: "worldedit",
        slug: "worldedit",
        title: "WorldEdit",
        author: "EngineHub",
        description: "In-game Minecraft map editor. Fast block manipulation, schematics, terraforming, and brush tools.",
        icon_url: "https://cdn.modrinth.com/data/1e2GlzzA/icon.png",
        downloads: 14200000,
        categories: ["world", "creative"],
        defaultFileName: "worldedit-bukkit.jar"
    },
    {
        id: "worldguard",
        slug: "worldguard",
        title: "WorldGuard",
        author: "EngineHub",
        description: "Protect regions, prevent fires, disable creeper damage, and manage land ownership flags.",
        icon_url: "https://cdn.modrinth.com/data/np5eeBdh/icon.png",
        downloads: 9200000,
        categories: ["security", "world"],
        defaultFileName: "WorldGuard.jar"
    },
    {
        id: "vault",
        slug: "vault",
        title: "Vault",
        author: "MilkBowl",
        description: "Essential permissions and economy abstraction API used by almost all economy and shop plugins.",
        icon_url: "https://cdn.modrinth.com/data/YYXW3k6s/icon.png",
        downloads: 13900000,
        categories: ["utility", "economy"],
        directDownload: "https://github.com/MilkBowl/Vault/releases/download/1.7.3/Vault.jar",
        defaultFileName: "Vault.jar"
    },
    {
        id: "coreprotect",
        slug: "coreprotect",
        title: "CoreProtect",
        author: "Intelli",
        description: "Fast, efficient data logging, anti-griefing, block inspection, and rollback tool.",
        icon_url: "https://cdn.modrinth.com/data/Lu5Kuzh3/icon.png",
        downloads: 6700000,
        categories: ["security", "administration"],
        defaultFileName: "CoreProtect.jar"
    },
    {
        id: "chunky",
        slug: "chunky",
        title: "Chunky",
        author: "pop4959",
        description: "Pre-generates world chunks quickly and efficiently to prevent server lag when players explore.",
        icon_url: "https://cdn.modrinth.com/data/fALzjamp/icon.png",
        downloads: 4800000,
        categories: ["optimization", "world"],
        defaultFileName: "Chunky.jar"
    },
    {
        id: "spark",
        slug: "spark",
        title: "spark",
        author: "Luck",
        description: "Performance profiling and diagnosis tool for Minecraft servers. Find TPS drops, memory leaks, and CPU lag.",
        icon_url: "https://cdn.modrinth.com/data/l6YH9Als/icon.png",
        downloads: 6200000,
        categories: ["optimization"],
        defaultFileName: "spark.jar"
    },
    {
        id: "placeholderapi",
        slug: "placeholderapi",
        title: "PlaceholderAPI",
        author: "HelpChat",
        description: "Allows plugins to share and display placeholders (player stats, balances, ranks, server info).",
        icon_url: "https://cdn.modrinth.com/data/bW5OtiuG/icon.png",
        downloads: 9800000,
        categories: ["utility"],
        defaultFileName: "PlaceholderAPI.jar"
    },
    {
        id: "decentholograms",
        slug: "decentholograms",
        title: "DecentHolograms",
        author: "DecentSoftware",
        description: "Lightweight and powerful hologram plugin supporting click actions, animations, and pages.",
        icon_url: "https://cdn.modrinth.com/data/23WvEwhU/icon.png",
        downloads: 3900000,
        categories: ["utility", "decorative"],
        defaultFileName: "DecentHolograms.jar"
    },
    {
        id: "skinsrestorer",
        slug: "skinsrestorer",
        title: "SkinsRestorer",
        author: "SkinsRestorer",
        description: "Restores player skins for offline-mode servers and allows custom skin changes via command.",
        icon_url: "https://cdn.modrinth.com/data/7bfaQ47v/icon.png",
        downloads: 5100000,
        categories: ["utility"],
        defaultFileName: "SkinsRestorer.jar"
    },
    {
        id: "multiverse-core",
        slug: "multiverse-core",
        title: "Multiverse-Core",
        author: "Multiverse",
        description: "Easily create, import, and manage multiple worlds on a single server with custom portals.",
        icon_url: "https://cdn.modrinth.com/data/g8e1mQ1t/icon.png",
        downloads: 8100000,
        categories: ["world", "management"],
        defaultFileName: "Multiverse-Core.jar"
    },
    {
        id: "tab-was-taken",
        slug: "tab-was-taken",
        title: "TAB",
        author: "NEZNAMY",
        description: "An outstanding custom tablist, nametag, bossbar, and scoreboard formatting plugin.",
        icon_url: "https://cdn.modrinth.com/data/bW5OtiuG/icon.png",
        downloads: 4500000,
        categories: ["utility", "decorative"],
        defaultFileName: "TAB.jar"
    },
    {
        id: "grimac",
        slug: "grimac",
        title: "Grim Anticheat",
        author: "GrimAC",
        description: "Modern 1.8-1.21+ deterministic, zero-false-positive packet-level anticheat for Paper.",
        icon_url: "https://cdn.modrinth.com/data/F620n2g1/icon.png",
        downloads: 1800000,
        categories: ["security", "administration"],
        defaultFileName: "GrimAC.jar"
    },
    {
        id: "simple-voice-chat",
        slug: "simple-voice-chat",
        title: "Simple Voice Chat",
        author: "henkelmax",
        description: "Proximity voice chat in Minecraft! Hear players speak based on their distance and position.",
        icon_url: "https://cdn.modrinth.com/data/9eGKhmgb/icon.png",
        downloads: 66900000,
        categories: ["social", "utility"],
        defaultFileName: "voicechat-bukkit.jar"
    },
    {
        id: "fastasyncworldedit",
        slug: "fastasyncworldedit",
        title: "FastAsyncWorldEdit (FAWE)",
        author: "IntellectualSites",
        description: "Blazingly fast, asynchronous WorldEdit implementation optimized to prevent server lag.",
        icon_url: "https://cdn.modrinth.com/data/u55v77aN/icon.png",
        downloads: 3200000,
        categories: ["world", "optimization"],
        defaultFileName: "FastAsyncWorldEdit.jar"
    },
    {
        id: "gsit",
        slug: "gsit",
        title: "GSit",
        author: "Gecolay",
        description: "Allows players to sit on stairs/slabs, crawl anywhere, lay down, and emote smoothly.",
        icon_url: "https://cdn.modrinth.com/data/2mhnWp7Q/icon.png",
        downloads: 2400000,
        categories: ["utility", "fun"],
        defaultFileName: "GSit.jar"
    },
    {
        id: "griefprevention",
        slug: "griefprevention",
        title: "GriefPrevention",
        author: "RoboMWM",
        description: "Self-service land claims with a golden shovel. Zero-admin grief prevention for survival servers.",
        icon_url: "https://cdn.modrinth.com/data/xZl9Kq1b/icon.png",
        downloads: 4100000,
        categories: ["security", "world"],
        defaultFileName: "GriefPrevention.jar"
    },
    {
        id: "farmcontrol",
        slug: "farmcontrol",
        title: "FarmControl",
        author: "froobynooby",
        description: "Drastically reduce lag from massive mob farms and breeding without breaking mechanics.",
        icon_url: "https://cdn.modrinth.com/data/fALzjamp/icon.png",
        downloads: 1200000,
        categories: ["optimization"],
        defaultFileName: "FarmControl.jar"
    },
    {
        id: "deluxemenus",
        slug: "deluxemenus",
        title: "DeluxeMenus",
        author: "clip",
        description: "Create stunning customizable GUI menus, server selectors, shops, and kits with ease.",
        icon_url: "https://cdn.modrinth.com/data/x4n924k8/icon.png",
        downloads: 3700000,
        categories: ["utility", "economy"],
        defaultFileName: "DeluxeMenus.jar"
    }
];

// Helper to get list of installed plugin file base names
async function getInstalledPluginFiles() {
    if (!currentServerDir) return [];
    const pluginsDir = path.join(currentServerDir, 'plugins');
    if (!fsSync.existsSync(pluginsDir)) return [];
    try {
        const files = await fs.readdir(pluginsDir);
        return files.filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'));
    } catch (_) {
        return [];
    }
}

// Helper to resolve the best downloadable server (.jar) file for a plugin
async function resolvePluginDownload(projectIdOrSlug) {
    // 1. Check curated list for direct download URL
    const curated = CURATED_PLUGINS.find(p => p.slug === projectIdOrSlug || p.id === projectIdOrSlug);
    if (curated && curated.directDownload) {
        return {
            downloadUrl: curated.directDownload,
            fileName: curated.defaultFileName || `${curated.title}.jar`,
            versionNumber: 'latest'
        };
    }

    // 2. Query Modrinth versions filtered for server platforms (Paper, Spigot, Bukkit, Purpur, Folia)
    const serverLoadersParam = encodeURIComponent(JSON.stringify(['paper', 'spigot', 'bukkit', 'purpur', 'folia']));
    const filterUrl = `https://api.modrinth.com/v2/project/${projectIdOrSlug}/version?loaders=${serverLoadersParam}`;

    let versionList = [];
    try {
        const resp = await axios.get(filterUrl, {
            headers: { 'User-Agent': 'NuvyraCraft/1.0 (https://github.com/NuvyraHost/Nuvyra-Craft)' },
            timeout: 10000
        });
        if (Array.isArray(resp.data) && resp.data.length > 0) {
            versionList = resp.data;
        }
    } catch (e) {
        console.warn('Filtered version fetch failed, trying unfiltered:', e.message);
    }

    // If no filtered versions found, query unfiltered versions
    if (versionList.length === 0) {
        try {
            const rawUrl = `https://api.modrinth.com/v2/project/${projectIdOrSlug}/version`;
            const rawResp = await axios.get(rawUrl, {
                headers: { 'User-Agent': 'NuvyraCraft/1.0 (https://github.com/NuvyraHost/Nuvyra-Craft)' },
                timeout: 10000
            });
            if (Array.isArray(rawResp.data)) {
                versionList = rawResp.data;
            }
        } catch (e) {
            console.error('Error fetching plugin versions:', e.message);
        }
    }

    if (versionList.length > 0) {
        // Iterate versions and select the best JAR file
        for (const ver of versionList) {
            if (!Array.isArray(ver.files) || ver.files.length === 0) continue;

            const jarFiles = ver.files.filter(f => 
                f.filename && 
                f.filename.endsWith('.jar') && 
                !f.filename.includes('-sources') && 
                !f.filename.includes('-dev') && 
                !f.filename.includes('-javadoc')
            );

            if (jarFiles.length === 0) continue;

            // Prioritize files with paper, spigot, bukkit, or marked primary
            const preferredJar = jarFiles.find(f => {
                const lower = f.filename.toLowerCase();
                return lower.includes('paper') || lower.includes('spigot') || lower.includes('bukkit') || lower.includes('purpur');
            }) || jarFiles.find(f => f.primary) || jarFiles[0];

            if (preferredJar && preferredJar.url) {
                return {
                    downloadUrl: preferredJar.url,
                    fileName: preferredJar.filename,
                    versionNumber: ver.version_number || 'latest',
                    size: preferredJar.size
                };
            }
        }
    }

    if (curated) {
        return {
            downloadUrl: curated.directDownload || `https://api.modrinth.com/v2/project/${curated.slug}/version`,
            fileName: curated.defaultFileName || `${curated.title}.jar`,
            versionNumber: 'latest'
        };
    }

    throw new Error('Could not find a downloadable Paper/Spigot JAR file for this plugin on Modrinth.');
}

ipcMain.handle('plugin-search', async (_, query, category) => {
    const installedFiles = await getInstalledPluginFiles();
    const isInstalled = (item) => {
        const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const sNorm = norm(item.slug);
        const tNorm = norm(item.title);
        return installedFiles.some(f => {
            const fNorm = norm(f.replace(/\.jar(\.disabled)?$/i, ''));
            return (sNorm && (fNorm.includes(sNorm) || sNorm.includes(fNorm))) ||
                   (tNorm && (fNorm.includes(tNorm) || tNorm.includes(fNorm)));
        });
    };

    const hasQuery = query && query.trim().length > 0;
    const cat = (category && category !== 'all') ? category : null;

    try {
        let url;
        const facets = [['project_type:plugin']];
        if (cat) {
            facets.push([`categories:${cat}`]);
        }
        const encodedFacets = encodeURIComponent(JSON.stringify(facets));

        if (hasQuery) {
            const encodedQuery = encodeURIComponent(query.trim());
            url = `https://api.modrinth.com/v2/search?query=${encodedQuery}&facets=${encodedFacets}&limit=40`;
        } else {
            url = `https://api.modrinth.com/v2/search?facets=${encodedFacets}&index=downloads&limit=40`;
        }

        const resp = await axios.get(url, {
            headers: { 'User-Agent': 'NuvyraCraft/1.0 (https://github.com/NuvyraHost/Nuvyra-Craft)' },
            timeout: 8000
        });

        if (resp.data && Array.isArray(resp.data.hits) && resp.data.hits.length > 0) {
            const results = resp.data.hits.map(hit => ({
                id: hit.project_id,
                slug: hit.slug,
                title: hit.title,
                description: hit.description,
                author: hit.author,
                icon_url: hit.icon_url || '',
                downloads: hit.downloads || 0,
                categories: hit.categories || [],
                isCurated: false
            }));

            // If empty query and category is all, blend in curated essentials at top
            if (!hasQuery && !cat) {
                const curatedMapped = CURATED_PLUGINS.map(c => ({ ...c, isCurated: true }));
                const combined = [...curatedMapped];
                for (const r of results) {
                    if (!combined.some(c => c.slug === r.slug)) {
                        combined.push(r);
                    }
                }
                return combined.map(item => ({ ...item, isInstalled: isInstalled(item) }));
            }

            return results.map(item => ({ ...item, isInstalled: isInstalled(item) }));
        }
    } catch (apiErr) {
        console.warn('Modrinth API live search failed, falling back to curated catalog:', apiErr.message);
    }

    // Fallback search over curated catalog
    let fallbackList = CURATED_PLUGINS.map(c => ({ ...c, isCurated: true }));
    if (cat) {
        fallbackList = fallbackList.filter(p => p.categories && p.categories.includes(cat));
    }
    if (hasQuery) {
        const q = query.toLowerCase();
        fallbackList = fallbackList.filter(p => 
            p.title.toLowerCase().includes(q) || 
            p.description.toLowerCase().includes(q) ||
            (p.author && p.author.toLowerCase().includes(q)) ||
            (p.slug && p.slug.toLowerCase().includes(q))
        );
    }
    return fallbackList.map(item => ({ ...item, isInstalled: isInstalled(item) }));
});

ipcMain.handle('plugin-get-version', async (_, projectIdOrSlug) => {
    return await resolvePluginDownload(projectIdOrSlug);
});

ipcMain.handle('plugin-install', async (_, opts) => {
    if (!currentServerDir) throw new Error('No server selected. Please create or open a server first.');
    const pluginsDir = path.join(currentServerDir, 'plugins');
    await fs.mkdir(pluginsDir, { recursive: true });

    let downloadUrl = opts.downloadUrl;
    let fileName = opts.fileName;

    if (!downloadUrl && opts.projectId) {
        const verInfo = await resolvePluginDownload(opts.projectId);
        downloadUrl = verInfo.downloadUrl;
        fileName = fileName || verInfo.fileName;
    }

    if (!downloadUrl) throw new Error('Download URL not found for this plugin.');
    if (!fileName) fileName = downloadUrl.split('/').pop().split('?')[0] || 'plugin.jar';
    if (!fileName.endsWith('.jar')) fileName += '.jar';

    const destPath = path.join(pluginsDir, fileName);
    const writer = fsSync.createWriteStream(destPath);

    try {
        const resp = await axios({
            url: downloadUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 180000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'NuvyraCraft/1.0 (https://github.com/NuvyraHost/Nuvyra-Craft)' }
        });

        const total = parseInt(resp.headers['content-length'] || '0', 10);
        let downloaded = 0;

        resp.data.on('data', chunk => {
            downloaded += chunk.length;
            if (total > 0 && mainWindow && !mainWindow.isDestroyed()) {
                const pct = Math.round((downloaded / total) * 100);
                mainWindow.webContents.send('plugin-download-progress', { fileName, pct });
            }
        });

        resp.data.pipe(writer);
        await new Promise((res, rej) => {
            writer.on('finish', res);
            writer.on('error', rej);
        });

        return { success: true, fileName };
    } catch (err) {
        writer.close();
        if (fsSync.existsSync(destPath) && fsSync.statSync(destPath).size === 0) {
            await fs.unlink(destPath).catch(() => {});
        }
        throw new Error(`Plugin download failed: ${err.message}`);
    }
});

ipcMain.handle('plugins-get-installed', async () => {
    if (!currentServerDir) return [];
    const pluginsDir = path.join(currentServerDir, 'plugins');
    if (!fsSync.existsSync(pluginsDir)) return [];

    try {
        const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
        const list = [];
        for (const e of entries) {
            if (e.isFile() && (e.name.endsWith('.jar') || e.name.endsWith('.jar.disabled'))) {
                const full = path.join(pluginsDir, e.name);
                const stat = await fs.stat(full);
                const isEnabled = e.name.endsWith('.jar');
                const displayName = e.name.replace(/\.jar(\.disabled)?$/, '');
                list.push({
                    name: displayName,
                    fileName: e.name,
                    sizeMB: (stat.size / 1024 / 1024).toFixed(2),
                    enabled: isEnabled
                });
            }
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
    } catch (e) {
        return [];
    }
});

ipcMain.handle('plugin-toggle', async (_, fileName) => {
    if (!currentServerDir) throw new Error('No server directory set.');
    const pluginsDir = path.join(currentServerDir, 'plugins');
    const oldPath = path.join(pluginsDir, fileName);

    let newFileName = '';
    if (fileName.endsWith('.jar')) {
        newFileName = fileName + '.disabled';
    } else if (fileName.endsWith('.jar.disabled')) {
        newFileName = fileName.replace(/\.disabled$/, '');
    } else {
        throw new Error('Invalid plugin file format.');
    }

    const newPath = path.join(pluginsDir, newFileName);
    await fs.rename(oldPath, newPath);
    return { success: true, newFileName };
});

ipcMain.handle('plugin-delete', async (_, fileName) => {
    if (!currentServerDir) throw new Error('No server directory set.');
    const fullPath = path.join(currentServerDir, 'plugins', fileName);
    if (fsSync.existsSync(fullPath)) {
        await fs.unlink(fullPath);
    }
    return { success: true };
});

ipcMain.handle('plugin-upload-local', async () => {
    if (!currentServerDir) throw new Error('No server directory set.');
    const pluginsDir = path.join(currentServerDir, 'plugins');
    await fs.mkdir(pluginsDir, { recursive: true });

    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Plugin JAR file',
        filters: [{ name: 'Minecraft Plugin (.jar)', extensions: ['jar'] }],
        properties: ['openFile', 'multiSelections']
    });

    if (result.canceled || !result.filePaths.length) return { canceled: true };

    const installed = [];
    for (const src of result.filePaths) {
        const base = path.basename(src);
        const dest = path.join(pluginsDir, base);
        await fs.copyFile(src, dest);
        installed.push(base);
    }
    return { success: true, installed };
});