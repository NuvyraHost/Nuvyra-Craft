// ============================================================
//  Nuvyra-Craft — Preload — Context Bridge (safe IPC exposure)
// ============================================================
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // ── Window controls ───────────────────────
    winMinimize: () => ipcRenderer.send('win-minimize'),
    winMaximize: () => ipcRenderer.send('win-maximize'),
    winClose:    () => ipcRenderer.send('win-close'),

    // ── System ────────────────────────────────
    checkJava:      (dir) => ipcRenderer.invoke('check-java', dir),
    installJava:    (opts) => ipcRenderer.invoke('install-java', opts),
    getJavaSettings: () => ipcRenderer.invoke('get-java-settings'),
    setJavaVersion: (setting) => ipcRenderer.invoke('set-java-version', setting),
    getSystemInfo:  () => ipcRenderer.invoke('get-system-info'),
    getLiveStats:   () => ipcRenderer.invoke('get-live-stats'),
    checkDiskSpace: (dir) => ipcRenderer.invoke('check-disk-space', dir),
    checkPort:      (port) => ipcRenderer.invoke('check-port', port),

    // ── Setup ─────────────────────────────────
    pickDirectory:       () => ipcRenderer.invoke('pick-directory'),
    checkExistingServer: (dir) => ipcRenderer.invoke('check-existing-server', dir),

    // ── PaperMC ────────────────────────────────
    fetchPaperVersions: () => ipcRenderer.invoke('fetch-paper-versions'),

    // ── Server CRUD ───────────────────────────
    createServer:  (opts) => ipcRenderer.invoke('create-server', opts),
    serverStart:   ()     => ipcRenderer.invoke('server-start'),
    serverStop:    ()     => ipcRenderer.invoke('server-stop'),
    serverRestart: ()     => ipcRenderer.invoke('server-restart'),
    serverKill:    ()     => ipcRenderer.invoke('server-kill'),
    serverCommand: (cmd)  => ipcRenderer.invoke('server-command', cmd),
    getNetworkInfo: ()    => ipcRenderer.invoke('get-network-info'),

    serverReinstall:     () => ipcRenderer.invoke('reinstall-server'),
    serverChangeVersion: (ver) => ipcRenderer.invoke('change-version', ver),
    serverDelete:        () => ipcRenderer.invoke('delete-server'),

    serverStatus:  ()     => ipcRenderer.invoke('server-status'),
    getServerDir:  ()     => ipcRenderer.invoke('get-server-dir'),

    // ── File Manager ──────────────────────────
    fmList:         (rel)        => ipcRenderer.invoke('fm-list', rel),
    fmRead:         (rel)        => ipcRenderer.invoke('fm-read', rel),
    fmWrite:        (rel, data)  => ipcRenderer.invoke('fm-write', rel, data),
    fmDelete:       (rel)        => ipcRenderer.invoke('fm-delete', rel),
    fmRename:       (rel, name)  => ipcRenderer.invoke('fm-rename', rel, name),
    fmUpload:       (rel, paths) => ipcRenderer.invoke('fm-upload', rel, paths),
    fmUploadDialog: (rel)        => ipcRenderer.invoke('fm-upload-dialog', rel),
    fmExtract:      (rel, name)  => ipcRenderer.invoke('fm-extract', rel, name),
    fmDeleteBatch:  (paths)      => ipcRenderer.invoke('fm-delete-batch', paths),
    getPathForFile: (file) => {
        try {
            if (webUtils && typeof webUtils.getPathForFile === 'function') {
                return webUtils.getPathForFile(file);
            }
        } catch (e) {}
        try {
            return file.path || '';
        } catch (e) {
            return '';
        }
    },

    // ── World Manager ─────────────────────────
    worldList:   () => ipcRenderer.invoke('world-list'),
    worldDelete: (n) => ipcRenderer.invoke('world-delete', n),
    worldImport: ()  => ipcRenderer.invoke('world-import'),

    // ── Player Manager ────────────────────────
    playersGet:    ()           => ipcRenderer.invoke('players-get'),
    playersGetCache:()          => ipcRenderer.invoke('players-get-cache'),
    playersAdd:    (list, name) => ipcRenderer.invoke('players-add', list, name),
    playersRemove: (list, name) => ipcRenderer.invoke('players-remove', list, name),

    // ── Properties ────────────────────────────
    propsGet:  ()       => ipcRenderer.invoke('props-get'),
    propsSave: (props)  => ipcRenderer.invoke('props-save', props),

    // ── Playit Plugin ─────────────────────────
    playitCheck:   () => ipcRenderer.invoke('playit-check'),
    playitInstall: () => ipcRenderer.invoke('playit-install'),
    playitRemove:  () => ipcRenderer.invoke('playit-remove'),

    // ── Plugin Manager ─────────────────────────
    pluginSearch:       (query, cat) => ipcRenderer.invoke('plugin-search', query, cat),
    pluginGetVersion:   (id)         => ipcRenderer.invoke('plugin-get-version', id),
    pluginInstall:      (opts)       => ipcRenderer.invoke('plugin-install', opts),
    pluginsGetInstalled:()           => ipcRenderer.invoke('plugins-get-installed'),
    pluginToggle:       (fileName)   => ipcRenderer.invoke('plugin-toggle', fileName),
    pluginDelete:       (fileName)   => ipcRenderer.invoke('plugin-delete', fileName),
    pluginUploadLocal:  ()           => ipcRenderer.invoke('plugin-upload-local'),
    onPluginDownloadProgress: (cb)   => ipcRenderer.on('plugin-download-progress', (_, d) => cb(d)),

    // ── Backup ────────────────────────────────
    createBackup: (mode) => ipcRenderer.invoke('create-backup', mode),

    // ── Updates ───────────────────────────────
    checkForUpdatesManual: () => ipcRenderer.invoke('check-for-updates-manual'),
    getUpdateChangelog:    () => ipcRenderer.invoke('get-update-changelog'),
    getAppVersion:         () => ipcRenderer.invoke('get-app-version'),
    applyGithubHotUpdate:  () => ipcRenderer.invoke('apply-github-hot-update'),
    relaunchApp:           () => ipcRenderer.invoke('relaunch-app'),
    onHotUpdateProgress:   (cb) => ipcRenderer.on('hot-update-progress', (_, d) => cb(d)),
    onHotUpdateAvailable:  (cb) => ipcRenderer.on('hot-update-available', (_, d) => cb(d)),

    // ── Events (main → renderer) ──────────────
    onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_, d) => cb(d)),
    onConsoleData: (callback) => ipcRenderer.on('console-data', (_, data) => callback(data)),
    onPlayitConsoleData: (callback) => ipcRenderer.on('playit-console-data', (_, data) => callback(data)),
    onServerState:      (cb) => ipcRenderer.on('server-state',      (_, d) => cb(d)),
    onBackupProgress:   (cb) => ipcRenderer.on('backup-progress',   (_, d) => cb(d)),
    onSetupProgress:    (cb) => ipcRenderer.on('setup-progress',    (_, d) => cb(d)),
    onJavaDownloadProgress: (cb) => ipcRenderer.on('java-download-progress', (_, d) => cb(d)),

    // ── Updater ───────────────────────────────
    onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, v) => cb(v)),
    onUpdateProgress:  (cb) => ipcRenderer.on('update-progress', (_, p) => cb(p)),
    onUpdateDownloaded:(cb) => ipcRenderer.on('update-downloaded', () => cb()),
    installUpdate:     () => ipcRenderer.invoke('install-update')
});
