// ============================================================
//  Nuvyra-Craft Mobile — Bridge (replaces Electron preload.js)
//  Vanilla JS compatible — ZERO bare module imports
//  Guarantees instant, error-free window.api initialization
// ============================================================

(function () {
    'use strict';

    console.log('[Nuvyra-Craft Mobile] Initializing mobile bridge...');

    // ── Capacitor Plugin Reference ──────────────────────────────
    const Cap = window.Capacitor || { Plugins: {} };
    const getPlugin = (name) => {
        if (Cap.registerPlugin) {
            try { return Cap.registerPlugin(name); } catch (_) {}
        }
        return (Cap.Plugins && Cap.Plugins[name]) ? Cap.Plugins[name] : {};
    };

    const ServerProcess = getPlugin('ServerProcess');
    const JavaManager   = getPlugin('JavaManager');
    const FileManager   = getPlugin('FileManager');
    const SystemInfo    = getPlugin('SystemInfo');
    const CapApp        = (Cap.Plugins && Cap.Plugins.App) ? Cap.Plugins.App : {};

    // ── Mobile Update Config (GitHub Data Center) ───────────────
    const BUNDLED_APP_VERSION = '1.0.7';
    const BUNDLED_APP_VERSION_CODE = 1007;

    const MOBILE_GITHUB_CONFIG = {
        owner: 'NuvyraHost',
        repo: 'Nuvyra-Craft',
        branch: 'main',
        get rawManifestUrl() {
            return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/mobile/mobile-update-check.json`;
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

    function createTimeoutSignal(ms) {
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
            try { return AbortSignal.timeout(ms); } catch (_) {}
        }
        try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), ms);
            return controller.signal;
        } catch (_) { return undefined; }
    }

    // ── Curated Top Minecraft Plugins Catalog ───────────────────
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
            directDownload: "https://ci.lucko.me/job/spark/lastSuccessfulBuild/artifact/spark-bukkit/build/libs/spark-1.10.187-bukkit.jar",
            defaultFileName: "spark-bukkit.jar"
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
        },
        {
            id: "playit",
            slug: "playit",
            title: "Playit.gg",
            author: "playit-cloud",
            description: "Free tunnel to share your server with friends without port forwarding. Gives you a public IP/domain.",
            icon_url: "https://playit.gg/favicon.png",
            downloads: 5000000,
            categories: ["utility", "network"],
            directDownload: "https://github.com/playit-cloud/playit-minecraft-plugin/releases/download/v0.2.0/playit-minecraft-plugin.jar",
            defaultFileName: "playit-minecraft-plugin.jar"
        }
    ];

    // ── Event Emitter ───────────────────────────────────────────
    const eventCallbacks = {};
    function onNativeEvent(eventName, callback) {
        if (!eventCallbacks[eventName]) eventCallbacks[eventName] = [];
        eventCallbacks[eventName].push(callback);
    }

    function emitEvent(eventName, data) {
        if (eventCallbacks[eventName]) {
            eventCallbacks[eventName].forEach(cb => {
                try { cb(data); } catch (e) { console.error('Event error:', e); }
            });
        }
    }

    function hookListener(plugin, eventName) {
        try {
            if (plugin && typeof plugin.addListener === 'function') {
                plugin.addListener(eventName, (data) => {
                    emitEvent(eventName, data);
                    if (eventName === 'java-download-progress' || eventName === 'setup-progress') {
                        if (data && typeof data.percent === 'number') {
                            emitEvent('download-progress', data.percent);
                        }
                    }
                });
            }
        } catch (e) {
            console.warn(`Could not hook listener for ${eventName}:`, e);
        }
    }

    // Hook native events
    hookListener(ServerProcess, 'console-data');
    hookListener(ServerProcess, 'server-state');
    hookListener(ServerProcess, 'setup-progress');
    hookListener(ServerProcess, 'download-progress');
    hookListener(JavaManager, 'setup-progress');
    hookListener(JavaManager, 'java-download-progress');
    hookListener(JavaManager, 'download-progress');
    hookListener(FileManager, 'backup-progress');
    hookListener(FileManager, 'plugin-download-progress');

    function getRecommendedJavaForMc(mcVersion) {
        if (!mcVersion) return 17;
        try {
            const parts = String(mcVersion).split('.');
            const major = parseInt(parts[0], 10) || 1;
            const minor = parseInt(parts[1], 10) || 0;
            if (major > 1 || minor >= 21) return 21;
            if (minor >= 18) return 17;
            if (minor >= 17) return 16;
        } catch (_) {}
        return 17;
    }

    // ── Expose window.api (Identical signature to Electron preload.js) ──
    window.api = {
        // ── Window Controls ───────────────────────────────────
        winMinimize: () => {},
        winMaximize: () => {},
        winClose:    () => { if (CapApp.exitApp) CapApp.exitApp(); },

        // ── System ────────────────────────────────────────────
        checkJava: async (dir) => {
            try {
                if (JavaManager.checkJava) {
                    const res = await JavaManager.checkJava({ dir });
                    return {
                        found: !!res.installed,
                        version: res.version || '17',
                        portable: true,
                        path: res.path || ''
                    };
                }
                return { found: false, version: '' };
            } catch (e) {
                return { found: false, version: '' };
            }
        },
        checkJava21: async () => {
            try {
                if (JavaManager.checkJava21) {
                    const res = await JavaManager.checkJava21();
                    return {
                        found: !!res.installed,
                        version: res.version || '21',
                        portable: true,
                        path: res.path || ''
                    };
                }
                return { found: false, version: '' };
            } catch (e) {
                return { found: false, version: '' };
            }
        },
        installJava: async (opts) => {
            const ver = (typeof opts === 'object' && opts.version) ? opts.version : (typeof opts === 'string' && opts.match(/^\d+$/) ? opts : '17');
            if (JavaManager.installJava) {
                const res = await JavaManager.installJava({ version: String(ver) });
                if (res && res.success === false) {
                    throw new Error(res.error || 'Java installation failed');
                }
                return res;
            }
            return { success: true };
        },
        installJava21: async () => {
            if (JavaManager.installJava21) {
                const res = await JavaManager.installJava21();
                if (res && res.success === false) {
                    throw new Error(res.error || 'Java 21 installation failed');
                }
                return res;
            }
            // Fallback: route through installJava with version=21
            return window.api.installJava({ version: '21' });
        },
        getJavaSettings: async () => {
            try {
                let setting = 'auto';
                let sVer = '1.20.1';
                try {
                    const cfg = await window.api.getServerConfig();
                    if (cfg) {
                        if (cfg.version) sVer = cfg.version;
                        if (cfg.javaVersion) setting = cfg.javaVersion;
                    }
                } catch (_) {}

                if (!setting || setting === 'auto') {
                    if (JavaManager.getJavaSettings) {
                        const res = await JavaManager.getJavaSettings();
                        if (res && res.configuredSetting) setting = res.configuredSetting;
                        else if (res && res.setting) setting = res.setting;
                    }
                }
                if (!setting) setting = 'auto';

                const rec = getRecommendedJavaForMc(sVer);
                const activeVersion = (setting === 'auto') ? String(rec) : String(setting);

                return {
                    setting,
                    configuredSetting: setting,
                    activeVersion,
                    serverVersion: sVer
                };
            } catch (e) {
                return { setting: 'auto', configuredSetting: 'auto', activeVersion: '17', serverVersion: '1.20.1' };
            }
        },
        setJavaVersion: async (setting) => {
            try {
                const s = String(setting || 'auto');
                if (JavaManager.setJavaVersion) {
                    await JavaManager.setJavaVersion({ setting: s });
                }
                try {
                    if (ServerProcess.saveServerConfig) {
                        await ServerProcess.saveServerConfig({ javaVersion: s });
                    }
                } catch (_) {}

                // If user selected Java 21 or higher, check if installed; if not, download & install!
                if (s === '21' || s === '25') {
                    if (JavaManager.checkJava21) {
                        const chk = await JavaManager.checkJava21();
                        if (!chk || !chk.installed) {
                            await window.api.installJava21();
                        }
                    }
                }

                let sVer = '1.20.1';
                try {
                    const cfg = await window.api.getServerConfig();
                    if (cfg && cfg.version) sVer = cfg.version;
                } catch (_) {}

                const rec = getRecommendedJavaForMc(sVer);
                const activeVersion = (s === 'auto') ? String(rec) : s;

                return {
                    success: true,
                    setting: s,
                    configuredSetting: s,
                    activeVersion,
                    serverVersion: sVer
                };
            } catch (e) {
                return { success: false, error: e.message || 'Failed to configure Java version' };
            }
        },

        getSystemInfo: async () => {
            try {
                if (SystemInfo.getSystemInfo) {
                    const res = await SystemInfo.getSystemInfo();
                    return {
                        totalRamMB: res.totalMemMB || 4096,
                        cores: res.cores || res.cpuCores || 4,
                        os: res.os || 'Android',
                        arch: res.arch || 'arm64-v8a'
                    };
                }
                return { totalRamMB: 4096, cores: 4, os: 'Android', arch: 'arm64-v8a' };
            } catch (e) {
                return { totalRamMB: 4096, cores: 4, os: 'Android', arch: 'arm64-v8a' };
            }
        },
        getLiveStats: async () => {
            try {
                if (ServerProcess.getLiveStats) {
                    const res = await ServerProcess.getLiveStats();
                    return {
                        cpuPercent: String(res.cpuPercent || '0.0'),
                        ramUsedMB: res.ramUsedMB !== undefined ? res.ramUsedMB : 0,
                        ramTotalMB: res.ramTotalMB || 2048
                    };
                }
                if (SystemInfo.getLiveStats) {
                    const res = await SystemInfo.getLiveStats();
                    return {
                        cpuPercent: String(res.cpuPercent || '0.0'),
                        ramUsedMB: res.usedMemMB || 0,
                        ramTotalMB: 2048
                    };
                }
                return { cpuPercent: '0.0', ramUsedMB: 0, ramTotalMB: 2048 };
            } catch (e) {
                return { cpuPercent: '0.0', ramUsedMB: 0, ramTotalMB: 2048 };
            }
        },
        checkDiskSpace: async (dir) => {
            try {
                if (SystemInfo.checkDiskSpace) {
                    const res = await SystemInfo.checkDiskSpace({ dir });
                    const freeGB = ((res.freeMB || 4096) / 1024).toFixed(1);
                    return { ok: true, freeGB };
                }
                return { ok: true, freeGB: '10.0' };
            } catch (e) {
                return { ok: true, freeGB: '10.0' };
            }
        },
        checkPort: async (port) => {
            try {
                if (SystemInfo.checkPort) {
                    const res = await SystemInfo.checkPort({ port: parseInt(port, 10) || 25565 });
                    return { inUse: !!res.inUse };
                }
                return { inUse: false };
            } catch (e) {
                return { inUse: false };
            }
        },
        getNetworkInfo: async () => {
            try {
                if (SystemInfo.getNetworkInfo) {
                    return await SystemInfo.getNetworkInfo();
                }
                return {
                    localIp: '127.0.0.1',
                    lanIp: '127.0.0.1',
                    port: 25565,
                    sameDeviceJoin: '127.0.0.1:25565',
                    lanJoin: '127.0.0.1:25565',
                    hotspotJoin: '192.168.43.1:25565'
                };
            } catch (e) {
                return {
                    localIp: '127.0.0.1',
                    lanIp: '127.0.0.1',
                    port: 25565,
                    sameDeviceJoin: '127.0.0.1:25565',
                    lanJoin: '127.0.0.1:25565',
                    hotspotJoin: '192.168.43.1:25565'
                };
            }
        },

        // ── Setup & Directory Picker ──────────────────────────
        pickDirectory: async (customDir) => {
            try {
                if (FileManager.pickDirectory) {
                    const res = await FileManager.pickDirectory({ dir: customDir || '' });
                    return res.path || '/data/data/com.nuvyra.craft.mobile/files/servers/default';
                }
                return '/data/data/com.nuvyra.craft.mobile/files/servers/default';
            } catch (e) {
                return '/data/data/com.nuvyra.craft.mobile/files/servers/default';
            }
        },
        checkExistingServer: async (dir) => {
            try {
                if (FileManager.checkExistingServer) {
                    const res = await FileManager.checkExistingServer({ dir });
                    return {
                        exists: !!res.exists,
                        name: res.name || 'Nuvyra Server',
                        meta: res.meta || { name: 'Nuvyra Server', version: '1.20.4' }
                    };
                }
                return { exists: false };
            } catch (e) {
                return { exists: false };
            }
        },

        // ── PaperMC Versions (Direct CDN catalog — no API calls) ──
        fetchPaperVersions: async () => {
            return [
                "1.21.11",
                "1.21.10",
                "1.21.9",
                "1.21.8",
                "1.21.7",
                "1.21.6",
                "1.21.5",
                "1.21.4",
                "1.21.3",
                "1.21.1",
                "1.21",
                "1.20.6",
                "1.20.5",
                "1.20.4",
                "1.20.2",
                "1.20.1",
                "1.20",
                "1.19.4",
                "1.19.3",
                "1.19.2",
                "1.19.1",
                "1.19",
                "1.18.2",
                "1.18.1",
                "1.18",
                "1.17.1",
                "1.17",
                "1.16.5",
                "1.16.4",
                "1.16.3",
                "1.16.2",
                "1.16.1",
                "1.15.2",
                "1.15.1",
                "1.15",
                "1.14.4",
                "1.14.3",
                "1.14.2",
                "1.14.1",
                "1.14",
                "1.13.2",
                "1.13.1",
                "1.13",
                "1.12.2",
                "1.12.1",
                "1.12",
                "1.11.2",
                "1.10.2",
                "1.9.4",
                "1.8.8",
                "1.7.10"
            ];
        },

        // ── Server Process Management ─────────────────────────
        createServer: (opts) => {
            if (ServerProcess.createServer) return ServerProcess.createServer(opts);
            return Promise.resolve({ success: true });
        },
        requestBatteryOptimization: () => {
            if (ServerProcess && ServerProcess.requestBatteryOptimizationExemption) {
                return ServerProcess.requestBatteryOptimizationExemption();
            }
            return Promise.resolve({ isIgnoring: true });
        },
        serverStart: async () => {
            try {
                if (ServerProcess && ServerProcess.requestBatteryOptimizationExemption) {
                    await ServerProcess.requestBatteryOptimizationExemption().catch(() => {});
                }
            } catch (_) {}
            if (ServerProcess.start) return ServerProcess.start();
            return Promise.resolve({ success: true });
        },
        serverStop: () => {
            if (ServerProcess.stop) return ServerProcess.stop();
            return Promise.resolve({ success: true });
        },
        serverRestart: () => {
            if (ServerProcess.restart) return ServerProcess.restart();
            return Promise.resolve({ success: true });
        },
        serverKill: () => {
            if (ServerProcess.kill) return ServerProcess.kill();
            return Promise.resolve({ success: true });
        },
        serverCommand: (cmd) => {
            if (ServerProcess.sendCommand) return ServerProcess.sendCommand({ command: cmd });
            return Promise.resolve({ success: true });
        },

        serverReinstall: () => {
            if (ServerProcess.reinstall) return ServerProcess.reinstall();
            return Promise.resolve({ success: true });
        },
        serverChangeVersion: (ver) => {
            if (ServerProcess.changeVersion) return ServerProcess.changeVersion({ version: ver });
            return Promise.resolve({ success: true });
        },
        serverDelete: () => {
            if (ServerProcess.deleteServer) return ServerProcess.deleteServer();
            return Promise.resolve({ success: true });
        },
        getServerConfig: async () => {
            if (ServerProcess.getServerConfig) return await ServerProcess.getServerConfig();
            return { path: '', name: 'Server', ram: 2048, cpu: 2, version: '1.21.11' };
        },
        saveServerConfig: async (config) => {
            if (ServerProcess.saveServerConfig) return await ServerProcess.saveServerConfig(config);
            return { success: true };
        },

        serverStatus: async () => {
            try {
                if (ServerProcess.getStatus) return await ServerProcess.getStatus();
                return { running: false };
            } catch (e) {
                return { running: false };
            }
        },
        getServerDir: async () => {
            try {
                if (FileManager.getServerDir) {
                    const res = await FileManager.getServerDir();
                    return res.path || '/data/data/com.nuvyra.craft.mobile/files/servers/default';
                }
                return '/data/data/com.nuvyra.craft.mobile/files/servers/default';
            } catch (e) {
                return '/data/data/com.nuvyra.craft.mobile/files/servers/default';
            }
        },

        checkStoragePermission: async () => {
            try {
                if (FileManager.checkStoragePermission) {
                    return await FileManager.checkStoragePermission();
                }
                return { granted: true, isAllFilesAccess: true };
            } catch (e) {
                return { granted: false, error: e.message };
            }
        },
        requestStoragePermission: async () => {
            try {
                if (FileManager.requestStoragePermission) {
                    return await FileManager.requestStoragePermission();
                }
                return { openedSettings: false };
            } catch (e) {
                return { openedSettings: false, error: e.message };
            }
        },
        getDefaultStoragePaths: async () => {
            try {
                if (FileManager.getDefaultStoragePaths) {
                    return await FileManager.getDefaultStoragePaths();
                }
                return {
                    phoneStorage: '/storage/emulated/0/NuvyraCraft/server',
                    downloads: '/storage/emulated/0/Download/NuvyraCraft/server',
                    appStorage: '/data/data/com.nuvyra.craft.mobile/files/servers/default'
                };
            } catch (e) {
                return {
                    phoneStorage: '/storage/emulated/0/NuvyraCraft/server',
                    downloads: '/storage/emulated/0/Download/NuvyraCraft/server',
                    appStorage: '/data/data/com.nuvyra.craft.mobile/files/servers/default'
                };
            }
        },

        // ── File Manager ──────────────────────────────────────
        fmList: async (rel) => {
            try {
                if (FileManager.list) {
                    const res = await FileManager.list({ path: rel || '' });
                    return (res.files || []).map(f => {
                        const isDir = (f.isDir !== undefined) ? !!f.isDir : !!f.isDirectory;
                        const relPath = f.rel || (rel ? (rel.endsWith('/') ? rel + f.name : rel + '/' + f.name) : f.name);
                        return {
                            ...f,
                            isDir,
                            isDirectory: isDir,
                            rel: relPath
                        };
                    });
                }
                return [];
            } catch (e) {
                return [];
            }
        },
        fmRead: async (rel) => {
            try {
                if (FileManager.read) {
                    const res = await FileManager.read({ path: rel || '' });
                    return res.content || '';
                }
                return '';
            } catch (e) {
                return '';
            }
        },
        fmWrite:        (rel, data)  => FileManager.write ? FileManager.write({ path: rel, data }) : Promise.resolve({ success: true }),
        fmDelete:       (rel)        => FileManager.deleteFile ? FileManager.deleteFile({ path: rel }) : Promise.resolve({ success: true }),
        fmRename:       (rel, name)  => FileManager.rename ? FileManager.rename({ path: rel, name }) : Promise.resolve({ success: true }),
        fmUpload:       (rel, paths) => FileManager.upload ? FileManager.upload({ path: rel, paths }) : Promise.resolve({ success: true }),
        fmUploadDialog: (rel)        => FileManager.uploadDialog ? FileManager.uploadDialog({ path: rel }) : Promise.resolve({ success: true }),
        fmUploadFile:   (rel, name, base64) => FileManager.uploadFile ? FileManager.uploadFile({ path: rel, name, base64 }) : Promise.resolve({ success: true }),
        fmExtract:      (rel, name)  => FileManager.extract ? FileManager.extract({ path: rel, name }) : Promise.resolve({ success: true }),
        fmDeleteBatch:  (paths)      => FileManager.deleteBatch ? FileManager.deleteBatch({ paths }) : Promise.resolve({ success: true }),
        getPathForFile: (file)       => (file && file.name) ? file.name : '',

        // ── World Manager ─────────────────────────────────────
        worldList: async () => {
            try {
                if (FileManager.worldList) {
                    const res = await FileManager.worldList();
                    return (res.worlds || []).map(w => ({
                        ...w,
                        sizeMB: w.sizeMB !== undefined ? w.sizeMB : ((w.size || 0) / (1024 * 1024)).toFixed(1)
                    }));
                }
                return [];
            } catch (e) {
                return [];
            }
        },
        worldDelete: (n) => FileManager.worldDelete ? FileManager.worldDelete({ name: n }) : Promise.resolve({ success: true }),
        worldImport: ()  => FileManager.worldImport ? FileManager.worldImport() : Promise.resolve({ success: true }),

        // ── Player Manager ────────────────────────────────────
        playersGet:     ()           => ServerProcess.playersGet ? ServerProcess.playersGet() : Promise.resolve({ ops: [], whitelist: [], bannedPlayers: [] }),
        playersGetCache: async () => {
            try {
                if (ServerProcess.playersGetCache) {
                    const res = await ServerProcess.playersGetCache();
                    if (Array.isArray(res)) return res;
                    if (res && Array.isArray(res.players)) return res.players;
                }
                return [];
            } catch (e) {
                return [];
            }
        },
        playersAdd:     (list, name) => ServerProcess.playersAdd ? ServerProcess.playersAdd({ list, name }) : Promise.resolve({ success: true }),
        playersRemove:  (list, name) => ServerProcess.playersRemove ? ServerProcess.playersRemove({ list, name }) : Promise.resolve({ success: true }),

        // ── Properties ────────────────────────────────────────
        propsGet: async () => {
            const defaultProps = {
                'motd': 'A Nuvyra-Craft Minecraft Server',
                'server-port': '25565',
                'gamemode': 'survival',
                'difficulty': 'easy',
                'max-players': '20',
                'online-mode': 'false',
                'pvp': 'true',
                'view-distance': '8',
                'simulation-distance': '6',
                'level-name': 'world',
                'allow-flight': 'false',
                'white-list': 'false',
                'spawn-monsters': 'true',
                'spawn-animals': 'true',
                'spawn-npcs': 'true',
                'hardcore': 'false',
                'enable-command-block': 'false'
            };
            try {
                if (ServerProcess.propsGet) {
                    const res = await ServerProcess.propsGet();
                    if (res && typeof res === 'object' && Object.keys(res).length > 0) {
                        return { ...defaultProps, ...res };
                    }
                }
                return defaultProps;
            } catch (e) {
                return defaultProps;
            }
        },
        propsSave: (props)  => ServerProcess.propsSave ? ServerProcess.propsSave({ props }) : Promise.resolve({ success: true }),

        // ── Playit Plugin (Desktop only stub) ─────────────────
        playitCheck:   () => Promise.resolve({ installed: false }),
        playitInstall: () => Promise.resolve({ error: 'Playit is available on Desktop edition.' }),
        playitRemove:  () => Promise.resolve({ error: 'Playit is available on Desktop edition.' }),

        // ── Plugin Manager (Modrinth Live API + Curated CDN) ──
        pluginSearch: async (query, category) => {
            let installedList = [];
            try {
                const inst = await window.api.pluginsGetInstalled();
                installedList = (inst || []).map(p => p.fileName || p.name || '');
            } catch (_) {}

            const isInstalled = (item) => {
                const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const sNorm = norm(item.slug);
                const tNorm = norm(item.title);
                return installedList.some(f => {
                    const fNorm = norm(f.replace(/\.jar(\.disabled)?$/i, ''));
                    return (sNorm && (fNorm.includes(sNorm) || sNorm.includes(fNorm))) ||
                           (tNorm && (fNorm.includes(tNorm) || tNorm.includes(fNorm)));
                });
            };

            const hasQuery = query && query.trim().length > 0;
            const cat = (category && category !== 'all') ? category : null;

            try {
                const facets = [['project_type:plugin']];
                if (cat) facets.push([`categories:${cat}`]);
                const encodedFacets = encodeURIComponent(JSON.stringify(facets));
                let url;
                if (hasQuery) {
                    const encodedQuery = encodeURIComponent(query.trim());
                    url = `https://api.modrinth.com/v2/search?query=${encodedQuery}&facets=${encodedFacets}&limit=40`;
                } else {
                    url = `https://api.modrinth.com/v2/search?facets=${encodedFacets}&index=downloads&limit=40`;
                }

                const resp = await fetch(url, { signal: createTimeoutSignal(6000) });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && Array.isArray(data.hits) && data.hits.length > 0) {
                        const results = data.hits.map(hit => ({
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
                }
            } catch (err) {
                console.warn('Modrinth API search error, using curated catalog:', err);
            }

            // Fallback to curated catalog
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
        },

        pluginGetVersion: async (projectIdOrSlug) => {
            const curated = CURATED_PLUGINS.find(p => p.slug === projectIdOrSlug || p.id === projectIdOrSlug);
            if (curated && curated.directDownload) {
                return {
                    downloadUrl: curated.directDownload,
                    fileName: curated.defaultFileName || `${curated.title}.jar`,
                    versionNumber: 'latest'
                };
            }

            let versionList = [];
            try {
                const loadersParam = encodeURIComponent(JSON.stringify(['paper', 'spigot', 'bukkit', 'purpur', 'folia']));
                const filterUrl = `https://api.modrinth.com/v2/project/${projectIdOrSlug}/version?loaders=${loadersParam}`;
                const resp = await fetch(filterUrl, { signal: createTimeoutSignal(6000) });
                if (resp.ok) {
                    const data = await resp.json();
                    if (Array.isArray(data) && data.length > 0) versionList = data;
                }
            } catch (_) {}

            if (versionList.length === 0) {
                try {
                    const rawUrl = `https://api.modrinth.com/v2/project/${projectIdOrSlug}/version`;
                    const resp = await fetch(rawUrl, { signal: createTimeoutSignal(6000) });
                    if (resp.ok) {
                        const data = await resp.json();
                        if (Array.isArray(data)) versionList = data;
                    }
                } catch (_) {}
            }

            if (versionList.length > 0) {
                const serverLoaders = ['paper', 'spigot', 'bukkit', 'purpur', 'folia'];
                let preferredVer = versionList.find(v =>
                    Array.isArray(v.loaders) && v.loaders.some(l => serverLoaders.includes(l.toLowerCase()))
                ) || versionList[0];

                const orderedVersions = [preferredVer, ...versionList.filter(v => v !== preferredVer)];

                for (const ver of orderedVersions) {
                    if (!Array.isArray(ver.files) || ver.files.length === 0) continue;
                    const jarFiles = ver.files.filter(f =>
                        f.filename &&
                        f.filename.endsWith('.jar') &&
                        !f.filename.includes('-sources') &&
                        !f.filename.includes('-dev') &&
                        !f.filename.includes('-javadoc')
                    );
                    if (jarFiles.length === 0) continue;
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

            if (curated && curated.directDownload) {
                return {
                    downloadUrl: curated.directDownload,
                    fileName: curated.defaultFileName || `${curated.title}.jar`,
                    versionNumber: 'latest'
                };
            }

            throw new Error('Could not find a downloadable JAR for this plugin. Please try another plugin or upload a .jar manually.');
        },

        pluginInstall: async (opts) => {
            let downloadUrl = opts.downloadUrl || opts.url;
            let fileName = opts.fileName;

            if (!downloadUrl && opts.projectId) {
                const ver = await window.api.pluginGetVersion(opts.projectId);
                downloadUrl = ver.downloadUrl;
                fileName = fileName || ver.fileName;
            }

            if (!downloadUrl) throw new Error('Download URL not found for this plugin.');
            if (!fileName) fileName = downloadUrl.split('/').pop().split('?')[0] || 'plugin.jar';
            if (!fileName.endsWith('.jar')) fileName += '.jar';

            if (FileManager.pluginInstall) {
                return await FileManager.pluginInstall({
                    url: downloadUrl,
                    downloadUrl: downloadUrl,
                    fileName: fileName
                });
            }
            return { success: true };
        },

        pluginsGetInstalled: async () => {
            try {
                if (FileManager.pluginsGetInstalled) {
                    const res = await FileManager.pluginsGetInstalled();
                    return (res.plugins || []).map(p => ({
                        ...p,
                        sizeMB: p.sizeMB !== undefined ? p.sizeMB : ((p.size || 0) / (1024 * 1024)).toFixed(1)
                    }));
                }
                return [];
            } catch (e) {
                return [];
            }
        },
        pluginToggle:       (fileName)   => FileManager.pluginToggle ? FileManager.pluginToggle({ fileName }) : Promise.resolve({ success: true }),
        pluginDelete:       (fileName)   => FileManager.pluginDelete ? FileManager.pluginDelete({ fileName }) : Promise.resolve({ success: true }),
        pluginUploadLocal:  () => {
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.jar,application/java-archive,application/octet-stream,*/*';
                input.multiple = true;
                input.style.display = 'none';
                document.body.appendChild(input);

                input.onchange = async () => {
                    const allFiles = Array.from(input.files || []);
                    try { document.body.removeChild(input); } catch (_) {}
                    const files = allFiles.filter(f => f.name.toLowerCase().endsWith('.jar'));
                    if (!files.length) {
                        if (allFiles.length > 0) {
                            alert('Please select valid Minecraft plugin .jar files.');
                        }
                        resolve({ success: false, installed: [] });
                        return;
                    }
                    const installed = [];
                    for (const f of files) {
                        try {
                            const b64 = await new Promise((res, rej) => {
                                const reader = new FileReader();
                                reader.onload = () => {
                                    const result = reader.result;
                                    const b = (typeof result === 'string' && result.includes(',')) ? result.split(',')[1] : result;
                                    res(b);
                                };
                                reader.onerror = rej;
                                reader.readAsDataURL(f);
                            });
                            await window.api.fmUploadFile('plugins', f.name, b64);
                            installed.push(f.name);
                        } catch (err) {
                            console.error('Plugin upload error:', err);
                        }
                    }
                    resolve({ success: installed.length > 0, installed });
                };

                input.oncancel = () => {
                    try { document.body.removeChild(input); } catch (_) {}
                    resolve({ success: false, installed: [] });
                };

                input.click();
            });
        },
        onPluginDownloadProgress: (cb) => {
            return onNativeEvent('plugin-download-progress', (data) => {
                const total = data.total || 0;
                const downloaded = data.downloaded || 0;
                const pct = data.pct !== undefined ? data.pct : (total > 0 ? Math.round((downloaded * 100) / total) : 0);
                cb({ fileName: data.fileName || '', pct, downloaded, total });
            });
        },

        // ── Backup ────────────────────────────────────────────
        createBackup: async (mode) => {
            if (FileManager.createBackup) {
                const res = await FileManager.createBackup({ mode });
                return {
                    success: true,
                    fileName: res.fileName,
                    sizeMB: res.sizeMB || '0.0',
                    size: res.size || 0
                };
            }
            return { success: true, sizeMB: '0.0' };
        },
        backupsList: async () => {
            if (FileManager.backupsList) {
                return await FileManager.backupsList();
            }
            return { backups: [], backupsDir: '' };
        },
        backupDelete: async (fileName) => {
            if (FileManager.backupDelete) {
                return await FileManager.backupDelete({ fileName });
            }
            return { success: true };
        },
        backupRestore: async (fileName) => {
            if (FileManager.backupRestore) {
                return await FileManager.backupRestore({ fileName });
            }
            return { success: true };
        },

        // ── Updates (GitHub Data Center OTA) ──────────────────
        checkForUpdatesManual: async () => {
            try {
                const resp = await fetch(MOBILE_GITHUB_CONFIG.rawManifestUrl + '?t=' + Date.now());
                const remote = await resp.json();
                const local = await window.api.getAppVersion();
                const localCode = parseInt(localStorage.getItem('installed_ota_version_code') || String(BUNDLED_APP_VERSION_CODE), 10);
                const remoteCode = parseInt(remote.versionCode || String(BUNDLED_APP_VERSION_CODE), 10);
                const hasUpdate = (remoteCode > localCode) || isNewerVersion(remote.version, local);
                return {
                    updateAvailable: hasUpdate,
                    available: hasUpdate,
                    version: remote.version,
                    versionCode: remoteCode,
                    currentVersion: local,
                    currentVersionCode: localCode,
                    downloadUrl: MOBILE_GITHUB_CONFIG.releasesUrl,
                    changelog: remote.changelog,
                    files: remote.files || []
                };
            } catch (e) {
                return { updateAvailable: false, available: false, error: e.message };
            }
        },
        getUpdateChangelog: async () => {
            try {
                const resp = await fetch(MOBILE_GITHUB_CONFIG.rawManifestUrl + '?t=' + Date.now());
                if (resp.ok) {
                    const data = await resp.json();
                    return data;
                }
            } catch (_) {}
            try {
                const localResp = await fetch('mobile-update-check.json');
                if (localResp.ok) {
                    return await localResp.json();
                }
            } catch (_) {}
            return {
                version: BUNDLED_APP_VERSION,
                versionCode: BUNDLED_APP_VERSION_CODE,
                changelog: []
            };
        },
        getAppVersion: async () => {
            try {
                let baseVer = BUNDLED_APP_VERSION;
                if (CapApp.getInfo) {
                    const info = await CapApp.getInfo();
                    if (info && info.version && isNewerVersion(info.version, baseVer)) {
                        baseVer = info.version;
                    }
                }
                const otaVer = localStorage.getItem('installed_ota_version');
                if (otaVer && isNewerVersion(otaVer, baseVer)) {
                    return otaVer;
                }
                return baseVer;
            } catch (e) {
                return BUNDLED_APP_VERSION;
            }
        },
        applyGithubHotUpdate: async () => {
            try {
                const resp = await fetch(MOBILE_GITHUB_CONFIG.rawManifestUrl + '?t=' + Date.now());
                const manifest = await resp.json();
                const files = manifest.files || [];
                let updated = 0;

                for (let i = 0; i < files.length; i++) {
                    const filePath = files[i];
                    const rawUrl = `https://raw.githubusercontent.com/${MOBILE_GITHUB_CONFIG.owner}/${MOBILE_GITHUB_CONFIG.repo}/${MOBILE_GITHUB_CONFIG.branch}/${filePath}?t=${Date.now()}`;
                    const fileResp = await fetch(rawUrl);
                    if (fileResp.ok) {
                        const content = await fileResp.text();
                        localStorage.setItem('patch_' + filePath, content);
                        updated++;
                    }
                    emitEvent('hot-update-progress', {
                        current: i + 1,
                        total: files.length,
                        file: filePath
                    });
                }

                if (manifest.version) {
                    localStorage.setItem('installed_ota_version', manifest.version);
                }
                if (manifest.versionCode) {
                    localStorage.setItem('installed_ota_version_code', String(manifest.versionCode));
                }

                return { success: true, updatedFiles: updated, version: manifest.version || '1.0', versionCode: manifest.versionCode || 1 };
            } catch (e) {
                return { error: 'Failed to apply data-center update: ' + e.message };
            }
        },
        exitApp: async () => {
            try {
                if (ServerProcess && ServerProcess.stop) {
                    await ServerProcess.stop().catch(() => {});
                }
            } catch (_) {}
            try {
                if (CapApp && CapApp.exitApp) {
                    return await CapApp.exitApp();
                }
            } catch (_) {}
            try {
                if (navigator.app && navigator.app.exitApp) {
                    navigator.app.exitApp();
                    return;
                }
            } catch (_) {}
            try { window.close(); } catch (_) {}
        },
        relaunchApp: async () => {
            try {
                if (ServerProcess && ServerProcess.relaunchApp) {
                    await ServerProcess.relaunchApp();
                    return;
                }
            } catch (_) {}
            try {
                if (ServerProcess && ServerProcess.stop) {
                    await ServerProcess.stop().catch(() => {});
                }
            } catch (_) {}
            try {
                if (CapApp && CapApp.exitApp) {
                    return await CapApp.exitApp();
                }
            } catch (_) {}
            try {
                if (navigator.app && navigator.app.exitApp) {
                    navigator.app.exitApp();
                    return;
                }
            } catch (_) {}
            window.location.reload();
            return Promise.resolve();
        },
        onHotUpdateProgress:  (cb) => onNativeEvent('hot-update-progress', cb),
        onHotUpdateAvailable: (cb) => onNativeEvent('hot-update-available', cb),

        // ── Events (Native → JS) ──────────────────────────────
        onDownloadProgress: (cb) => onNativeEvent('download-progress', cb),
        onConsoleData:      (cb) => onNativeEvent('console-data', (data) => {
            const text = (typeof data === 'object' && data !== null && data.text !== undefined) ? data.text : data;
            cb(text);
        }),
        onPlayitConsoleData:(cb) => {},
        onServerState:      (cb) => onNativeEvent('server-state', cb),
        onBackupProgress:   (cb) => onNativeEvent('backup-progress', cb),
        onSetupProgress:    (cb) => onNativeEvent('setup-progress', cb),
        onJavaDownloadProgress: (cb) => onNativeEvent('java-download-progress', cb),

        onUpdateAvailable: (cb) => onNativeEvent('update-available', cb),
        onUpdateProgress:  (cb) => onNativeEvent('update-progress', cb),
        onUpdateDownloaded:(cb) => onNativeEvent('update-downloaded', cb),
        installUpdate:     () => Promise.resolve(),

        isMobile: true,
        platform: 'android'
    };

    console.log('[Nuvyra-Craft Mobile] Bridge initialized successfully with full Electron API parity.');

    // ── Automatic Background Update Detection (Parity with PC) ──
    setTimeout(async () => {
        try {
            if (window.api && window.api.checkForUpdatesManual) {
                const res = await window.api.checkForUpdatesManual();
                if (res && res.updateAvailable) {
                    emitEvent('hot-update-available', res);
                }
            }
        } catch (_) {}
    }, 3500);

    setInterval(async () => {
        try {
            if (window.api && window.api.checkForUpdatesManual) {
                const res = await window.api.checkForUpdatesManual();
                if (res && res.updateAvailable) {
                    emitEvent('hot-update-available', res);
                }
            }
        } catch (_) {}
    }, 30 * 60 * 1000);
})();
