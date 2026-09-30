// ============================================================
//  Nuvyra-Craft — Renderer (all UI logic)
// ============================================================

const initApp = async () => {

    // ── Helpers ─────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    function toast(msg, type = 'success') {
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        $('#toast-container').appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
    }

    function showScreen(id) {
        $$('.screen').forEach(s => { s.classList.add('hidden'); s.classList.remove('active'); });
        const target = document.getElementById(id);
        target.classList.remove('hidden');
        // Flush style before adding active for transition to play
        void target.offsetWidth;
        target.classList.add('active');
    }

    function openDrawer() {
        const drawer = $('#mobile-sidebar-drawer');
        const backdrop = $('#sidebar-backdrop');
        if (drawer) drawer.classList.add('open');
        if (backdrop) backdrop.classList.remove('hidden');
    }

    function closeDrawer() {
        const drawer = $('#mobile-sidebar-drawer');
        const backdrop = $('#sidebar-backdrop');
        if (drawer) drawer.classList.remove('open');
        if (backdrop) backdrop.classList.add('hidden');
    }

    function showPanel(id) {
        if (!id) return;
        $$('.panel').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
        $$('.nav-item').forEach(n => n.classList.remove('active'));
        const panel = document.getElementById(id);
        if (panel) {
            panel.classList.remove('hidden');
            panel.classList.add('active');
        }
        $$(`.nav-item[data-panel="${id}"]`).forEach(nav => nav.classList.add('active'));
        
        // Lazy-load panel data whenever panel is displayed
        if (id === 'panel-plugins') {
            loadPlugins();
            loadInstalledPlugins();
        }
        if (id === 'panel-files') loadFileManager('');
        if (id === 'panel-worlds') loadWorlds();
        if (id === 'panel-players') loadPlayers();
        if (id === 'panel-props') loadProperties();
        if (id === 'panel-backup') loadBackups();
        if (id === 'panel-settings') {
            loadChangelog();
            loadSettings();
        }
        closeDrawer();
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    // ── Opening Splash Screen Dismissal (Global Delegate) ───
    function dismissSplashScreen() {
        if (typeof window.dismissSplashScreen === 'function') {
            window.dismissSplashScreen();
        } else {
            const splash = document.getElementById('mobile-splash-screen');
            if (!splash || splash.dataset.dismissed) return;
            splash.dataset.dismissed = 'true';
            splash.classList.add('fade-out');
            setTimeout(() => {
                splash.style.display = 'none';
                try { splash.remove(); } catch (_) {}
            }, 600);
        }
    }

    // Safety fallback: guaranteed dismiss after 2s maximum
    setTimeout(dismissSplashScreen, 2000);

    // ── Title bar ───────────────────────────────────────────
    if ($('#tb-min'))   $('#tb-min').onclick   = () => window.api && window.api.winMinimize && window.api.winMinimize();
    if ($('#tb-max'))   $('#tb-max').onclick   = () => window.api && window.api.winMaximize && window.api.winMaximize();
    if ($('#tb-close')) $('#tb-close').onclick = () => window.api && window.api.winClose && window.api.winClose();

    // ── System info for sliders (Defensive with fallback) ────
    let sldRam = null;
    let sldCpu = null;
    let ramMax = 4096;
    let cpuMax = 4;
    try {
        const sysInfo = (window.api && window.api.getSystemInfo) ? await window.api.getSystemInfo() : { totalRamMB: 4096, cores: 4 };
        const totalRam = (sysInfo && sysInfo.totalRamMB) ? sysInfo.totalRamMB : 4096;
        ramMax = Math.max(2048, totalRam - 2048); // leave 2GB for OS
        cpuMax = (sysInfo && sysInfo.cores) ? sysInfo.cores : 4;

        sldRam = $('#sld-ram');
        sldCpu = $('#sld-cpu');
        if (sldRam) {
            sldRam.max = ramMax;
            sldRam.value = Math.min(2048, ramMax);
            sldRam.oninput = () => { if ($('#lbl-ram')) $('#lbl-ram').textContent = sldRam.value; };
        }
        if (sldCpu) {
            sldCpu.max = cpuMax;
            sldCpu.value = Math.max(1, Math.floor(cpuMax / 2));
            sldCpu.oninput = () => { if ($('#lbl-cpu')) $('#lbl-cpu').textContent = sldCpu.value; };
        }

        if ($('#lbl-ram')) $('#lbl-ram').textContent = (sldRam ? sldRam.value : 2048);
        if ($('#lbl-cpu')) $('#lbl-cpu').textContent = (sldCpu ? sldCpu.value : 2);
        if ($('#lbl-ram-max')) $('#lbl-ram-max').textContent = (ramMax / 1024).toFixed(0) + ' GB';
        if ($('#lbl-cpu-max')) $('#lbl-cpu-max').textContent = cpuMax;
    } catch (e) {
        console.warn('System info initialization note:', e);
    }

    // ── Saved directory & version state ─────────────────────
    let savedDir = localStorage.getItem('jtg-install-dir') || '';
    let paperVersions = [];

    // ── Storage Permission Check & Banner ───────────────────
    async function checkAndDisplayStorageBanner(dir) {
        const banner = $('#storage-perm-banner');
        if (!banner) return;
        try {
            if (window.api && window.api.checkStoragePermission) {
                const perm = await window.api.checkStoragePermission();
                if (perm && perm.granted) {
                    banner.classList.add('hidden');
                    return;
                }
            }
        } catch (_) {}

        // Permission is not granted yet -> check if target path is isolated app storage
        const targetDir = dir || ($('#inp-dir') ? $('#inp-dir').value.trim() : '') || savedDir || '/storage/emulated/0/NuvyraCraft/server';
        const isIsolated = targetDir.includes('/data/data/') || targetDir.includes('/files/servers/');
        if (isIsolated) {
            banner.classList.add('hidden');
            return;
        }

        // Show banner prominently for Phone Storage & External Storage
        banner.classList.remove('hidden');
    }

    // Proactively verify and display banner immediately on startup
    checkAndDisplayStorageBanner();

    const btnGrantStorage = $('#btn-grant-storage');
    if (btnGrantStorage) {
        btnGrantStorage.onclick = async () => {
            btnGrantStorage.disabled = true;
            btnGrantStorage.textContent = 'Opening Settings...';
            try {
                await window.api.requestStoragePermission();
            } catch (e) {
                toast('Please grant All Files Access: ' + (e.message || e), 'warn');
            }
            setTimeout(() => {
                btnGrantStorage.disabled = false;
                btnGrantStorage.textContent = 'Grant Permission';
                checkAndDisplayStorageBanner();
            }, 1200);
        };
    }

    window.addEventListener('focus', () => checkAndDisplayStorageBanner());
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkAndDisplayStorageBanner();
    });

    // ── Setup progress listener ─────────────────────────────
    window.api.onSetupProgress(data => {
        const statusEl = $('#create-status') || $('#step-java-status');
        const barEl = $('#create-bar') || $('#setup-java-bar');
        if (statusEl && data.status) statusEl.textContent = data.status;
        if (barEl && data.percent !== undefined) barEl.style.width = data.percent + '%';
        if (data.step === 'java' || data.step === 'java21') {
            const sj = $('#step-java-status');
            const sb = $('#setup-java-bar');
            if (sj) sj.textContent = data.status;
            if (sb) sb.style.width = data.percent + '%';
        }
    });

    // ══════════════════════════════════════════════════════════
    //  BOOT SEQUENCE (Direct to Server Menu or Dashboard)
    // ══════════════════════════════════════════════════════════
    async function initAppOnStartup() {
        try {
            // 1. Resolve preferred default storage paths (/storage/emulated/0/NuvyraCraft/server)
            let storagePaths = null;
            if (window.api && window.api.getDefaultStoragePaths) {
                storagePaths = await window.api.getDefaultStoragePaths().catch(() => null);
            }

            if (!savedDir) {
                savedDir = (storagePaths && storagePaths.phoneStorage) ? storagePaths.phoneStorage : '/storage/emulated/0/NuvyraCraft/server';
                localStorage.setItem('jtg-install-dir', savedDir);
            }

            if ($('#inp-dir')) {
                $('#inp-dir').value = savedDir;
            }

            // 2. Check if a server already exists
            const check = await window.api.checkExistingServer(savedDir).catch(() => ({ exists: false }));
            if (check && check.exists) {
                // Existing server detected -> Jump directly to dashboard
                const sName = check.name || 'Nuvyra Server';
                $('#sidebar-server-name').textContent = sName;
                const drName = $('#drawer-server-name');
                if (drName) drName.textContent = sName;
                initDashboard();
                showScreen('screen-dashboard');
                setTimeout(dismissSplashScreen, 1800);
                return;
            }

            // 3. No server yet -> Show Server Creation menu directly (as requested)
            showScreen('screen-create');
            checkAndDisplayStorageBanner(savedDir);
            setTimeout(dismissSplashScreen, 1800);

            // 4. Background fetch latest Paper versions to enhance version dropdown
            if (window.api && window.api.fetchPaperVersions) {
                window.api.fetchPaperVersions().then(versions => {
                    if (versions && versions.length > 0) {
                        paperVersions = versions;
                        const sel = $('#sel-version');
                        if (sel) {
                            const curVal = sel.value;
                            sel.innerHTML = '';
                            versions.forEach(v => {
                                const opt = document.createElement('option');
                                opt.value = v;
                                const isJ21 = (v.startsWith('1.21') || v.startsWith('1.22'));
                                opt.textContent = `Paper ${v} ${isJ21 ? '(Requires Java 21)' : '(Requires Java 17)'}`;
                                sel.appendChild(opt);
                            });
                            if (curVal && versions.includes(curVal)) {
                                sel.value = curVal;
                            }
                        }
                    }
                }).catch(() => {});
            }

        } catch (err) {
            console.error('Startup initialization error:', err);
            showScreen('screen-create');
            setTimeout(dismissSplashScreen, 1800);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  WELCOME & CREATE SCREEN HELPERS
    // ══════════════════════════════════════════════════════════
    function resetCreateScreen() {
        const btn = $('#btn-create');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Create &amp; Launch Server`;
        }
        const progressBox = $('#create-progress');
        if (progressBox) progressBox.classList.add('hidden');
        const barEl = $('#create-bar');
        if (barEl) barEl.style.width = '0%';
        const statusEl = $('#create-status');
        if (statusEl) statusEl.textContent = '';
        if ($('#inp-name') && (!($('#inp-name').value) || !($('#inp-name').value.trim()))) {
            $('#inp-name').value = 'Nuvyra Server';
        }
    }

    $('#btn-get-started').onclick = async () => {
        resetCreateScreen();
        showScreen('screen-create');
        checkAndDisplayStorageBanner(savedDir);
    };

    // ══════════════════════════════════════════════════════════
    //  CREATE SCREEN
    // ══════════════════════════════════════════════════════════
    $('#btn-pick-dir').onclick = async () => {
        const currentVal = $('#inp-dir').value.trim() || savedDir || '/storage/emulated/0/NuvyraCraft/server';
        const customPrompt = prompt('Enter or edit server install folder path:', currentVal);
        if (customPrompt && customPrompt.trim()) {
            const dir = await window.api.pickDirectory(customPrompt.trim());
            if (dir) {
                savedDir = dir;
                localStorage.setItem('jtg-install-dir', savedDir);
                $('#inp-dir').value = dir;
                checkAndDisplayStorageBanner(savedDir);
            }
        }
    };

    const inpDirEl = $('#inp-dir');
    if (inpDirEl) {
        inpDirEl.oninput = () => {
            const val = inpDirEl.value.trim();
            if (val) {
                savedDir = val;
                localStorage.setItem('jtg-install-dir', val);
                checkAndDisplayStorageBanner(val);
            }
        };
    }

    $$('.dir-preset-chip').forEach(chip => {
        chip.onclick = async () => {
            $$('.dir-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const chosen = chip.dataset.dir;
            savedDir = chosen;
            localStorage.setItem('jtg-install-dir', chosen);
            $('#inp-dir').value = chosen;
            checkAndDisplayStorageBanner(chosen);
            if (window.api && window.api.pickDirectory) {
                await window.api.pickDirectory(chosen);
            }
        };
    });

    // Download progress listener
    window.api.onDownloadProgress(data => {
        const pct = (typeof data === 'object' && data !== null) ? (data.percent || data.pct || 0) : data;
        const createBar = $('#create-bar');
        const createStatus = $('#create-status');
        if (createBar) createBar.style.width = pct + '%';
        if (createStatus) createStatus.textContent = (typeof data === 'object' && data.status) ? data.status : `Downloading... ${pct}%`;
    });

    // On-demand installation and server creation
    $('#btn-create').onclick = async () => {
        const name = $('#inp-name').value.trim();

        // Validate name
        if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
            toast('Invalid server name. Use only letters, numbers, underscores.', 'error');
            return;
        }

        const chosenDir = $('#inp-dir').value.trim() || savedDir || '/storage/emulated/0/NuvyraCraft/server';
        savedDir = chosenDir;
        localStorage.setItem('jtg-install-dir', savedDir);

        const version = $('#sel-version').value;
        if (!version) { toast('Select a Paper version.', 'error'); return; }

        // Check storage permission if installing to external public storage
        if (chosenDir.startsWith('/storage/emulated/0') || chosenDir.includes('/storage/')) {
            try {
                const perm = await window.api.checkStoragePermission();
                if (perm && !perm.granted) {
                    toast('Storage permission needed to create server in Phone Storage.', 'warn');
                    $('#storage-perm-banner').classList.remove('hidden');
                    await window.api.requestStoragePermission();
                    return;
                }
            } catch (_) {}
        }

        const btn = $('#btn-create');
        btn.disabled = true;

        const progressBox = $('#create-progress');
        const statusEl = $('#create-status');
        const barEl = $('#create-bar');

        if (progressBox) progressBox.classList.remove('hidden');
        if (barEl) barEl.style.width = '0%';

        try {
            // Determine Java requirement: MC 1.21+ needs Java 21, MC <= 1.20 needs Java 17
            const parts = version.split('.').map(p => parseInt(p, 10) || 0);
            const major = parts[0] || 1;
            const minor = parts[1] || 0;
            const needsJava21 = (major === 1 && minor >= 21) || major > 1;

            if (needsJava21) {
                if (statusEl) statusEl.textContent = `Checking Java 21 (required for Paper ${version})...`;
                const j21 = await window.api.checkJava21().catch(() => ({ found: false }));
                if (!j21.found) {
                    if (statusEl) statusEl.textContent = 'Downloading Java 21 ARM64 runtime...';
                    if (barEl) barEl.style.width = '10%';
                    toast(`Installing Java 21 ARM64 for Minecraft ${version}...`, 'info');
                    await window.api.installJava21();
                }
            } else {
                if (statusEl) statusEl.textContent = `Checking Java 17 (required for Paper ${version})...`;
                const j17 = await window.api.checkJava(savedDir).catch(() => ({ found: false }));
                if (!j17.found) {
                    if (statusEl) statusEl.textContent = 'Downloading Java 17 ARM64 runtime...';
                    if (barEl) barEl.style.width = '10%';
                    toast(`Installing Java 17 ARM64 for Minecraft ${version}...`, 'info');
                    await window.api.installJava({ version: '17' });
                }
            }

            // Download Paper jar directly & initialize server
            if (statusEl) statusEl.textContent = `Downloading Paper ${version}...`;
            if (barEl) barEl.style.width = '30%';

            const ramInput = $('#sld-ram');
            const cpuInput = $('#sld-cpu');
            const ramVal = (ramInput && ramInput.value) ? parseInt(ramInput.value, 10) : (sldRam && sldRam.value ? parseInt(sldRam.value, 10) : 2048);
            const cpuVal = (cpuInput && cpuInput.value) ? parseInt(cpuInput.value, 10) : (sldCpu && sldCpu.value ? parseInt(sldCpu.value, 10) : 2);

            await window.api.createServer({
                dir: savedDir,
                name: name,
                ram: ramVal,
                cpu: cpuVal,
                version: version
            });

            toast('Server created successfully in Phone Storage!');
            $('#sidebar-server-name').textContent = name;
            const drName = $('#drawer-server-name');
            if (drName) drName.textContent = name;
            resetCreateScreen();
            initDashboard();
            showScreen('screen-dashboard');

            // Auto-start server
            setTimeout(() => startServer(), 600);

        } catch (e) {
            toast(e.message || 'Server creation failed', 'error');
            if (statusEl) statusEl.textContent = 'Creation failed: ' + (e.message || 'Unknown error');
            if (btn) btn.disabled = false;
        }
    };

    // ══════════════════════════════════════════════════════════
    //  DASHBOARD
    // ══════════════════════════════════════════════════════════
    let statsInterval = null;

    function initDashboard() {
        // Drawer toggle and close controls
        const btnToggle = $('#btn-sidebar-toggle');
        if (btnToggle) btnToggle.onclick = () => openDrawer();

        const btnClose = $('#btn-drawer-close');
        if (btnClose) btnClose.onclick = () => closeDrawer();

        const backdrop = $('#sidebar-backdrop');
        if (backdrop) backdrop.onclick = () => closeDrawer();

        // Sidebar & Bottom nav
        $$('.nav-item').forEach(item => {
            item.onclick = () => {
                if (item.id === 'btn-bottom-menu' || item.classList.contains('nav-item-drawer')) {
                    openDrawer();
                    return;
                }
                const panel = item.dataset.panel;
                if (!panel) return;
                showPanel(panel);
            };
        });
        
        // Show default panel on init
        showPanel('panel-console');
        loadInstalledPlugins();

        // Start stats polling (every 3s)
        if (statsInterval) clearInterval(statsInterval);
        statsInterval = setInterval(async () => {
            try {
                const s = await window.api.getLiveStats();
                $('#live-cpu').textContent = s.cpuPercent + '%';
                $('#live-ram').textContent = `${s.ramUsedMB} / ${s.ramTotalMB} MB`;
                const ramPct = s.ramTotalMB > 0 ? Math.min(100, Math.round((s.ramUsedMB * 100) / s.ramTotalMB)) : 0;
                $('#cpu-bar').style.width = ramPct + '%';

                const drawerCpu = $('#drawer-live-cpu');
                if (drawerCpu) drawerCpu.textContent = s.cpuPercent + '%';
                const drawerRam = $('#drawer-live-ram');
                if (drawerRam) drawerRam.textContent = `${s.ramUsedMB} / ${s.ramTotalMB} MB`;
            } catch (_) {}
        }, 3000);
    }

    // ── Console ─────────────────────────────────────────────
    const consoleEl = $('#console-log');

    function appendConsole(text) {
        const str = (typeof text === 'object' && text !== null) ? (text.text || JSON.stringify(text)) : String(text);
        consoleEl.textContent += str;
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    window.api.onConsoleData(data => appendConsole(data));

    // Playit Console listener (kept for future beta re-enable, but no UI target now)
    // window.api.onPlayitConsoleData is still registered in preload but the panel is static

    window.api.onServerState(state => {
        // state comes as { running: true/false } from Java backend
        const running = (typeof state === 'object' && state !== null) ? !!state.running : (state === 'running' || state === true);
        $('#btn-start').disabled = running;
        $('#btn-stop').disabled = !running;
        $('#btn-restart').disabled = !running;
        $('#inp-cmd').disabled = !running;
        $('#btn-cmd').disabled = !running;

        const dot = $('#drawer-status-dot');
        const txt = $('#drawer-status-text');
        if (dot) dot.classList.toggle('online', running);
        if (txt) txt.textContent = running ? 'Server Running' : 'Server Stopped';

        const netCard = $('#server-network-card');
        if (running && window.api && window.api.getNetworkInfo) {
            window.api.getNetworkInfo().then(net => {
                if (net) {
                    const valLocal = $('#val-local-ip');
                    const valLan = $('#val-lan-ip');
                    if (valLocal) valLocal.textContent = net.sameDeviceJoin || '127.0.0.1:25565';
                    if (valLan) valLan.textContent = net.lanJoin || net.hotspotJoin || '127.0.0.1:25565';
                    if (netCard) netCard.classList.remove('hidden');
                }
            }).catch(() => {});
        } else {
            if (netCard) netCard.classList.add('hidden');
        }
    });

    // Copy Join IP handlers
    const btnCopyJoin = $('#btn-copy-join-ip');
    if (btnCopyJoin) {
        btnCopyJoin.onclick = () => {
            const local = $('#val-local-ip') ? $('#val-local-ip').textContent : '127.0.0.1:25565';
            const lan = $('#val-lan-ip') ? $('#val-lan-ip').textContent : '';
            const copyText = (lan && lan !== local) ? `${local} (Same Phone) | ${lan} (Wi-Fi/Hotspot)` : local;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(copyText).then(() => toast(`Copied join address: ${copyText}`, 'success')).catch(() => {});
            } else {
                toast(`Address: ${copyText}`, 'info');
            }
        };
    }
    const pillLocal = $('#pill-local-ip');
    if (pillLocal) {
        pillLocal.onclick = () => {
            const val = $('#val-local-ip') ? $('#val-local-ip').textContent : '127.0.0.1:25565';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(val).then(() => toast(`Copied: ${val}`, 'success')).catch(() => {});
            }
        };
    }
    const pillLan = $('#pill-lan-ip');
    if (pillLan) {
        pillLan.onclick = () => {
            const val = $('#val-lan-ip') ? $('#val-lan-ip').textContent : '127.0.0.1:25565';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(val).then(() => toast(`Copied: ${val}`, 'success')).catch(() => {});
            }
        };
    }

    async function startServer() {
        try {
            consoleEl.textContent = '';
            appendConsole('[Nuvyra-Craft] Starting server...\n');
            await window.api.serverStart();
        } catch (e) {
            toast(e.message || 'Failed to start', 'error');
            appendConsole(`[ERROR] ${e.message}\n`);
        }
    }

    $('#btn-start').onclick = startServer;

    $('#btn-stop').onclick = async () => {
        try {
            appendConsole('[Nuvyra-Craft] Stopping server...\n');
            await window.api.serverStop();
        } catch (e) { toast(e.message, 'error'); }
    };

    let isRestarting = false;
    $('#btn-restart').onclick = async () => {
        if (isRestarting) return;
        isRestarting = true;
        const btnRestart = $('#btn-restart');
        const btnStart = $('#btn-start');
        const btnStop = $('#btn-stop');

        btnRestart.disabled = true;
        btnStart.disabled = true;
        btnStop.disabled = true;

        try {
            appendConsole('[Nuvyra-Craft] 🔄 Restarting server safely...\n');
            toast('Restarting server...', 'info');

            if (window.api && window.api.serverRestart) {
                await window.api.serverRestart();
            } else {
                await window.api.serverStop();
                let waited = 0;
                while (waited < 15) {
                    await new Promise(r => setTimeout(r, 1000));
                    waited++;
                    const st = await window.api.serverStatus().catch(() => ({ running: false }));
                    const isRun = (typeof st === 'object' && st !== null) ? !!st.running : !!st;
                    if (!isRun) break;
                }
                await new Promise(r => setTimeout(r, 1500));
                await startServer();
            }
            toast('Server restarted successfully!', 'success');
        } catch (e) {
            toast(e.message || 'Restart failed', 'error');
            appendConsole(`[ERROR] Restart failed: ${e.message}\n`);
        } finally {
            isRestarting = false;
        }
    };

    // Send command
    function sendCmd() {
        const inp = $('#inp-cmd');
        const cmd = inp.value.trim();
        if (!cmd) return;
        try {
            window.api.serverCommand(cmd);
            appendConsole(`> ${cmd}\n`);
            inp.value = '';
        } catch (e) { toast(e.message, 'error'); }
    }
    $('#btn-cmd').onclick = sendCmd;
    $('#inp-cmd').onkeydown = (e) => { if (e.key === 'Enter') sendCmd(); };

    // ══════════════════════════════════════════════════════════
    //  FILE MANAGER
    // ══════════════════════════════════════════════════════════
    let fmCurrentRel = '';

    function updateSelectedState() {
        const allCbs = Array.from(document.querySelectorAll('.fm-item-cb'));
        const checkedCbs = Array.from(document.querySelectorAll('.fm-item-cb:checked'));
        const btnDelete = $('#fm-delete-selected-btn');
        const lblCount = $('#fm-selected-count');
        const selectAllCb = $('#fm-select-all');

        if (checkedCbs.length > 0) {
            if (btnDelete) btnDelete.classList.remove('hidden');
            if (lblCount) lblCount.textContent = checkedCbs.length;
        } else {
            if (btnDelete) btnDelete.classList.add('hidden');
            if (lblCount) lblCount.textContent = '0';
        }

        if (selectAllCb) {
            if (allCbs.length > 0 && checkedCbs.length === allCbs.length) {
                selectAllCb.checked = true;
                selectAllCb.indeterminate = false;
            } else if (checkedCbs.length > 0) {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = true;
            } else {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = false;
            }
        }
    }

    async function loadFileManager(relDir) {
        fmCurrentRel = relDir;
        updateBreadcrumb(relDir);
        const listEl = $('#fm-list');
        listEl.innerHTML = '';
        $('#fm-editor-wrap').classList.add('hidden');

        // Reset multi-select state
        const selectAllCb = $('#fm-select-all');
        if (selectAllCb) {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = false;
        }
        const btnDelete = $('#fm-delete-selected-btn');
        if (btnDelete) btnDelete.classList.add('hidden');

        try {
            const items = await window.api.fmList(relDir || null);

            // Parent directory row
            if (relDir) {
                const parentRel = relDir.includes('/') ? relDir.substring(0, relDir.lastIndexOf('/')) : '';
                const row = document.createElement('div');
                row.className = 'fm-row';
                row.innerHTML = `<span class="fm-cb-wrap"></span><span class="icon">↩</span><span class="name">..</span>`;
                row.onclick = () => loadFileManager(parentRel);
                listEl.appendChild(row);
            }

            if (!items || items.length === 0) {
                const emptyRow = document.createElement('div');
                emptyRow.className = 'fm-row';
                emptyRow.style.color = 'var(--text-3)';
                emptyRow.style.justifyContent = 'center';
                emptyRow.style.padding = '24px';
                emptyRow.innerHTML = '<span>This folder is empty. Upload files or drop archives here.</span>';
                listEl.appendChild(emptyRow);
                return;
            }

            items.forEach(item => {
                const isJar = !item.isDir && item.name.toLowerCase().endsWith('.jar');
                const isArchive = !item.isDir && /\.(zip|rar|tar\.gz|tgz|tar|7z)$/i.test(item.name);
                const isSystemMeta = (item.name === '.mcmeta.json');

                const row = document.createElement('div');
                row.className = 'fm-row' + (isJar ? ' fm-jar' : '') + (isArchive ? ' fm-archive' : '') + (isSystemMeta ? ' fm-system' : '');
                const icon = item.isDir ? '📁' : (isJar ? '☕' : (isArchive ? '📦' : (isSystemMeta ? '⚙️' : '📄')));
                
                let badge = '';
                if (isSystemMeta) {
                    badge = ' <span class="fm-system-badge" title="Protected Server Metadata — Required for server startup">SYSTEM</span>';
                } else if (isJar) {
                    badge = ' <span class="fm-jar-badge" title="Binary JAR archive (cannot open in editor)">JAR</span>';
                } else if (isArchive) {
                    const extMatch = item.name.match(/\.([a-z0-9]+)$/i);
                    const extLabel = extMatch ? extMatch[1].toUpperCase() : 'ARCHIVE';
                    badge = ` <span class="fm-archive-badge" title="Compressed Archive / Backup (${extLabel})">${extLabel}</span>`;
                }

                const extractBtn = isArchive ? `<button class="fm-action ext" title="Extract / Unzip archive into current directory">📦 Extract</button>` : '';

                // Checkbox: protected files cannot be selected for batch deletion
                const cbHtml = isSystemMeta
                    ? `<span class="fm-cb-wrap"><span class="fm-cb-lock" title="System protected file — cannot be deleted">🔒</span></span>`
                    : `<span class="fm-cb-wrap"><input type="checkbox" class="fm-item-cb" data-rel="${item.rel}" data-name="${item.name}"></span>`;

                // Actions: protected files have no delete or rename buttons
                const actionsHtml = isSystemMeta
                    ? `<span class="fm-protected-pill" title="Protected file — deletion & renaming disabled">🔒 Protected</span>`
                    : `
                        ${extractBtn}
                        <button class="fm-action ren" title="Rename">✏</button>
                        <button class="fm-action del" title="Delete">🗑</button>
                    `;

                row.innerHTML = `
                    ${cbHtml}
                    <span class="icon">${icon}</span>
                    <span class="name" title="${item.name}">${item.name}${badge}</span>
                    <span class="size">${item.isDir ? '' : formatSize(item.size)}</span>
                    <span class="actions">
                        ${actionsHtml}
                    </span>
                `;

                // Handle Checkbox selection
                const cbEl = row.querySelector('.fm-item-cb');
                if (cbEl) {
                    cbEl.onchange = (e) => {
                        e.stopPropagation();
                        row.classList.toggle('selected', cbEl.checked);
                        updateSelectedState();
                    };
                    cbEl.onclick = (e) => e.stopPropagation();
                }

                // Extract button click
                if (isArchive) {
                    const extBtnEl = row.querySelector('.ext');
                    if (extBtnEl) {
                        extBtnEl.onclick = async (e) => {
                            e.stopPropagation();
                            if (confirm(`Extract "${item.name}" into current directory?\n(Any files with matching names will be replaced)`)) {
                                try {
                                    toast(`Extracting "${item.name}"... please wait`, 'info');
                                    await window.api.fmExtract(fmCurrentRel, item.name);
                                    toast(`Extracted "${item.name}" successfully!`, 'success');
                                    loadFileManager(fmCurrentRel);
                                } catch (err) {
                                    toast('Extraction failed: ' + err.message, 'error');
                                }
                            }
                        };
                    }
                }

                // Click to navigate or open
                if (isJar) {
                    const notifyJar = (e) => {
                        e.stopPropagation();
                        toast('JAR files cannot be opened in the text editor.', 'warning');
                    };
                    row.querySelector('.name').onclick = notifyJar;
                    row.querySelector('.icon').onclick = notifyJar;
                } else if (isArchive) {
                    const notifyArchive = (e) => {
                        e.stopPropagation();
                        if (confirm(`"${item.name}" is an archive file.\nDo you want to extract it into the current directory?`)) {
                            row.querySelector('.ext')?.click();
                        }
                    };
                    row.querySelector('.name').onclick = notifyArchive;
                    row.querySelector('.icon').onclick = notifyArchive;
                } else {
                    row.querySelector('.name').onclick = () => {
                        if (item.isDir) {
                            loadFileManager(item.rel);
                        } else {
                            openFileEditor(item.rel, item.name, item.size);
                        }
                    };
                    row.querySelector('.icon').onclick = row.querySelector('.name').onclick;
                }

                // Rename (only if not system meta)
                const btnRen = row.querySelector('.ren');
                if (btnRen) {
                    btnRen.onclick = async (e) => {
                        e.stopPropagation();
                        const newName = prompt('Rename to:', item.name);
                        if (newName && newName !== item.name) {
                            try {
                                await window.api.fmRename(item.rel, newName);
                                loadFileManager(fmCurrentRel);
                            } catch (err) { toast(err.message, 'error'); }
                        }
                    };
                }

                // Delete (only if not system meta)
                const btnDel = row.querySelector('.del');
                if (btnDel) {
                    btnDel.onclick = async (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${item.name}"?`)) {
                            try {
                                await window.api.fmDelete(item.rel);
                                loadFileManager(fmCurrentRel);
                                toast(`Deleted ${item.name}`);
                            } catch (err) { toast(err.message, 'error'); }
                        }
                    };
                }

                listEl.appendChild(row);
            });
        } catch (e) {
            toast('Failed to list files: ' + e.message, 'error');
        }
    }

    function updateBreadcrumb(relDir) {
        const bc = $('#fm-breadcrumb');
        bc.innerHTML = '';
        const parts = ['root'];
        if (relDir) parts.push(...relDir.split('/'));

        let accumulated = '';
        parts.forEach((part, i) => {
            const crumb = document.createElement('span');
            crumb.className = 'crumb';
            crumb.textContent = part;
            if (i === 0) {
                crumb.dataset.rel = '';
            } else {
                accumulated += (i === 1 ? '' : '/') + part;
                crumb.dataset.rel = accumulated;
            }
            crumb.onclick = () => loadFileManager(crumb.dataset.rel);
            bc.appendChild(crumb);
        });
    }

    async function openFileEditor(relPath, name, size) {
        if (name && name.toLowerCase().endsWith('.jar')) {
            toast('JAR files cannot be opened in the text editor.', 'warning');
            return;
        }
        if (name && /\.(zip|rar|tar\.gz|tgz|tar|7z)$/i.test(name)) {
            toast('Archive files cannot be opened in the text editor. Use the Extract button to unpack.', 'warning');
            return;
        }
        if (size && size > 3 * 1024 * 1024) {
            toast('Files larger than 3MB cannot be opened in the text editor.', 'warning');
            return;
        }
        try {
            const content = await window.api.fmRead(relPath);
            $('#fm-editor-name').textContent = name;
            $('#fm-editor').value = content;
            $('#fm-editor-wrap').classList.remove('hidden');
            $('#fm-editor-wrap').dataset.rel = relPath;
        } catch (e) {
            toast('Cannot open file: ' + e.message, 'error');
        }
    }

    $('#fm-save').onclick = async () => {
        const rel = $('#fm-editor-wrap').dataset.rel;
        try {
            await window.api.fmWrite(rel, $('#fm-editor').value);
            toast('File saved');
        } catch (e) { toast(e.message, 'error'); }
    };

    $('#fm-close').onclick = () => {
        $('#fm-editor-wrap').classList.add('hidden');
    };

    // Select All Checkbox
    const selectAllCb = $('#fm-select-all');
    if (selectAllCb) {
        selectAllCb.onchange = () => {
            const checked = selectAllCb.checked;
            document.querySelectorAll('.fm-item-cb').forEach(cb => {
                cb.checked = checked;
                cb.closest('.fm-row')?.classList.toggle('selected', checked);
            });
            updateSelectedState();
        };
    }

    // Delete Selected (Batch)
    const btnDeleteSelected = $('#fm-delete-selected-btn');
    if (btnDeleteSelected) {
        btnDeleteSelected.onclick = async () => {
            const checkedCbs = Array.from(document.querySelectorAll('.fm-item-cb:checked'));
            if (!checkedCbs.length) return;
            const count = checkedCbs.length;
            if (confirm(`Delete ${count} selected item(s)?\n(Protected system files like .mcmeta.json will be preserved)`)) {
                const paths = checkedCbs.map(cb => cb.dataset.rel).filter(r => !r.endsWith('.mcmeta.json'));
                try {
                    toast(`Deleting ${count} item(s)...`, 'info');
                    const res = await window.api.fmDeleteBatch(paths);
                    toast(`Deleted ${res.count || count} item(s) successfully`, 'success');
                    loadFileManager(fmCurrentRel);
                } catch (err) {
                    toast('Delete failed: ' + err.message, 'error');
                }
            }
        };
    }

    // Refresh Button
    const btnRefresh = $('#fm-refresh-btn');
    if (btnRefresh) {
        btnRefresh.onclick = () => {
            loadFileManager(fmCurrentRel);
            toast('File list refreshed', 'info');
        };
    }

    // Upload via Button
    const fileInput = $('#fm-file-input');
    $('#fm-upload-btn').onclick = async () => {
        if (fileInput) {
            fileInput.click();
        } else {
            try {
                const res = await window.api.fmUploadDialog(fmCurrentRel);
                if (res && res.success) {
                    toast(`Uploaded ${res.count} file(s) successfully`, 'success');
                    loadFileManager(fmCurrentRel);
                }
            } catch (e) {
                toast('Upload failed: ' + e.message, 'error');
            }
        }
    };

    if (fileInput) {
        fileInput.onchange = async () => {
            if (!fileInput.files || !fileInput.files.length) return;
            const files = Array.from(fileInput.files);
            toast(`Uploading ${files.length} file(s)...`, 'info');
            let successCount = 0;
            for (const f of files) {
                try {
                    const base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            const result = reader.result;
                            const b64 = (typeof result === 'string' && result.includes(',')) ? result.split(',')[1] : result;
                            resolve(b64);
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(f);
                    });
                    await window.api.fmUploadFile(fmCurrentRel, f.name, base64);
                    successCount++;
                } catch (err) {
                    console.error('Failed to upload file ' + f.name, err);
                }
            }
            if (successCount > 0) {
                toast(`Uploaded ${successCount} file(s) successfully`, 'success');
                loadFileManager(fmCurrentRel);
            } else {
                toast('Upload failed', 'error');
            }
            fileInput.value = ''; // reset
        };
    }

    // Drag & Drop
    const fmList = $('#fm-list');
    fmList.addEventListener('dragover', (e) => {
        e.preventDefault();
        fmList.classList.add('drag-over');
    });
    fmList.addEventListener('dragleave', () => {
        fmList.classList.remove('drag-over');
    });
    fmList.addEventListener('drop', async (e) => {
        e.preventDefault();
        fmList.classList.remove('drag-over');
        if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;

        const paths = [];
        for (const f of e.dataTransfer.files) {
            let p = '';
            try {
                if (window.api && typeof window.api.getPathForFile === 'function') {
                    p = window.api.getPathForFile(f);
                }
            } catch (err) {}
            if (!p && f.path) p = f.path;
            if (p) paths.push(p);
        }

        if (!paths.length) {
            toast('Could not determine file path. Please use "Upload File(s)" button.', 'warning');
            return;
        }

        try {
            toast('Uploading file(s)...', 'info');
            const res = await window.api.fmUpload(fmCurrentRel, paths);
            toast(`Uploaded ${res && res.count ? res.count : paths.length} file(s) successfully`, 'success');
            loadFileManager(fmCurrentRel);
        } catch (err) {
            toast('Upload failed: ' + err.message, 'error');
        }
    });

    // ══════════════════════════════════════════════════════════
    //  WORLD MANAGER
    // ══════════════════════════════════════════════════════════
    async function loadWorlds() {
        const container = $('#world-list');
        container.innerHTML = '<p style="color:var(--text-3)">Loading worlds...</p>';
        try {
            const worlds = await window.api.worldList();
            container.innerHTML = '';
            if (worlds.length === 0) {
                container.innerHTML = '<p style="color:var(--text-3)">No worlds found. Start the server to generate one.</p>';
                return;
            }
            worlds.forEach(w => {
                const card = document.createElement('div');
                card.className = 'world-card';
                card.innerHTML = `
                    <h4>${w.name}</h4>
                    <div class="meta">Size: ${w.sizeMB ? w.sizeMB + ' MB' : (w.size ? formatSize(w.size) : '0 MB')}</div>
                    <button class="btn danger sm" data-world="${w.name}">Delete World</button>
                `;
                card.querySelector('button').onclick = async () => {
                    if (confirm(`Delete world "${w.name}"? This cannot be undone!`)) {
                        try {
                            await window.api.worldDelete(w.name);
                            toast(`World "${w.name}" deleted`);
                            loadWorlds();
                        } catch (e) { toast(e.message, 'error'); }
                    }
                };
                container.appendChild(card);
            });
        } catch (e) {
            container.innerHTML = '';
            toast('Failed to load worlds', 'error');
        }
    }

    $('#btn-world-import').onclick = async () => {
        try {
            const name = await window.api.worldImport();
            if (name) {
                toast(`World "${name}" imported!`);
                loadWorlds();
            }
        } catch (e) { toast(e.message, 'error'); }
    };

    // ══════════════════════════════════════════════════════════
    //  PLAYER MANAGER (Redesigned)
    // ══════════════════════════════════════════════════════════
    async function loadPlayers() {
        const pmList = $('#pm-list');
        pmList.innerHTML = '';
        try {
            const res = await window.api.playersGetCache();
            const players = Array.isArray(res) ? res : (res && Array.isArray(res.players) ? res.players : []);
            if (!players || players.length === 0) {
                pmList.innerHTML = `
                    <div class="pm-empty">
                        <span style="font-size:24px; margin-bottom:8px">👥</span>
                        <span>No players found in cache</span>
                    </div>`;
                return;
            }
            
            players.forEach(p => {
                const card = document.createElement('div');
                card.className = 'pm-card';
                card.innerHTML = `
                    <div class="pm-card-top">
                        <img class="pm-avatar" src="https://minotar.net/avatar/${p.name}/32.png" 
                             onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAAAAABW71eEAAAARElEQVR42mP8/58BDBjhGqgEho+B4aNg+BgYPgYqMECnEQ9s2IDiH2w4j6QY9EEDX8n20AdVDPqggS/4+tEHDXzB1w8AYU7y34W8vU0AAAAASUVORK5CYII='">
                        <span class="pm-name">${p.name}</span>
                    </div>
                    <div class="pm-actions">
                        <button class="pm-action-btn op" data-cmd="op ${p.name}">OP</button>
                        <button class="pm-action-btn kick" data-cmd="kick ${p.name} Kicked by admin.">KICK</button>
                        <button class="pm-action-btn ban" data-cmd="ban ${p.name} Banned by admin.">BAN</button>
                        <button class="pm-action-btn ip" data-cmd="ban-ip ${p.name}">IP</button>
                    </div>
                `;
                
                // Bind buttons
                card.querySelectorAll('.pm-action-btn').forEach(btn => {
                    btn.onclick = async () => {
                        const cmd = btn.dataset.cmd;
                        try {
                            await window.api.serverCommand(cmd);
                            toast(`Sent command: /${cmd.split(' ')[0]}`);
                        } catch (e) { toast('Command failed: ' + e.message, 'error'); }
                    };
                });
                
                pmList.appendChild(card);
            });
        } catch (e) {
            pmList.innerHTML = `<div class="pm-empty"><span>Error loading players</span></div>`;
            toast('Failed to load player data: ' + e.message, 'error');
        }
    }

    $('#pm-refresh-btn').onclick = async () => {
        const btn = $('#pm-refresh-btn');
        btn.classList.add('spinning');
        await loadPlayers();
        setTimeout(() => btn.classList.remove('spinning'), 500);
    };

    $('#pm-add-btn').onclick = () => {
        const input = $('#pm-add-input');
        const name = input.value.trim();
        if (!name) return;
        // Just send a whitelist add or op command? We'll just whitelist by default
        window.api.serverCommand(`whitelist add ${name}`)
            .then(() => toast(`Added ${name} to whitelist`))
            .catch(e => toast(e.message, 'error'));
        input.value = '';
    };

    // ══════════════════════════════════════════════════════════
    //  SERVER PROPERTIES (key-value form)
    // ══════════════════════════════════════════════════════════
    // Properties that have a fixed set of options
    const PROP_OPTIONS = {
        'gamemode':    ['survival', 'creative', 'adventure', 'spectator'],
        'difficulty':  ['peaceful', 'easy', 'normal', 'hard'],
        'level-type':  ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified'],
    };
    const PROP_BOOL = [
        'online-mode', 'pvp', 'allow-flight', 'allow-nether',
        'white-list', 'enable-command-block', 'spawn-animals',
        'spawn-monsters', 'spawn-npcs', 'force-gamemode',
        'hardcore', 'enable-query', 'enable-rcon'
    ];

    async function loadProperties() {
        const form = $('#props-form');
        form.innerHTML = '';
        try {
            const props = await window.api.propsGet();
            for (const [key, val] of Object.entries(props)) {
                const div = document.createElement('div');
                div.className = 'prop-field';
                div.dataset.propKey = key.toLowerCase();

                const label = document.createElement('label');
                label.textContent = key;
                div.appendChild(label);

                if (PROP_OPTIONS[key]) {
                    const sel = document.createElement('select');
                    sel.dataset.key = key;
                    sel.className = 'prop-input';
                    PROP_OPTIONS[key].forEach(o => {
                        const opt = document.createElement('option');
                        opt.value = o; opt.textContent = o;
                        if (o === val) opt.selected = true;
                        sel.appendChild(opt);
                    });
                    div.appendChild(sel);
                } else if (PROP_BOOL.includes(key)) {
                    const sel = document.createElement('select');
                    sel.dataset.key = key;
                    sel.className = 'prop-input';
                    ['true', 'false'].forEach(o => {
                        const opt = document.createElement('option');
                        opt.value = o; opt.textContent = o;
                        if (o === val) opt.selected = true;
                        sel.appendChild(opt);
                    });
                    div.appendChild(sel);
                } else {
                    const inp = document.createElement('input');
                    inp.type = 'text';
                    inp.dataset.key = key;
                    inp.className = 'prop-input';
                    inp.value = val;
                    div.appendChild(inp);
                }

                form.appendChild(div);
            }

            // Real-time properties search filter
            const searchInp = $('#props-search-inp');
            if (searchInp) {
                searchInp.value = '';
                searchInp.oninput = () => {
                    const q = searchInp.value.trim().toLowerCase();
                    const fields = form.querySelectorAll('.prop-field');
                    fields.forEach(f => {
                        const k = f.dataset.propKey || '';
                        if (!q || k.includes(q)) {
                            f.style.display = '';
                        } else {
                            f.style.display = 'none';
                        }
                    });
                };
            }
        } catch (e) {
            toast('Failed to load properties', 'error');
        }
    }

    $('#btn-save-props').onclick = async () => {
        const inputs = $$('.prop-input');
        const obj = {};
        inputs.forEach(el => { obj[el.dataset.key] = el.value; });
        if (obj['server-port']) {
            const p = parseInt(obj['server-port'], 10);
            if (!p || p <= 0 || p > 65535) {
                toast('Invalid server port. Resetting to 25565.', 'warning');
                obj['server-port'] = '25565';
                const portInput = $(`input[data-key="server-port"]`);
                if (portInput) portInput.value = '25565';
            }
        }
        try {
            await window.api.propsSave(obj);
            toast('Properties saved! Restart server to apply.');
        } catch (e) { toast(e.message, 'error'); }
    };

    // ══════════════════════════════════════════════════════════
    //  BACKUPS
    // ══════════════════════════════════════════════════════════
    window.api.onBackupProgress(pct => {
        $('#backup-bar').style.width = pct + '%';
        $('#backup-label').textContent = `Backing up... ${pct}%`;
    });

    let currentBackupsDir = '/storage/emulated/0/NuvyraCraft/server/backups';

    async function loadBackups() {
        const container = $('#backups-list-container');
        const countBadge = $('#backups-count-badge');
        const pathEl = $('#backup-storage-path');
        if (!container) return;

        try {
            const res = (window.api && window.api.backupsList) ? await window.api.backupsList() : { backups: [], backupsDir: '' };
            const list = (res && Array.isArray(res.backups)) ? res.backups : [];
            if (res && res.backupsDir) currentBackupsDir = res.backupsDir;
            
            if (pathEl) {
                pathEl.textContent = currentBackupsDir;
                pathEl.title = currentBackupsDir;
            }
            if (countBadge) countBadge.textContent = list.length;

            container.innerHTML = '';
            if (list.length === 0) {
                container.innerHTML = `
                    <div class="backups-empty-state">
                        <div class="icon" style="font-size: 2rem; margin-bottom: 8px;">🗄️</div>
                        <h4 style="margin: 0 0 4px; color: var(--text-1);">No Backups Created Yet</h4>
                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-3);">Create a Full Server or Worlds backup above to protect your server.</p>
                    </div>
                `;
                return;
            }

            list.forEach(item => {
                const row = document.createElement('div');
                row.className = 'backup-item-row';
                const isWorlds = item.type === 'worlds' || item.fileName.startsWith('worlds_');
                const icon = isWorlds ? '🌍' : '📦';
                const typeName = isWorlds ? 'Worlds Only' : 'Full Server';
                const typeBadgeClass = isWorlds ? 'badge-worlds' : 'badge-full';

                row.innerHTML = `
                    <div class="backup-item-info">
                        <div class="backup-item-icon ${isWorlds ? 'is-worlds' : 'is-full'}">
                            ${icon}
                        </div>
                        <div class="backup-item-meta">
                            <span class="backup-item-name" title="${item.fileName}">${item.fileName}</span>
                            <div class="backup-item-details">
                                <span class="backup-badge ${typeBadgeClass}">${typeName}</span>
                                <span>•</span>
                                <span>${item.sizeMB || '0.0'} MB</span>
                                <span>•</span>
                                <span>${item.dateStr || ''}</span>
                            </div>
                        </div>
                    </div>
                    <div class="backup-item-actions">
                        <button class="btn-backup-restore btn secondary btn-sm" type="button" title="Restore this backup">♻️ Restore</button>
                        <button class="btn-backup-delete btn danger btn-sm" type="button" title="Delete backup">🗑️ Delete</button>
                    </div>
                `;

                // Restore button handler
                const btnRestore = row.querySelector('.btn-backup-restore');
                if (btnRestore) {
                    btnRestore.onclick = async () => {
                        if (!confirm(`Are you sure you want to RESTORE "${item.fileName}"?\n\nWarning: This will extract and overwrite server files with the contents of this backup!`)) {
                            return;
                        }
                        btnRestore.disabled = true;
                        btnRestore.textContent = '⏳ Restoring...';
                        try {
                            const r = await window.api.backupRestore(item.fileName);
                            if (r && r.error) {
                                toast('Restore failed: ' + r.error, 'error');
                            } else {
                                toast(`Backup "${item.fileName}" successfully restored! Please restart the server.`, 'success');
                            }
                        } catch (e) {
                            toast('Restore failed: ' + e.message, 'error');
                        } finally {
                            btnRestore.disabled = false;
                            btnRestore.textContent = '♻️ Restore';
                        }
                    };
                }

                // Delete button handler
                const btnDel = row.querySelector('.btn-backup-delete');
                if (btnDel) {
                    btnDel.onclick = async () => {
                        if (!confirm(`Are you sure you want to permanently delete backup "${item.fileName}"?`)) {
                            return;
                        }
                        btnDel.disabled = true;
                        try {
                            await window.api.backupDelete(item.fileName);
                            toast(`Backup "${item.fileName}" deleted.`, 'info');
                            await loadBackups();
                        } catch (e) {
                            toast('Delete failed: ' + e.message, 'error');
                            btnDel.disabled = false;
                        }
                    };
                }

                container.appendChild(row);
            });
        } catch (e) {
            if (container) {
                container.innerHTML = `
                    <div class="backups-empty-state">
                        <div class="icon">⚠️</div>
                        <h4 style="color: var(--text-1);">Failed to load backups</h4>
                        <p style="color: var(--text-3); font-size: 0.85rem;">${e.message}</p>
                    </div>
                `;
            }
        }
    }

    async function doBackup(mode) {
        const btnFull = $('#btn-backup-full');
        const btnWorlds = $('#btn-backup-worlds');
        if (btnFull) btnFull.disabled = true;
        if (btnWorlds) btnWorlds.disabled = true;
        const progressWrap = $('#backup-progress');
        if (progressWrap) progressWrap.classList.remove('hidden');
        const bar = $('#backup-bar');
        if (bar) bar.style.width = '0%';
        const label = $('#backup-label');
        if (label) label.textContent = 'Preparing backup...';

        try {
            const result = await window.api.createBackup(mode);
            toast(`Backup complete! (${result.sizeMB} MB)`);
            if (label) label.textContent = `Done — saved to backups folder`;
            await loadBackups();
        } catch (e) {
            toast('Backup failed: ' + e.message, 'error');
            if (label) label.textContent = 'Backup failed.';
        } finally {
            if (btnFull) btnFull.disabled = false;
            if (btnWorlds) btnWorlds.disabled = false;
        }
    }

    const btnBackupFull = $('#btn-backup-full');
    if (btnBackupFull) btnBackupFull.onclick = () => doBackup('full');

    const btnBackupWorlds = $('#btn-backup-worlds');
    if (btnBackupWorlds) btnBackupWorlds.onclick = () => doBackup('worlds');

    const btnRefreshBackups = $('#btn-refresh-backups');
    if (btnRefreshBackups) btnRefreshBackups.onclick = () => loadBackups();

    const btnCopyBackupPath = $('#btn-copy-backup-path');
    if (btnCopyBackupPath) {
        btnCopyBackupPath.onclick = () => {
            if (currentBackupsDir) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(currentBackupsDir);
                }
                toast('Storage directory copied: ' + currentBackupsDir, 'success');
            }
        };
    }

    // ══════════════════════════════════════════════════════════
    //  SETTINGS
    // ══════════════════════════════════════════════════════════
    async function loadSettings() {
        if (!paperVersions || paperVersions.length === 0) {
            try { paperVersions = await window.api.fetchPaperVersions(); } catch (e) {}
        }
        const sel = $('#settings-version-select');
        if (sel) {
            sel.innerHTML = '';
            (paperVersions || []).forEach(v => {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = v;
                sel.appendChild(opt);
            });
        }

        // Load Server Resources Config (.mcmeta.json)
        try {
            const cfg = await window.api.getServerConfig();
            if (cfg) {
                const inpName = $('#settings-inp-name');
                const sldRam = $('#settings-sld-ram');
                const lblRam = $('#settings-lbl-ram');
                const sldCpu = $('#settings-sld-cpu');
                const lblCpu = $('#settings-lbl-cpu');
                const inpPath = $('#settings-inp-path');

                if (inpName && cfg.name) inpName.value = cfg.name;
                const ramVal = cfg.ramMB || cfg.ram || 2048;
                if (sldRam) {
                    sldRam.value = ramVal;
                    if (lblRam) lblRam.textContent = ramVal;
                }
                const cpuVal = cfg.cpuCores || cfg.cpu || 2;
                if (sldCpu) {
                    sldCpu.value = cpuVal;
                    if (lblCpu) lblCpu.textContent = cpuVal;
                }
                if (inpPath) {
                    inpPath.value = cfg.path || savedDir || '';
                }
            }
        } catch (_) {}

        // Load Java Settings
        try {
            const javaSettings = await window.api.getJavaSettings();
            const selJava = $('#settings-java-select');
            const lblActive = $('#lbl-active-java');
            if (selJava && javaSettings) {
                selJava.value = javaSettings.configuredSetting || 'auto';
                if (lblActive) {
                    const isAuto = javaSettings.configuredSetting === 'auto';
                    lblActive.textContent = `Java ${javaSettings.activeVersion} ${isAuto ? `(Auto for MC ${javaSettings.serverVersion})` : '(Manual Override)'}`;
                }
            }
        } catch (_) {}

        // Load changelog
        loadChangelog();
    }

    // Setup Settings Resource Sliders and Save Button
    const sldSettingsRam = $('#settings-sld-ram');
    const sldSettingsCpu = $('#settings-sld-cpu');
    if (sldSettingsRam) {
        sldSettingsRam.max = ramMax;
        const lblRamMax = $('#settings-lbl-ram-max');
        if (lblRamMax) lblRamMax.textContent = (ramMax / 1024).toFixed(0) + ' GB';
        sldSettingsRam.oninput = () => {
            const lbl = $('#settings-lbl-ram');
            if (lbl) lbl.textContent = sldSettingsRam.value;
        };
    }
    if (sldSettingsCpu) {
        sldSettingsCpu.max = cpuMax;
        const lblCpuMax = $('#settings-lbl-cpu-max');
        if (lblCpuMax) lblCpuMax.textContent = cpuMax;
        sldSettingsCpu.oninput = () => {
            const lbl = $('#settings-lbl-cpu');
            if (lbl) lbl.textContent = sldSettingsCpu.value;
        };
    }

    const btnSaveConfig = $('#btn-settings-save-config');
    if (btnSaveConfig) {
        btnSaveConfig.onclick = async () => {
            const name = $('#settings-inp-name') ? $('#settings-inp-name').value.trim() : '';
            const ramMB = $('#settings-sld-ram') ? parseInt($('#settings-sld-ram').value, 10) : 2048;
            const cpuCores = $('#settings-sld-cpu') ? parseInt($('#settings-sld-cpu').value, 10) : 2;

            btnSaveConfig.disabled = true;
            try {
                const res = await window.api.saveServerConfig({ name, ram: ramMB, ramMB, cpu: cpuCores, cpuCores });
                if (res && res.success) {
                    toast('Server settings saved successfully!');
                    if (name) {
                        const sbName = $('#sidebar-server-name');
                        if (sbName) sbName.textContent = name;
                        const drName = $('#drawer-server-name');
                        if (drName) drName.textContent = name;
                    }
                } else {
                    toast((res && res.error) || 'Failed to save settings', 'error');
                }
            } catch (e) {
                toast(e.message || 'Failed to save settings', 'error');
            } finally {
                btnSaveConfig.disabled = false;
            }
        };
    }

    function showSettingsProgress(label) {
        $('#settings-progress').classList.remove('hidden');
        $('#settings-progress-bar').style.width = '0%';
        $('#settings-progress-label').textContent = label;
    }

    // Reuse the same download event
    window.api.onDownloadProgress(pct => {
        const bar = $('#settings-progress-bar');
        if (bar) {
            bar.style.width = pct + '%';
            $('#settings-progress-label').textContent = `Downloading... ${pct}%`;
        }
    });

    if (window.api.onJavaDownloadProgress) {
        window.api.onJavaDownloadProgress(data => {
            const bar = $('#settings-progress-bar');
            const label = $('#settings-progress-label');
            const wrap = $('#settings-progress');
            if (wrap) wrap.classList.remove('hidden');
            if (bar) bar.style.width = (data.percent || 0) + '%';
            if (label) label.textContent = data.status || `Downloading Java ${data.version}...`;
        });
    }

    const btnSettingsReinstall = $('#btn-settings-reinstall');
    if (btnSettingsReinstall) {
        btnSettingsReinstall.onclick = async () => {
            showSettingsProgress('Reinstalling server jar...');
            try {
                await window.api.serverReinstall();
                toast('Reinstall complete!');
            } catch (e) {
                toast(e.message, 'error');
            }
            $('#settings-progress').classList.add('hidden');
        };
    }

    const btnSettingsVersion = $('#btn-settings-version');
    if (btnSettingsVersion) {
        btnSettingsVersion.onclick = async () => {
            const selVer = $('#settings-version-select');
            const ver = selVer ? selVer.value : '';
            if (!ver) return;
            if (!confirm(`Change server version to ${ver}? This will download the new jar.`)) return;
            
            showSettingsProgress(`Downloading version ${ver}...`);
            try {
                await window.api.serverChangeVersion(ver);
                toast(`Version successfully changed to ${ver}`);
                loadSettings(); // refresh java active status
            } catch (e) {
                toast(e.message, 'error');
            }
            $('#settings-progress').classList.add('hidden');
        };
    }

    const btnSettingsJava = $('#btn-settings-java');
    if (btnSettingsJava) {
        btnSettingsJava.onclick = async () => {
            const sel = $('#settings-java-select');
            const val = sel ? sel.value : 'auto';
            btnSettingsJava.disabled = true;

            showSettingsProgress(`Applying Java ${val === 'auto' ? 'Auto Mode' : val}...`);
            try {
                const res = await window.api.setJavaVersion(val);
                const lblActive = $('#lbl-active-java');
                if (lblActive && res) {
                    const isAuto = res.configuredSetting === 'auto';
                    lblActive.textContent = `Java ${res.activeVersion} ${isAuto ? '(Auto)' : '(Manual Override)'}`;
                }
                toast(`Java ${res.activeVersion} successfully configured! Restart server to apply.`);
            } catch (e) {
                toast(e.message || 'Failed to update Java version', 'error');
            } finally {
                $('#settings-progress').classList.add('hidden');
                btnSettingsJava.disabled = false;
            }
        };
    }

    const btnBatteryOpt = $('#btn-battery-opt');
    if (btnBatteryOpt) {
        btnBatteryOpt.onclick = async () => {
            try {
                if (window.api && window.api.requestBatteryOptimization) {
                    const res = await window.api.requestBatteryOptimization();
                    if (res && res.isIgnoring) {
                        toast('Unrestricted background running is already active!', 'success');
                    } else {
                        toast('Prompted for Unrestricted Battery permission.', 'info');
                    }
                }
            } catch (e) {
                toast(e.message || 'Could not open battery settings', 'error');
            }
        };
    }

    const btnSettingsDelete = $('#btn-settings-delete');
    if (btnSettingsDelete) {
        btnSettingsDelete.onclick = async () => {
            if (!confirm('Are you absolutely sure you want to DELETE this server and all its files? This CANNOT be undone!')) return;
            try {
                await window.api.serverDelete();
                toast('Server deleted.');
                if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
                const sbName = $('#sidebar-server-name');
                if (sbName) sbName.textContent = 'Server';
                const drName = $('#drawer-server-name');
                if (drName) drName.textContent = 'Server';

                // Cleanly reset create screen so it is never stuck or disabled
                resetCreateScreen();
                showScreen('screen-create');
                checkAndDisplayStorageBanner(savedDir);
            } catch (e) {
                toast(e.message, 'error');
            }
        };
    };

    // ══════════════════════════════════════════════════════════
    //  PLUGIN MANAGER
    // ══════════════════════════════════════════════════════════
    let currentPluginQuery = '';
    let currentPluginCat = 'all';
    let searchDebounceTimer = null;

    // Tab switching: Browse vs Installed
    function switchPluginTab(tab) {
        const btnBrowse = $('#btn-plugin-tab-browse');
        const btnInstalled = $('#btn-plugin-tab-installed');
        const viewBrowse = $('#plugins-view-browse');
        const viewInstalled = $('#plugins-view-installed');

        if (!btnBrowse || !btnInstalled || !viewBrowse || !viewInstalled) return;

        if (tab === 'browse') {
            btnBrowse.className = 'btn primary sm active';
            btnInstalled.className = 'btn secondary sm';
            viewBrowse.classList.remove('hidden');
            viewInstalled.classList.add('hidden');
        } else {
            btnBrowse.className = 'btn secondary sm';
            btnInstalled.className = 'btn primary sm active';
            viewBrowse.classList.add('hidden');
            viewInstalled.classList.remove('hidden');
            loadInstalledPlugins();
        }
    }

    if ($('#btn-plugin-tab-browse')) {
        $('#btn-plugin-tab-browse').onclick = () => switchPluginTab('browse');
    }
    if ($('#btn-plugin-tab-installed')) {
        $('#btn-plugin-tab-installed').onclick = () => switchPluginTab('installed');
    }

    // Search input with debounce and clear button
    const inpSearch = $('#plugin-search-input');
    const btnClearSearch = $('#plugin-search-clear');

    if (inpSearch) {
        inpSearch.oninput = () => {
            const val = inpSearch.value.trim();
            if (btnClearSearch) btnClearSearch.classList.toggle('hidden', val.length === 0);
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                currentPluginQuery = val;
                loadPlugins(currentPluginQuery, currentPluginCat);
            }, 350);
        };
    }

    if (btnClearSearch && inpSearch) {
        btnClearSearch.onclick = () => {
            inpSearch.value = '';
            btnClearSearch.classList.add('hidden');
            currentPluginQuery = '';
            loadPlugins('', currentPluginCat);
        };
    }

    // Category filter chips
    $$('.plugin-chips .chip').forEach(chip => {
        chip.onclick = () => {
            $$('.plugin-chips .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentPluginCat = chip.dataset.cat || 'all';
            loadPlugins(currentPluginQuery, currentPluginCat);
        };
    });

    // Upload local .jar button
    const btnPluginUpload = $('#btn-plugin-upload');
    if (btnPluginUpload) {
        btnPluginUpload.onclick = async () => {
            try {
                const res = await window.api.pluginUploadLocal();
                if (res && res.success && res.installed && res.installed.length > 0) {
                    toast(`Installed ${res.installed.length} plugin(s) successfully!`);
                    switchPluginTab('installed');
                    await loadInstalledPlugins();
                    await loadPlugins();
                }
            } catch (err) {
                toast(err.message || 'Plugin upload failed', 'error');
            }
        };
    }

    // Load and render browse store plugins
    async function loadPlugins(query = currentPluginQuery, category = currentPluginCat) {
        const grid = $('#plugin-grid');
        if (!grid) return;

        grid.innerHTML = `
            <div class="plugins-loading-state" style="grid-column: 1 / -1;">
                <div style="font-size: 32px; margin-bottom: 8px;">⏳</div>
                <p>Searching plugins...</p>
            </div>
        `;

        try {
            const res = await window.api.pluginSearch(query, category);
            const plugins = Array.isArray(res) ? res : (res && Array.isArray(res.hits) ? res.hits : []);
            grid.innerHTML = '';

            if (!plugins || plugins.length === 0) {
                grid.innerHTML = `
                    <div class="plugins-empty-state" style="grid-column: 1 / -1;">
                        <div class="icon">🔍</div>
                        <h4>No plugins found</h4>
                        <p>Try searching for a different keyword like "ViaVersion", "LuckPerms", or "Essentials".</p>
                    </div>
                `;
                return;
            }

            plugins.forEach(p => {
                const card = document.createElement('div');
                card.className = 'plugin-card';

                // Format downloads (e.g. 1.2M, 45.3K)
                let dlsFormatted = '0';
                if (p.downloads >= 1000000) dlsFormatted = (p.downloads / 1000000).toFixed(1) + 'M';
                else if (p.downloads >= 1000) dlsFormatted = (p.downloads / 1000).toFixed(1) + 'K';
                else dlsFormatted = String(p.downloads || 0);

                const iconSrc = p.icon_url || p.iconUrl;
                const iconHtml = iconSrc
                    ? `<img class="plugin-card-icon" src="${iconSrc}" onerror="this.outerHTML='<div class=\\'plugin-card-icon\\'>🧩</div>'">`
                    : `<div class="plugin-card-icon">🧩</div>`;

                const isInstalled = p.isInstalled;
                const btnLabel = isInstalled ? '✅ Installed' : '📥 Install';
                const btnClass = isInstalled ? 'plugin-btn-install installed' : 'plugin-btn-install ready';
                const catLabel = (p.categories && p.categories[0]) ? p.categories[0] : 'Plugin';

                card.innerHTML = `
                    <div>
                        <div class="plugin-card-header">
                            ${iconHtml}
                            <div class="plugin-card-info">
                                <div class="plugin-card-title" title="${p.title}">${p.title}</div>
                                <div class="plugin-card-author">by ${p.author || 'Community'}</div>
                                <div class="plugin-card-meta">
                                    <span class="plugin-badge-dl">⬇ ${dlsFormatted}</span>
                                    <span class="plugin-badge-cat">${catLabel}</span>
                                </div>
                            </div>
                        </div>
                        <div class="plugin-card-desc" title="${p.description || ''}">${p.description || 'No description provided.'}</div>
                    </div>
                    <div class="plugin-card-footer">
                        <span style="font-size: 11px; color: var(--text-3);">${p.isCurated ? '★ Curated' : 'Modrinth'}</span>
                        <button class="${btnClass}" ${isInstalled ? 'disabled' : ''} data-id="${p.id || p.slug}">${btnLabel}</button>
                    </div>
                `;

                const btnInstall = card.querySelector('.plugin-btn-install');
                if (!isInstalled && btnInstall) {
                    btnInstall.onclick = async () => {
                        await installPluginFromCard(p, btnInstall);
                    };
                }

                grid.appendChild(card);
            });
        } catch (err) {
            grid.innerHTML = `
                <div class="plugins-empty-state" style="grid-column: 1 / -1;">
                    <div class="icon">⚠️</div>
                    <h4>Failed to load plugins</h4>
                    <p>${err.message || 'Check your internet connection and try again.'}</p>
                </div>
            `;
        }
    }

    // Install a plugin from card with progress feedback
    async function installPluginFromCard(p, btn) {
        btn.disabled = true;
        btn.className = 'plugin-btn-install downloading';
        btn.innerHTML = '⏳ Resolving...';

        try {
            const verInfo = await window.api.pluginGetVersion(p.slug || p.id);
            const downloadUrl = verInfo.downloadUrl;
            const fileName = verInfo.fileName || p.defaultFileName;

            btn.innerHTML = '⬇ Downloading...';

            await window.api.pluginInstall({
                projectId: p.slug || p.id,
                downloadUrl: downloadUrl,
                fileName: fileName
            });

            btn.className = 'plugin-btn-install installed';
            btn.innerHTML = '✅ Installed';
            p.isInstalled = true;

            toast(`Plugin "${p.title}" installed successfully! Restart server to activate.`);
            await loadInstalledPlugins();
        } catch (err) {
            btn.disabled = false;
            btn.className = 'plugin-btn-install ready';
            btn.innerHTML = '📥 Install';
            toast(`Failed to install ${p.title}: ${err.message}`, 'error');
        }
    }

    // Live download progress hook
    if (window.api.onPluginDownloadProgress) {
        window.api.onPluginDownloadProgress(({ fileName, pct }) => {
            const downloadingBtns = $$('.plugin-btn-install.downloading');
            downloadingBtns.forEach(b => {
                b.innerHTML = `⬇ ${pct}%`;
            });
        });
    }

    // Load and render installed plugins list
    async function loadInstalledPlugins() {
        const container = $('#installed-plugins-list');
        const countBadge = $('#installed-plugins-count');

        try {
            const list = await window.api.pluginsGetInstalled();
            if (countBadge) countBadge.textContent = list.length;

            if (!container) return;
            container.innerHTML = '';

            if (list.length === 0) {
                container.innerHTML = `
                    <div class="plugins-empty-state">
                        <div class="icon">📦</div>
                        <h4>No plugins installed yet</h4>
                        <p>Browse the plugin store or click "Upload .jar" to add plugins to your server.</p>
                    </div>
                `;
                return;
            }

            list.forEach(item => {
                const row = document.createElement('div');
                row.className = `installed-plugin-row ${item.enabled ? '' : 'is-disabled'}`;

                row.innerHTML = `
                    <div class="installed-info">
                        <div class="installed-icon ${item.enabled ? '' : 'disabled'}">
                            ${item.enabled ? '🧩' : '💤'}
                        </div>
                        <div class="installed-meta">
                            <span class="installed-name" title="${item.fileName}">${item.name}</span>
                            <div class="installed-details">
                                <span>${item.sizeMB ? item.sizeMB + ' MB' : (item.size ? formatSize(item.size) : '0 MB')}</span>
                                <span>•</span>
                                <span class="status-label" style="color: ${item.enabled ? 'var(--green-400)' : 'var(--text-3)'}">
                                    ${item.enabled ? 'Enabled' : 'Disabled'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="installed-actions">
                        <label class="plugin-switch" title="${item.enabled ? 'Disable plugin' : 'Enable plugin'}">
                            <input type="checkbox" ${item.enabled ? 'checked' : ''}>
                            <span class="plugin-slider"></span>
                        </label>
                        <button class="btn-plugin-delete" title="Delete plugin">🗑</button>
                    </div>
                `;

                // Toggle enabled/disabled switch
                const chk = row.querySelector('input[type="checkbox"]');
                chk.onchange = async () => {
                    chk.disabled = true;
                    try {
                        await window.api.pluginToggle(item.fileName);
                        toast(`Plugin "${item.name}" ${chk.checked ? 'enabled' : 'disabled'}. Server restart required.`);
                        await loadInstalledPlugins();
                    } catch (err) {
                        chk.checked = !chk.checked;
                        chk.disabled = false;
                        toast(err.message, 'error');
                    }
                };

                // Delete plugin button
                const btnDel = row.querySelector('.btn-plugin-delete');
                btnDel.onclick = async () => {
                    if (confirm(`Are you sure you want to delete "${item.fileName}"?`)) {
                        try {
                            await window.api.pluginDelete(item.fileName);
                            toast(`Plugin "${item.name}" deleted.`);
                            await loadInstalledPlugins();
                            loadPlugins(); // refresh installed status in store
                        } catch (err) {
                            toast(err.message, 'error');
                        }
                    }
                };

                container.appendChild(row);
            });
        } catch (err) {
            if (container) {
                container.innerHTML = `
                    <div class="plugins-empty-state">
                        <div class="icon">⚠️</div>
                        <h4>Could not load installed plugins</h4>
                        <p>${err.message}</p>
                    </div>
                `;
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  UPDATE SYSTEM, GITHUB HOT-PATCH & CHANGELOG
    // ══════════════════════════════════════════════════════════
    let activeUpdateInfo = null;

    async function loadChangelog() {
        const display = $('#update-changelog-display');
        const lblVersion = $('#lbl-installed-version');

        try {
            const currentAppVer = await window.api.getAppVersion();
            const data = await window.api.getUpdateChangelog();
            const versionCode = (data && data.versionCode) ? data.versionCode : 103;
            if (lblVersion) {
                lblVersion.textContent = `v${currentAppVer} (Build #${versionCode})`;
            }
            const sidebarVer = document.querySelector('.sidebar-version span:not(.dot)');
            if (sidebarVer) {
                sidebarVer.textContent = `v${currentAppVer}`;
            }

            if (display && data && data.changelog && data.changelog.length > 0) {
                const latest = data.changelog[0];
                let html = `<div style="margin-top: 4px;">`;
                html += `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">`;
                html += `<span style="font-size: 13px; color: var(--text-1); font-weight: 600;">${latest.title}</span>`;
                html += `<span class="changelog-version-tag">v${latest.version}</span>`;
                html += `</div><ul class="changelog-list">`;
                const maxItems = Math.min(latest.changes.length, 5);
                for (let i = 0; i < maxItems; i++) {
                    html += `<li>${latest.changes[i]}</li>`;
                }
                if (latest.changes.length > 5) {
                    html += `<li style="color: var(--text-3);">+${latest.changes.length - 5} more updates...</li>`;
                }
                html += `</ul></div>`;
                display.innerHTML = html;
            }
        } catch (_) {}
    }

    // Call once on startup
    loadChangelog();

    // Manual update check button
    const btnCheckUpdates = $('#btn-check-updates');
    const btnDownloadUpdate = $('#btn-download-update');
    const btnRelaunchUpdate = $('#btn-relaunch-update');
    const statusEl = $('#update-check-status');
    const badgePill = $('#update-badge-pill');
    const progressBox = $('#hot-update-progress-container');
    const barProgress = $('#hot-update-bar');
    const lblPct = $('#hot-update-pct-label');
    const lblFile = $('#hot-update-file-label');

    if (btnCheckUpdates) {
        btnCheckUpdates.onclick = async () => {
            btnCheckUpdates.disabled = true;
            statusEl.textContent = 'Analyzing GitHub repository for updates...';
            statusEl.style.color = 'var(--text-2)';

            try {
                const result = await window.api.checkForUpdatesManual();
                if (result.updateAvailable) {
                    activeUpdateInfo = result;
                    if (badgePill) {
                        badgePill.className = 'badge-pill update-ready';
                        badgePill.textContent = `● Update Available: v${result.version}`;
                    }
                    statusEl.textContent = `🚀 Update v${result.version} (Build #${result.versionCode}) is ready! Direct hot-patch available.`;
                    statusEl.style.color = 'var(--green-400)';
                    
                    if (btnDownloadUpdate) btnDownloadUpdate.classList.remove('hidden');
                    if (btnRelaunchUpdate) btnRelaunchUpdate.classList.add('hidden');

                    toast(`New version v${result.version} found! Click 'Download & Apply' to update.`);
                } else if (result.error) {
                    statusEl.textContent = `Update check note: ${result.error}`;
                    statusEl.style.color = 'var(--yellow-500)';
                } else {
                    if (badgePill) {
                        badgePill.className = 'badge-pill up-to-date';
                        badgePill.textContent = `● Up to Date`;
                    }
                    statusEl.textContent = result.message || `You're up to date! Nuvyra-Craft v${result.version} is running.`;
                    statusEl.style.color = 'var(--green-400)';
                    if (btnDownloadUpdate) btnDownloadUpdate.classList.add('hidden');
                    if (btnRelaunchUpdate) btnRelaunchUpdate.classList.add('hidden');
                    toast('Your Nuvyra-Craft is running the latest version!');
                }
            } catch (e) {
                statusEl.textContent = 'Could not complete update check. Please verify internet connection.';
                statusEl.style.color = 'var(--red-500)';
            }

            btnCheckUpdates.disabled = false;
        };
    }

    // 1-Click Hot-Update Download Button (No .exe needed!)
    if (btnDownloadUpdate) {
        btnDownloadUpdate.onclick = async () => {
            btnDownloadUpdate.disabled = true;
            btnDownloadUpdate.innerHTML = '⏳ Downloading from GitHub...';
            if (btnCheckUpdates) btnCheckUpdates.disabled = true;
            if (progressBox) progressBox.classList.remove('hidden');

            try {
                const res = await window.api.applyGithubHotUpdate();
                if (res && res.success) {
                    statusEl.textContent = `✅ Successfully updated to v${res.version} (Build #${res.versionCode})! Relaunch now to apply changes.`;
                    statusEl.style.color = 'var(--green-400)';
                    btnDownloadUpdate.classList.add('hidden');
                    if (btnRelaunchUpdate) {
                        btnRelaunchUpdate.innerHTML = '🔄 Relaunch to Apply Update';
                        btnRelaunchUpdate.classList.remove('hidden');
                    }
                    if (progressBox) progressBox.classList.add('hidden');
                    toast('Update applied successfully! Relaunching will activate new features.', 'success');
                }
            } catch (err) {
                btnDownloadUpdate.disabled = false;
                btnDownloadUpdate.innerHTML = '⚡ Download & Apply Update';
                statusEl.textContent = `Failed to apply update: ${err.message}`;
                statusEl.style.color = 'var(--red-500)';
                toast(`Update failed: ${err.message}`, 'error');
            }

            if (btnCheckUpdates) btnCheckUpdates.disabled = false;
        };
    }

    // Safely save server and relaunch app to apply changes (PC parity)
    if (btnRelaunchUpdate) {
        btnRelaunchUpdate.onclick = async () => {
            btnRelaunchUpdate.disabled = true;
            btnRelaunchUpdate.innerHTML = '⏳ Saving World & Relaunching...';
            toast('Safely saving world & relaunching Nuvyra-Craft...', 'info');

            try {
                if (window.api && window.api.relaunchApp) {
                    await window.api.relaunchApp();
                } else {
                    window.location.reload();
                }
            } catch (_) {
                window.location.reload();
            }
        };
    }

    // Live Hot-Update Download Progress listener
    if (window.api.onHotUpdateProgress) {
        window.api.onHotUpdateProgress(({ current, total, file, pct }) => {
            const percent = pct !== undefined ? pct : (total > 0 ? Math.round((current * 100) / total) : 0);
            if (barProgress) barProgress.style.width = `${percent}%`;
            if (lblPct) lblPct.textContent = `${percent}%`;
            if (lblFile) lblFile.textContent = `Syncing ${file} (${current}/${total})...`;
        });
    }

    // Startup background update detection
    if (window.api.onHotUpdateAvailable) {
        window.api.onHotUpdateAvailable((updateInfo) => {
            activeUpdateInfo = updateInfo;
            if (badgePill) {
                badgePill.className = 'badge-pill update-ready';
                badgePill.textContent = `● Update Available: v${updateInfo.version}`;
            }
            if (btnDownloadUpdate) btnDownloadUpdate.classList.remove('hidden');
            if (statusEl) {
                statusEl.textContent = `New update v${updateInfo.version} detected on GitHub! Click 'Download & Apply Update' to sync.`;
                statusEl.style.color = 'var(--green-400)';
            }
            toast(`Nuvyra-Craft v${updateInfo.version} is available! Open Settings to update.`);
        });
    }

    // Automatic background update check on app launch
    setTimeout(async () => {
        try {
            if (window.api && window.api.checkForUpdatesManual) {
                const res = await window.api.checkForUpdatesManual();
                if (res && res.updateAvailable) {
                    activeUpdateInfo = res;
                    if (badgePill) {
                        badgePill.className = 'badge-pill update-ready';
                        badgePill.textContent = `● Update Available: v${res.version}`;
                    }
                    if (btnDownloadUpdate) btnDownloadUpdate.classList.remove('hidden');
                    toast(`Update v${res.version} is available! Go to Settings to install.`);
                }
            }
        } catch (_) {}
    }, 2500);

    // Initialize mobile app boot flow (storage, splash, direct-to-create or dashboard)
    initAppOnStartup();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

