package com.nuvyra.craft.mobile;

import android.content.Context;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

@CapacitorPlugin(name = "FileManager")
public class FileManagerPlugin extends Plugin {

    private static final String PROTECTED_FILE = ".mcmeta.json";

    public File getDefaultServerDir() {
        return ServerProcessPlugin.getActiveServerDir(getContext());
    }

    private File resolveSafePath(String relPath) {
        File base = getDefaultServerDir();
        if (relPath == null || relPath.trim().isEmpty() || relPath.equals(".") || relPath.equals("/")) {
            return base;
        }
        File target = new File(base, relPath);
        // Path traversal guard
        try {
            if (!target.getCanonicalPath().startsWith(base.getCanonicalPath())) {
                return base;
            }
        } catch (Exception e) {
            return base;
        }
        return target;
    }

    @PluginMethod
    public void getServerDir(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("path", getDefaultServerDir().getAbsolutePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void checkStoragePermission(PluginCall call) {
        JSObject ret = new JSObject();
        boolean hasPermission = false;
        boolean isAllFiles = false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            isAllFiles = Environment.isExternalStorageManager();
            hasPermission = isAllFiles;
        } else {
            int read = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE);
            int write = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE);
            hasPermission = (read == PackageManager.PERMISSION_GRANTED && write == PackageManager.PERMISSION_GRANTED);
        }

