# 🎮 Nuvyra-Craft

<div align="center">

<img src="assets/logo.png" alt="Nuvyra-Craft Logo" width="128" height="128" style="border-radius: 24px; box-shadow: 0 8px 32px rgba(34, 197, 94, 0.25);" />

### The Ultimate Minecraft Paper Server Manager for Windows & Android

[![Release PC](https://img.shields.io/badge/PC_Release-v1.0.3-22c55e?style=for-the-badge&logo=github)](https://github.com/NuvyraHost/Nuvyra-Craft/releases)
[![Mobile Edition](https://img.shields.io/badge/Mobile_Architecture-Android_6+-00E5FF?style=for-the-badge&logo=android&logoColor=white)](mobile/)
[![Data Center](https://img.shields.io/badge/OTA_Update_Center-Active-9333EA?style=for-the-badge&logo=cloud&logoColor=white)](mobile/mobile-update-check.json)
[![Minecraft](https://img.shields.io/badge/PaperMC-All_Versions-E67E22?style=for-the-badge&logo=minecraft&logoColor=white)](https://papermc.io/)
[![Java](https://img.shields.io/badge/Java-25%20%7C%2021%20%7C%2017-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)](https://adoptium.net/)
[![License](https://img.shields.io/badge/License-MIT_Attribution-blue.svg?style=for-the-badge)](LICENSE)

A powerful, all-in-one server application designed to create, configure, manage, and scale high-performance Minecraft Paper servers with zero terminal complexity — with PC Desktop and private Android Mobile editions synchronized via GitHub Data Center.

[⬇️ Download PC (.exe)](https://github.com/NuvyraHost/Nuvyra-Craft/releases) • [✨ Features](#-features) • [📱 Mobile Edition](#-nuvyra-craft-mobile-android) • [💻 Getting Started](#-getting-started) • [⚙️ Requirements](#️-system-requirements)

</div>

---

## ✨ Features

### ⚡ Instant Server Deployment
- **1-Click Creation** — Select your desired PaperMC version and launch immediately.
- **Support for Modern Updates** — Full compatibility with the latest releases, including **Minecraft 26.2 (Chaos Cubed)** and **Minecraft 26.1 (Tiny Takeover)**, as well as classic stable versions.
- **Automatic Configuration** — Handles EULA agreements, directory structures, and default server properties automatically.

### 🧩 Built-in Plugin Marketplace
- **Global Discovery** — Browse and search thousands of Bukkit, Spigot, and Paper plugins directly within the application via the integrated Modrinth store and curated catalog.
- **1-Click Installation** — Direct downloads for essential plugins like **ViaVersion**, **ViaBackwards**, **LuckPerms**, **EssentialsX**, **Geyser**, **Floodgate**, and **WorldEdit**.
- **Plugin Management** — Enable or disable plugins on the fly using intuitive toggle switches without deleting configurations, or upload custom local `.jar` files with ease.

### ☕ Smart Multi-Version Java Manager
- **Zero Configuration Required** — Nuvyra-Craft automatically detects and provisions the optimal Java runtime for your server version:
  - **Java 25** — Tailored for Minecraft 26.x
  - **Java 21** — Tailored for Minecraft 1.20.5 – 1.21.x
  - **Java 17** — Tailored for Minecraft 1.18 – 1.20.4
- **Manual Control** — Switch between automatic detection and custom runtime versions anytime in the Server Settings panel.

### 💻 Real-Time Interactive Console
- **Live Output Stream** — Monitor your server activity in real time with high-performance log rendering.
- **Command Dispatch** — Run operator commands directly with dedicated command history and execution shortcuts.
- **Process Controls** — Safe Start, Stop, and Restart controls designed to prevent world data corruption.

### 📂 Integrated File Manager
- **Visual File Browser** — Navigate your server files with full directory tree support.
- **In-App Editor** — View and edit `.yml`, `.json`, `.properties`, and `.txt` configuration files directly.
- **Binary JAR Protection** — Built-in protection prevents accidental opening of large binary archives, ensuring the interface remains smooth and responsive.

### 🌍 World & Player Controls
- **World Management** — Track world disk usage, delete inactive worlds, or import custom worlds directly from `.zip` archives.
- **Player Administration** — Manage player lists with one-click OP, Kick, Ban, and IP-ban capabilities, complete with player avatar previews.
- **Visual Properties Editor** — Configure server settings like game mode, difficulty, max players, PvP, and view distance through modern dropdowns and toggles.

### 💾 Automated Backups & System Stats
- **One-Click Backups** — Generate full-server or world-only archives with real-time progress indicators.
- **Resource Monitoring** — Keep track of real-time CPU usage and RAM allocation to ensure smooth server performance.
- **Glassmorphism Dark Theme** — Modern, GPU-accelerated interface built with smooth micro-animations.

---

## 💻 Getting Started

1. **Download**: Grab the latest installer (`Nuvyra-Craft Setup 1.0.0.exe`) from the [Official Releases](https://github.com/NuvyraHost/Nuvyra-Craft/releases).
2. **Install**: Run the installer and follow the quick on-screen setup.
3. **Launch & Create**:
   - Select an install directory on your computer.
   - Choose your server name, RAM, CPU cores, and Minecraft version.
   - Click **Create & Launch Server**!

---

---

## 📱 Nuvyra-Craft Mobile (Android)

Run a full Minecraft Java Server in your pocket! **Nuvyra-Craft Mobile** brings the complete power of desktop server management to Android devices.

### 🌟 Mobile Highlights:
- **Direct ARM64 JRE Execution** — Runs real Minecraft Paper Java servers natively on your phone using portable Linux aarch64 runtime.
- **Background Persistence** — Uses an integrated Foreground Service & CPU WakeLock so the server keeps running smoothly even when screen is locked or switching apps.
- **Touch-Optimized UI** — Bottom navigation bar, adaptive layout, virtual keyboard optimization, and tap-friendly controls.
- **Independent Updates** — PC and Mobile have dedicated, decoupled release channels (`update-check.json` for PC and `mobile/mobile-update-check.json` for Android).

---

## ⚙️ System Requirements

### 💻 Windows PC
| Component | Minimum | Recommended |
| :--- | :--- | :--- |
| **Operating System** | Windows 10 (64-bit) | Windows 11 (64-bit) |
| **Processor** | Dual-core 2.0 GHz+ | Quad-core 3.0 GHz+ |
| **Memory (RAM)** | 4 GB | 8 GB or more |
| **Storage** | 2 GB free disk space | SSD with 10 GB+ free space |
| **Network** | Broadband internet connection | High-speed fiber connection |

### 📱 Android Mobile
| Component | Minimum | Recommended |
| :--- | :--- | :--- |
| **Operating System** | Android 6.0 (Marshmallow, API 23) | Android 10+ (64-bit) |
| **Architecture** | ARM64 (aarch64) | ARM64 (aarch64) |
| **Memory (RAM)** | 2 GB available RAM | 4 GB+ RAM |
| **Storage** | 1.5 GB free storage | 4 GB+ free storage |
| **Battery Setting** | Unrestricted / Allow Background | Don't Optimize / Keep Awake |

---

## 📄 License & Credits

**Nuvyra-Craft** is a NuvyraHost-branded fork of the original Jtg-Craft project by **[Jishnu Tech](https://github.com/JishnuTheGamer)**.

This software is released under the **[MIT License with Mandatory Attribution](LICENSE)**.

> [!IMPORTANT]
> **Attribution Requirement:** Anyone utilizing, modifying, embedding, or redistributing this software or any of its individual components (including UI designs, server managers, Plugin Manager, or Java runtime systems) must provide prominent, visible credit to **Jishnu Tech** with a link back to this repository:
> `https://github.com/NuvyraHost/Nuvyra-Craft`

---

<div align="center">

Nuvyra-Craft is maintained by **NuvyraHost**. Original attribution: **[Jishnu Tech](https://github.com/JishnuTheGamer)**

</div>
