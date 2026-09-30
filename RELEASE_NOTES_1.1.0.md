# Nuvyra-Craft 1.1.0

Nuvyra-Craft is a NuvyraHost-branded Minecraft server manager for Windows and Android.

## Server software selection

Choose the server software first, then choose a compatible version:

- **Paper** — optimized plugin server
- **Vanilla** — official Mojang server
- **Fabric** — lightweight mod-loader server
- **Forge** — mod-loader server with installer-based setup on Windows
- **Spigot** — plugin server; Windows uses the official BuildTools workflow
- **Velocity** — proxy/network server catalog

The selected software and version are stored in `.mcmeta.json`, so launch, reinstall, and version-change actions keep the correct server core.

## Emergency Kill

The console now has a **Kill** button on both platforms. It force-terminates the server process when the normal Stop command is unavailable. Because it is intentionally forceful, unsaved world data may be lost. Android also exposes **Kill** directly in the persistent background-server notification.

## Notes

- Downloads are resolved from official Mojang, Fabric, PaperMC, Forge, Spigot BuildTools, or project distribution endpoints where supported.
- Windows Forge and Spigot setup can take substantially longer than a normal JAR download.
- The installer is unsigned; Windows may show the normal SmartScreen warning for unsigned community builds.