        ret.put("granted", hasPermission);
        ret.put("isAllFilesAccess", isAllFiles);
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestStoragePermission(PluginCall call) {
        Activity act = getActivity();
        if (act == null) {
            call.reject("Activity unavailable");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                act.startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("openedSettings", true);
                call.resolve(ret);
            } catch (Exception e) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                    act.startActivity(intent);
                    JSObject ret = new JSObject();
                    ret.put("openedSettings", true);
                    call.resolve(ret);
                } catch (Exception e2) {
                    call.reject("Could not open All Files Access settings: " + e2.getMessage());
                }
            }
        } else {
            ActivityCompat.requestPermissions(act, new String[]{
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            }, 101);
            JSObject ret = new JSObject();
            ret.put("requested", true);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void getDefaultStoragePaths(PluginCall call) {
        JSObject ret = new JSObject();
        File extPublic = Environment.getExternalStorageDirectory(); // /storage/emulated/0
        File nuvyraDefault = new File(extPublic, "NuvyraCraft/server");
        File downloadDefault = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "NuvyraCraft/server");
        File appInternal = new File(getContext().getFilesDir(), "servers/default");
        File appExternal = new File(getContext().getExternalFilesDir(null), "servers/default");

        ret.put("phoneStorage", nuvyraDefault.getAbsolutePath());
        ret.put("downloads", downloadDefault.getAbsolutePath());
        ret.put("appStorage", appInternal.getAbsolutePath());
        ret.put("appExternal", appExternal != null ? appExternal.getAbsolutePath() : appInternal.getAbsolutePath());

        boolean phoneWritable = false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                phoneWritable = Environment.isExternalStorageManager();
            } else {
                phoneWritable = extPublic.canWrite();
            }
        } catch (Throwable ignored) {}
        ret.put("phoneWritable", phoneWritable);

        call.resolve(ret);
    }

    @PluginMethod
    public void pickDirectory(PluginCall call) {
        String customDir = call.getString("dir", null);
        if (customDir != null && !customDir.trim().isEmpty()) {
            ServerProcessPlugin.setActiveServerDir(getContext(), customDir);
        }
        JSObject ret = new JSObject();
        ret.put("path", getDefaultServerDir().getAbsolutePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void checkExistingServer(PluginCall call) {
        String targetPath = call.getString("dir", null);
        File dir = (targetPath != null && !targetPath.trim().isEmpty()) ? new File(targetPath.trim()) : getDefaultServerDir();
        boolean exists = new File(dir, "server.properties").exists() || new File(dir, "paper.jar").exists() || new File(dir, ".mcmeta.json").exists();
        if (exists && targetPath != null && !targetPath.trim().isEmpty()) {
            ServerProcessPlugin.setActiveServerDir(getContext(), targetPath);
        }
        JSObject ret = new JSObject();
        ret.put("exists", exists);

        if (exists) {
            // Read metadata for server name and version
            File metaFile = new File(dir, ".mcmeta.json");
            String serverName = "Nuvyra Server";
            String serverVersion = "1.20.4";
            if (metaFile.exists()) {
                try (BufferedReader br = new BufferedReader(new FileReader(metaFile))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                    org.json.JSONObject metaJson = new org.json.JSONObject(sb.toString());
                    if (metaJson.has("name")) serverName = metaJson.getString("name");
                    if (metaJson.has("version")) serverVersion = metaJson.getString("version");
                } catch (Exception ignored) {}
            }
            ret.put("name", serverName);
            JSObject meta = new JSObject();
            meta.put("name", serverName);
            meta.put("version", serverVersion);
            ret.put("meta", meta);
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void uploadFile(PluginCall call) {
        try {
            String rel = call.getString("path", "");
            String name = call.getString("name", "");
            String base64Data = call.getString("base64", "");

            if (name == null || name.trim().isEmpty() || base64Data == null) {
                call.reject("Missing file name or data");
                return;
            }

            File targetDir = resolveSafePath(rel);
            if (!targetDir.exists()) targetDir.mkdirs();

            File outFile = new File(targetDir, name);
            byte[] bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                fos.write(bytes);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("name", name);
            ret.put("size", outFile.length());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Upload failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        try {
            String rel = call.getString("path", "");
            File target = resolveSafePath(rel);

            if (!target.exists() || !target.isDirectory()) {
                call.reject("Directory not found: " + rel);
                return;
            }

            File[] files = target.listFiles();
            JSArray array = new JSArray();
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US);

            if (files != null) {
                // Sort directories first, then alphabetical
                Arrays.sort(files, (a, b) -> {
                    if (a.isDirectory() && !b.isDirectory()) return -1;
                    if (!a.isDirectory() && b.isDirectory()) return 1;
                    return a.getName().compareToIgnoreCase(b.getName());
                });

                for (File f : files) {
                    JSObject item = new JSObject();
                    item.put("name", f.getName());
                    item.put("isDirectory", f.isDirectory());
                    item.put("isDir", f.isDirectory());
                    String relPath = (rel == null || rel.isEmpty()) ? f.getName() : (rel.endsWith("/") ? rel + f.getName() : rel + "/" + f.getName());
                    item.put("rel", relPath);
                    item.put("size", f.isDirectory() ? 0 : f.length());
                    item.put("modified", sdf.format(new Date(f.lastModified())));
                    // System protection flag: .mcmeta.json is protected from deletion/rename
                    item.put("isProtected", f.getName().equalsIgnoreCase(PROTECTED_FILE));
                    array.put(item);
                }
            }

            JSObject ret = new JSObject();
            ret.put("files", array);
            ret.put("currentPath", rel);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to list files: " + e.getMessage());
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            String rel = call.getString("path", "");
            File f = resolveSafePath(rel);
            if (!f.exists() || f.isDirectory()) {
                call.reject("File not found");
                return;
            }

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new FileReader(f))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
            }

            JSObject ret = new JSObject();
            ret.put("content", sb.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        try {
            String rel = call.getString("path", "");
            String data = call.getString("data", null);
            if (data == null) {
                data = call.getString("content", "");
            }
            boolean isBase64 = call.getBoolean("base64", false);
            File f = resolveSafePath(rel);

            File parent = f.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();

            if (isBase64 && data != null && !data.isEmpty()) {
                byte[] bytes = android.util.Base64.decode(data, android.util.Base64.DEFAULT);
                try (FileOutputStream fos = new FileOutputStream(f)) {
                    fos.write(bytes);
                }
            } else {
                try (OutputStreamWriter writer = new OutputStreamWriter(new FileOutputStream(f), java.nio.charset.StandardCharsets.UTF_8)) {
                    writer.write(data != null ? data : "");
                }
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to write file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        try {
            String rel = call.getString("path", "");
            File f = resolveSafePath(rel);

            // Block deletion of protected system file
            if (f.getName().equalsIgnoreCase(PROTECTED_FILE)) {
                call.reject("Cannot delete system metadata file: " + PROTECTED_FILE);
                return;
            }

            deleteRecursive(f);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to delete file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void deleteBatch(PluginCall call) {
        try {
            JSArray paths = call.getArray("paths");
            int deleted = 0;
            if (paths != null) {
                for (int i = 0; i < paths.length(); i++) {
                    String p = paths.getString(i);
                    File f = resolveSafePath(p);
                    if (!f.getName().equalsIgnoreCase(PROTECTED_FILE)) {
                        deleteRecursive(f);
                        deleted++;
                    }
                }
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("deletedCount", deleted);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to batch delete: " + e.getMessage());
        }
    }

    @PluginMethod
    public void rename(PluginCall call) {
        try {
            String rel = call.getString("path", "");
            String newName = call.getString("name", "");
            File src = resolveSafePath(rel);

            // Block renaming protected system file
            if (src.getName().equalsIgnoreCase(PROTECTED_FILE) || newName.equalsIgnoreCase(PROTECTED_FILE)) {
                call.reject("Cannot rename protected system metadata file");
                return;
            }

            File dest = new File(src.getParentFile(), newName);
            boolean ok = src.renameTo(dest);
            JSObject ret = new JSObject();
            ret.put("success", ok);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to rename file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void extract(PluginCall call) {
        new Thread(() -> {
            try {
                String rel = call.getString("path", "");
                String name = call.getString("name", "");
                File zipFile = resolveSafePath(rel != null && !rel.isEmpty() ? rel + "/" + name : name);
                File targetDir = zipFile.getParentFile();

                try (ZipInputStream zis = new ZipInputStream(new FileInputStream(zipFile))) {
                    ZipEntry entry;
                    byte[] buffer = new byte[8192];
                    while ((entry = zis.getNextEntry()) != null) {
                        File dest = new File(targetDir, entry.getName());
                        if (entry.isDirectory()) {
                            dest.mkdirs();
                        } else {
                            File parent = dest.getParentFile();
                            if (parent != null) parent.mkdirs();
                            try (FileOutputStream fos = new FileOutputStream(dest)) {
                                int len;
                                while ((len = zis.read(buffer)) > 0) {
                                    fos.write(buffer, 0, len);
                                }
                            }
                        }
                        zis.closeEntry();
                    }
                }
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Extraction failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void createBackup(PluginCall call) {
        new Thread(() -> {
            try {
                String mode = call.getString("mode", "full");
                File base = getDefaultServerDir();
                File backupsDir = new File(base, "backups");
                if (!backupsDir.exists()) backupsDir.mkdirs();

                SimpleDateFormat sdf = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US);
                String timestamp = sdf.format(new Date());
                String zipName = (mode.equals("worlds") ? "worlds_backup_" : "full_backup_") + timestamp + ".zip";
                File zipFile = new File(backupsDir, zipName);

                try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(zipFile))) {
                    if (mode.equals("worlds")) {
                        zipDir(new File(base, "world"), "world", zos);
                        zipDir(new File(base, "world_nether"), "world_nether", zos);
                        zipDir(new File(base, "world_the_end"), "world_the_end", zos);
                    } else {
                        File[] items = base.listFiles();
                        if (items != null) {
                            for (File f : items) {
                                if (!f.getName().equals("backups")) {
                                    if (f.isDirectory()) zipDir(f, f.getName(), zos);
                                    else zipFile(f, f.getName(), zos);
                                }
                            }
                        }
                    }
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("fileName", zipName);
                ret.put("size", zipFile.length());
                ret.put("sizeMB", String.format(Locale.US, "%.1f", zipFile.length() / (1024.0 * 1024.0)));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to create backup: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void backupsList(PluginCall call) {
        File base = getDefaultServerDir();
        File backupsDir = new File(base, "backups");
        if (!backupsDir.exists()) backupsDir.mkdirs();

        JSArray arr = new JSArray();
        File[] files = backupsDir.listFiles((dir, name) -> name.toLowerCase().endsWith(".zip"));
        if (files != null) {
            Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
            SimpleDateFormat sdf = new SimpleDateFormat("MMM dd, yyyy HH:mm", Locale.US);
            for (File f : files) {
                JSObject b = new JSObject();
                b.put("fileName", f.getName());
                b.put("size", f.length());
                b.put("sizeMB", String.format(Locale.US, "%.1f", f.length() / (1024.0 * 1024.0)));
                b.put("lastModified", f.lastModified());
                b.put("dateStr", sdf.format(new Date(f.lastModified())));
                b.put("type", f.getName().startsWith("worlds_") ? "worlds" : "full");
                arr.put(b);
            }
        }
        JSObject ret = new JSObject();
        ret.put("backups", arr);
        ret.put("backupsDir", backupsDir.getAbsolutePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void backupDelete(PluginCall call) {
        String fileName = call.getString("fileName", "");
        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("Missing backup file name");
            return;
        }
        File base = getDefaultServerDir();
        File backupFile = new File(new File(base, "backups"), new File(fileName).getName());
        boolean ok = backupFile.exists() && backupFile.delete();
        JSObject ret = new JSObject();
        ret.put("success", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void backupRestore(PluginCall call) {
        String fileName = call.getString("fileName", "");
        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("Missing backup file name");
            return;
        }
        new Thread(() -> {
            try {
                File base = getDefaultServerDir();
                File backupFile = new File(new File(base, "backups"), new File(fileName).getName());
                if (!backupFile.exists()) {
                    call.reject("Backup file not found: " + fileName);
                    return;
                }

                // Extract backup to server root
                byte[] buf = new byte[16384];
                try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(backupFile)))) {
                    ZipEntry entry;
                    while ((entry = zis.getNextEntry()) != null) {
                        File dest = new File(base, entry.getName());
                        if (entry.isDirectory()) {
                            dest.mkdirs();
                        } else {
                            dest.getParentFile().mkdirs();
                            try (FileOutputStream fos = new FileOutputStream(dest)) {
                                int len;
                                while ((len = zis.read(buf)) > 0) {
                                    fos.write(buf, 0, len);
                                }
                            }
                        }
                        zis.closeEntry();
                    }
                }
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("fileName", fileName);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Restore failed: " + e.getMessage());
            }
        }).start();
    }

    // ── Plugin Manager (Modrinth CDN & Curated) ───────────────
    @PluginMethod
    public void pluginInstall(PluginCall call) {
        new Thread(() -> {
            File tmpJar = null;
            try {
                String downloadUrl = call.getString("downloadUrl", "");
                if (downloadUrl == null || downloadUrl.trim().isEmpty()) {
                    downloadUrl = call.getString("url", "");
                }
                if (downloadUrl == null || downloadUrl.trim().isEmpty()) {
                    call.reject("Missing plugin download URL");
                    return;
                }
                downloadUrl = downloadUrl.trim();

                String rawFileName = call.getString("fileName", "plugin.jar");
                if (rawFileName == null || rawFileName.trim().isEmpty()) rawFileName = "plugin.jar";
                String fileName = new File(rawFileName).getName().replaceAll("[\\\\/:*?\"<>|]", "");
                if (!fileName.toLowerCase().endsWith(".jar")) {
                    fileName += ".jar";
                }

                File pluginsDir = new File(getDefaultServerDir(), "plugins");
                if (!pluginsDir.exists()) pluginsDir.mkdirs();

                File targetJar = new File(pluginsDir, fileName);
                tmpJar = new File(pluginsDir, fileName + ".part." + System.currentTimeMillis());

                String currentUrl = downloadUrl;
                HttpURLConnection c = null;
                int redirects = 0;
                long totalBytes = -1;

                while (redirects < 10) {
                    URL u = new URL(currentUrl);
                    c = (HttpURLConnection) u.openConnection();
                    c.setConnectTimeout(25000);
                    c.setReadTimeout(60000);
                    c.setInstanceFollowRedirects(false);
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 11; NuvyraCraft Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 NuvyraCraft/1.0");
                    c.setRequestProperty("Accept", "*/*");
                    c.setRequestProperty("Accept-Encoding", "identity");

                    int responseCode = c.getResponseCode();

                    if (responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                        responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                        responseCode == HttpURLConnection.HTTP_SEE_OTHER ||
                        responseCode == 307 || responseCode == 308) {
                        
                        String location = c.getHeaderField("Location");
                        c.disconnect();
                        if (location == null || location.trim().isEmpty()) {
                            throw new IOException("Redirect status " + responseCode + " but Location header was missing");
                        }
                        URL nextUrl = new URL(u, location.trim());
                        currentUrl = nextUrl.toExternalForm();
                        redirects++;
                        continue;
                    }

                    if (responseCode < 200 || responseCode >= 300) {
                        c.disconnect();
                        throw new IOException("Server returned HTTP " + responseCode + " (" + c.getResponseMessage() + ")");
                    }

                    totalBytes = c.getContentLengthLong();
                    break;
                }

                if (c == null) {
                    throw new IOException("Too many redirects attempting to download " + fileName);
                }

                try (InputStream in = new BufferedInputStream(c.getInputStream());
                     FileOutputStream out = new FileOutputStream(tmpJar)) {
                    byte[] buf = new byte[16384];
                    int n;
                    long downloaded = 0;
                    long lastNotify = 0;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        downloaded += n;
                        long now = System.currentTimeMillis();
                        if (now - lastNotify > 200) {
                            lastNotify = now;
                            JSObject prog = new JSObject();
                            prog.put("fileName", fileName);
                            prog.put("downloaded", downloaded);
                            prog.put("total", totalBytes);
                            int pct = totalBytes > 0 ? (int) ((downloaded * 100) / totalBytes) : 0;
                            prog.put("pct", pct);
                            notifyListeners("plugin-download-progress", prog);
                        }
                    }
                    out.flush();
                } finally {
                    try { c.disconnect(); } catch (Throwable ignored) {}
                }

                if (!tmpJar.exists() || tmpJar.length() == 0) {
                    if (tmpJar.exists()) tmpJar.delete();
                    throw new IOException("Downloaded plugin file was empty (0 bytes).");
                }

                if (targetJar.exists()) {
                    targetJar.delete();
                }
                if (!tmpJar.renameTo(targetJar)) {
                    copyFile(tmpJar, targetJar);
                    tmpJar.delete();
                }

                try {
                    ServerProcessPlugin.patchPlayitJarIfNeeded(targetJar);
                } catch (Throwable ignored) {}

                JSObject finalProg = new JSObject();
                finalProg.put("fileName", fileName);
                finalProg.put("downloaded", targetJar.length());
                finalProg.put("total", targetJar.length());
                finalProg.put("pct", 100);
                notifyListeners("plugin-download-progress", finalProg);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("fileName", fileName);
                ret.put("size", targetJar.length());
                call.resolve(ret);
            } catch (Exception e) {
                if (tmpJar != null && tmpJar.exists()) {
                    try { tmpJar.delete(); } catch (Throwable ignored) {}
                }
                call.reject("Plugin install failed: " + e.getMessage());
            }
        }).start();
    }

    private void copyFile(File src, File dst) throws IOException {
        try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[16384];
            int len;
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
            }
        }
    }

    @PluginMethod
    public void pluginsGetInstalled(PluginCall call) {
        File pluginsDir = new File(getDefaultServerDir(), "plugins");
        JSArray arr = new JSArray();
        if (pluginsDir.exists() && pluginsDir.isDirectory()) {
            File[] jars = pluginsDir.listFiles((dir, name) -> name.endsWith(".jar") || name.endsWith(".jar.disabled"));
            if (jars != null) {
                Arrays.sort(jars, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));
                for (File j : jars) {
                    JSObject p = new JSObject();
                    p.put("fileName", j.getName());
                    p.put("name", j.getName().replace(".jar.disabled", "").replace(".jar", ""));
                    p.put("enabled", !j.getName().endsWith(".disabled"));
                    p.put("size", j.length());
                    p.put("sizeMB", String.format(Locale.US, "%.1f", j.length() / (1024.0 * 1024.0)));
                    arr.put(p);
                }
            }
        }
        JSObject ret = new JSObject();
        ret.put("plugins", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void pluginToggle(PluginCall call) {
        String fn = call.getString("fileName", "");
        File pluginsDir = new File(getDefaultServerDir(), "plugins");
        File current = new File(pluginsDir, fn);
        if (!current.exists()) {
            call.reject("Plugin not found: " + fn);
            return;
        }
        File target;
        if (fn.endsWith(".disabled")) {
            target = new File(pluginsDir, fn.replace(".disabled", ""));
        } else {
            target = new File(pluginsDir, fn + ".disabled");
        }
        if (target.exists()) target.delete();
        boolean ok = current.renameTo(target);
        JSObject ret = new JSObject();
        ret.put("success", ok);
        ret.put("newFileName", target.getName());
        call.resolve(ret);
    }

    @PluginMethod
    public void pluginDelete(PluginCall call) {
        String fn = call.getString("fileName", "");
        File pluginsDir = new File(getDefaultServerDir(), "plugins");
        File target = new File(pluginsDir, fn);
        boolean ok = true;
        if (target.exists()) {
            ok = target.delete();
        }
        JSObject ret = new JSObject();
        ret.put("success", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void worldList(PluginCall call) {
        File base = getDefaultServerDir();
        String[] defaultWorlds = {"world", "world_nether", "world_the_end"};
        JSArray arr = new JSArray();
        for (String w : defaultWorlds) {
            File wf = new File(base, w);
            if (wf.exists() && wf.isDirectory()) {
                JSObject obj = new JSObject();
                obj.put("name", w);
                long sz = getDirSize(wf);
                obj.put("size", sz);
                obj.put("sizeMB", String.format(Locale.US, "%.1f", sz / (1024.0 * 1024.0)));
                arr.put(obj);
            }
        }
        JSObject ret = new JSObject();
        ret.put("worlds", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void worldDelete(PluginCall call) {
        String name = call.getString("name", "");
        File wf = new File(getDefaultServerDir(), name);
        deleteRecursive(wf);
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    private void zipDir(File dir, String baseName, ZipOutputStream zos) throws IOException {
        if (!dir.exists()) return;
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f.isDirectory()) {
                zipDir(f, baseName + "/" + f.getName(), zos);
            } else {
                zipFile(f, baseName + "/" + f.getName(), zos);
            }
        }
    }

    private void zipFile(File f, String entryName, ZipOutputStream zos) throws IOException {
        try (FileInputStream fis = new FileInputStream(f)) {
            ZipEntry entry = new ZipEntry(entryName);
            zos.putNextEntry(entry);
            byte[] buf = new byte[8192];
            int n;
            while ((n = fis.read(buf)) > 0) zos.write(buf, 0, n);
            zos.closeEntry();
        }
    }

    private long getDirSize(File dir) {
        long size = 0;
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.isDirectory()) size += getDirSize(f);
                else size += f.length();
            }
        }
        return size;
    }

    private void deleteRecursive(File f) {
        if (f.isDirectory()) {
            File[] ch = f.listFiles();
            if (ch != null) {
                for (File c : ch) deleteRecursive(c);
            }
        }
        f.delete();
    }
}
