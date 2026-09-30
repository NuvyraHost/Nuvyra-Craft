package com.nuvyra.craft.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Environment;
import android.system.Os;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.tukaani.xz.XZInputStream;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.GZIPInputStream;
import java.util.zip.Inflater;
import java.util.zip.InflaterInputStream;

@CapacitorPlugin(name = "JavaManager")
public class JavaManagerPlugin extends Plugin {

    private static final String PREFS_NAME = "nuvyra_java_prefs";
    private static final String KEY_JAVA_SETTING = "java_version_setting";

    // Primary Android-native OpenJDK 17 (ARM64 Bionic libc from PojavLauncher)
    private static final String POJAV_JRE17_ARM64_URL =
        "https://github.com/PojavLauncherTeam/android-openjdk-build-multiarch/releases/download/jre17-ec28559/jre17-arm64-20210825-release.tar.xz";

    // PojavLauncher APK containing native OpenJDK 21 ARM64 and universal components
    private static final String POJAV_APK_URL =
        "https://github.com/PojavLauncherTeam/PojavLauncher/releases/download/gladiolus/PojavLauncher.apk";
    private static final long POJAV_JRE21_BIN_OFFSET = 37238886L;
    private static final long POJAV_JRE21_BIN_SIZE = 5399593L;
    private static final long POJAV_JRE21_UNIV_OFFSET = 54702402L;
    private static final long POJAV_JRE21_UNIV_SIZE = 23523014L;

    public File getJavaRootDir() {
        File d = new File(getContext().getFilesDir(), "java");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    public File getJava21RootDir() {
        File d = new File(getContext().getFilesDir(), "java21");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    public static File getPersistentArchive(Context ctx) {
        if (ctx == null) return null;
        try {
            // Priority 1: App internal files directory (Always 100% accessible, zero permissions needed)
            File f1 = new File(ctx.getFilesDir(), "jre-android.tar.xz");
            if (f1.exists() && f1.canRead() && f1.length() > 10000000) {
                try (InputStream in = new FileInputStream(f1)) {
                    if (in.read() != -1) return f1;
                } catch (Throwable ignored) {}
            }

            // Priority 2: App external files directory (Always 100% accessible, zero runtime permissions needed)
            File extDir = ctx.getExternalFilesDir(null);
            if (extDir != null) {
                File f2 = new File(extDir, "jre-android.tar.xz");
                if (f2.exists() && f2.canRead() && f2.length() > 10000000) {
                    try (InputStream in = new FileInputStream(f2)) {
                        if (in.read() != -1) return f2;
                    } catch (Throwable ignored) {}
                }
            }

            // Priority 3: External public storage ONLY if canRead() and test read succeeds
            File[] pubCandidates = new File[] {
                new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "NuvyraCraft/jre17-android.tar.xz"),
                new File("/storage/emulated/0/Download/NuvyraCraft/jre17-android.tar.xz"),
                new File("/sdcard/Download/NuvyraCraft/jre17-android.tar.xz")
            };
            for (File f : pubCandidates) {
                if (f != null && f.exists() && f.canRead() && f.length() > 10000000) {
                    try (InputStream in = new FileInputStream(f)) {
                        if (in.read() != -1) return f;
                    } catch (Throwable ignored) {}
                }
            }
        } catch (Throwable ignored) {}

        // Never return an unverified file! Return null so it downloads cleanly into app storage
        return null;
    }

    public static File getPersistentArchive21(Context ctx) {
        if (ctx == null) return null;
        try {
            // Priority 1: App internal files directory
            File f1 = new File(ctx.getFilesDir(), "jre21-android.tar.xz");
            if (f1.exists() && f1.canRead() && f1.length() > 5000000) {
                try (InputStream in = new FileInputStream(f1)) {
                    if (in.read() != -1) return f1;
                } catch (Throwable ignored) {}
            }

            // Priority 2: App external files directory
            File extDir = ctx.getExternalFilesDir(null);
            if (extDir != null) {
                File f2 = new File(extDir, "jre21-android.tar.xz");
                if (f2.exists() && f2.canRead() && f2.length() > 5000000) {
                    try (InputStream in = new FileInputStream(f2)) {
                        if (in.read() != -1) return f2;
                    } catch (Throwable ignored) {}
                }
            }

            // Priority 3: External public storage ONLY if canRead() and test read succeeds
            File[] pubCandidates = new File[] {
                new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "NuvyraCraft/jre21-android.tar.xz"),
                new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "jre21-android.tar.xz"),
                new File("/storage/emulated/0/Download/NuvyraCraft/jre21-android.tar.xz"),
                new File("/storage/emulated/0/Download/jre21-android.tar.xz"),
                new File("/sdcard/Download/NuvyraCraft/jre21-android.tar.xz"),
                new File("/sdcard/Download/jre21-android.tar.xz")
            };
            for (File f : pubCandidates) {
                if (f != null && f.exists() && f.canRead() && f.length() > 5000000) {
                    try (InputStream in = new FileInputStream(f)) {
                        if (in.read() != -1) return f;
                    } catch (Throwable ignored) {}
                }
            }
        } catch (Throwable ignored) {}
        return null;
    }

    public interface JavaProgressListener {
        void onProgress(int percent, String message);
    }

    public File getJavaBinary() {
        return findJavaBinaryInDir(getJavaRootDir());
    }

    public File getJava21Binary() {
        return findJavaBinaryInDir(getJava21RootDir());
    }

    public static File getJava21Binary(Context ctx) {
        if (ctx == null) return null;
        return findJavaBinaryInDir(new File(ctx.getFilesDir(), "java21"));
    }

    public static File getJava17Binary(Context ctx) {
        if (ctx == null) return null;
        return findJavaBinaryInDir(new File(ctx.getFilesDir(), "java"));
    }

    public static File findJavaBinaryInDir(File root) {
        if (root == null) return null;
        File direct = new File(root, "bin/java");
        if (direct.exists()) return direct;

        File[] subdirs = root.listFiles(File::isDirectory);
        if (subdirs != null) {
            for (File dir : subdirs) {
                File nested = new File(dir, "bin/java");
                if (nested.exists()) return nested;
            }
        }
        return direct;
    }

    private File findJavaRecursively(File dir, int depth) {
        if (depth <= 0 || dir == null || !dir.exists()) return null;
        File javaBin = new File(dir, "bin/java");
        if (javaBin.exists()) return javaBin;
        File[] children = dir.listFiles(File::isDirectory);
        if (children != null) {
            for (File c : children) {
                File res = findJavaRecursively(c, depth - 1);
                if (res != null) return res;
            }
        }
        return null;
    }

    @PluginMethod
    public void checkJava(PluginCall call) {
        checkJavaVersion(call, 17);
    }

    @PluginMethod
    public void checkJava21(PluginCall call) {
        checkJavaVersion(call, 21);
    }

    private void checkJavaVersion(PluginCall call, int version) {
        try {
            File javaBin = (version == 21) ? getJava21Binary() : getJavaBinary();
            if (javaBin.exists() && (javaBin.canExecute() || javaBin.setExecutable(true, false))) {
                JSObject ret = new JSObject();
                ret.put("installed", true);
                ret.put("version", String.valueOf(version));
                ret.put("path", javaBin.getAbsolutePath());
                call.resolve(ret);
                return;
            }

            // For Java 17, also check persistent archive cache
            if (version == 17) {
                File archive = getPersistentArchive(getContext());
                if (archive != null && archive.exists() && archive.canRead() && archive.length() > 10000000) {
                    try {
                        File javaDir = getJavaRootDir();
                        if (javaDir.exists()) deleteRecursive(javaDir);
                        javaDir.mkdirs();
                        extractArchive(archive, javaDir);
                        setExecutableRecursive(javaDir);
                        File recoveredBin = getJavaBinary();
                        if (recoveredBin.exists()) {
                            recoveredBin.setExecutable(true, false);
                            JSObject ret = new JSObject();
                            ret.put("installed", true);
                            ret.put("version", "17");
                            ret.put("path", recoveredBin.getAbsolutePath());
                            call.resolve(ret);
                            return;
                        }
                    } catch (Throwable ignored) {}
                }
            }

            JSObject ret = new JSObject();
            ret.put("installed", false);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("installed", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    public static boolean installJava21Sync(Context ctx, JavaProgressListener listener) throws Exception {
        File java21Dir = new File(ctx.getFilesDir(), "java21");
        File existingBin = getJava21Binary(ctx);
        if (existingBin != null && existingBin.exists() && (existingBin.canExecute() || existingBin.setExecutable(true, false))) {
            if (listener != null) listener.onProgress(100, "Java 21 already installed");
            return true;
        }

        // 1. Check local cached archive first
        File cachedArchive = getPersistentArchive21(ctx);
        if (cachedArchive != null) {
            if (listener != null) listener.onProgress(50, "Extracting local Java 21 runtime...");
            if (java21Dir.exists()) deleteRecursive(java21Dir);
            java21Dir.mkdirs();
            extractArchive(cachedArchive, java21Dir);
            setExecutableRecursive(java21Dir);

            File javaBin = getJava21Binary(ctx);
            if (javaBin != null && javaBin.exists() && (javaBin.canExecute() || javaBin.setExecutable(true, false))) {
                if (listener != null) listener.onProgress(100, "Java 21 ARM64 Installed");
                return true;
            }
        }

        // 2. Download Java 21 components from official PojavLauncher Gladiolus release
        if (listener != null) listener.onProgress(5, "Connecting to Java 21 repository...");
        URL finalUrl = resolveRedirects(POJAV_APK_URL);

        File binArchive = new File(ctx.getFilesDir(), "jre21-bin.tar.xz");
        File univArchive = new File(ctx.getFilesDir(), "jre21-univ.tar.xz");

        try {
            if (listener != null) listener.onProgress(10, "Downloading Java 21 Binaries (1/2)...");
            downloadRangeInflatedInternal(finalUrl, POJAV_JRE21_BIN_OFFSET, POJAV_JRE21_BIN_SIZE, binArchive, "Downloading Java 21 Binaries (1/2)", 10, 25, listener);

            if (listener != null) listener.onProgress(35, "Downloading Java 21 Libraries (2/2)...");
            downloadRangeInflatedInternal(finalUrl, POJAV_JRE21_UNIV_OFFSET, POJAV_JRE21_UNIV_SIZE, univArchive, "Downloading Java 21 Libraries (2/2)", 35, 40, listener);

            if (listener != null) listener.onProgress(80, "Extracting Java 21 runtime...");
            if (java21Dir.exists()) deleteRecursive(java21Dir);
            java21Dir.mkdirs();

            extractArchive(binArchive, java21Dir);

            if (listener != null) listener.onProgress(90, "Extracting Java 21 libraries...");
            extractArchive(univArchive, java21Dir);

            setExecutableRecursive(java21Dir);

            File javaBin = getJava21Binary(ctx);
            if (javaBin == null || !javaBin.exists()) {
                throw new IOException("Java 21 binary not found after extraction");
            }
            javaBin.setExecutable(true, false);
            javaBin.setReadable(true, false);

            if (listener != null) listener.onProgress(100, "Java 21 ARM64 Installed");
            return true;
        } finally {
            if (binArchive.exists()) binArchive.delete();
            if (univArchive.exists()) univArchive.delete();
        }
    }

    @PluginMethod
    public void installJava21(PluginCall call) {
        new Thread(() -> {
            try {
                boolean ok = installJava21Sync(getContext(), (pct, status) -> {
                    JSObject notify = new JSObject();
                    notify.put("step", "java21");
                    notify.put("status", status);
                    notify.put("percent", pct);
                    notifyListeners("setup-progress", notify);
                    notifyListeners("java-download-progress", notify);
                });
                File javaBin = getJava21Binary();
                JSObject res = new JSObject();
                res.put("success", ok);
                if (javaBin != null) res.put("path", javaBin.getAbsolutePath());
                call.resolve(res);
            } catch (Exception e) {
                JSObject err = new JSObject();
                err.put("step", "java21");
                err.put("status", "Java 21 install failed: " + e.getMessage());
                err.put("percent", 0);
                notifyListeners("setup-progress", err);
                call.reject("Failed to install Java 21: " + e.getMessage());
            }
        }).start();
    }

    public static URL resolveRedirects(String initialUrl) throws IOException {
        URL currentUrl = new URL(initialUrl);
        int redirects = 0;
        while (redirects < 8) {
            HttpURLConnection conn = (HttpURLConnection) currentUrl.openConnection();
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 NuvyraCraft/1.0 (Android)");
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(25000);
            conn.setReadTimeout(60000);
            conn.connect();
            int code = conn.getResponseCode();
            if (code == 301 || code == 302 || code == 307 || code == 308) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (loc == null) break;
                currentUrl = new URL(loc);
                redirects++;
            } else {
                conn.disconnect();
                break;
            }
        }
        return currentUrl;
    }

    private static void downloadRangeInflatedInternal(URL url, long start, long size, File targetFile, String stepTitle, int pctBase, int pctSpan, JavaProgressListener listener) throws IOException {
        long end = start + size - 1L;
        URL current = url;
        HttpURLConnection conn = null;
        int redirects = 0;
        while (redirects < 6) {
            conn = (HttpURLConnection) current.openConnection();
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 NuvyraCraft/1.0 (Android)");
            conn.setRequestProperty("Range", "bytes=" + start + "-" + end);
            conn.setConnectTimeout(25000);
            conn.setReadTimeout(120000);
            conn.setInstanceFollowRedirects(false);
            conn.connect();
            int code = conn.getResponseCode();
            if (code == 301 || code == 302 || code == 307 || code == 308) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (loc == null) break;
                current = new URL(loc);
                redirects++;
            } else {
                break;
            }
        }

        if (conn == null) throw new IOException("Failed to establish connection to " + url);
        int code = conn.getResponseCode();
        if (code != 206 && code != 200) {
            conn.disconnect();
            throw new IOException("HTTP " + code + " on range request " + start + "-" + end);
        }

        try (InputStream raw = conn.getInputStream();
             InflaterInputStream iis = new InflaterInputStream(raw, new Inflater(true));
             FileOutputStream fos = new FileOutputStream(targetFile)) {

            byte[] buf = new byte[32768];
            int n;
            long totalRead = 0;
            long lastNotify = 0;
            while ((n = iis.read(buf)) != -1) {
                fos.write(buf, 0, n);
                totalRead += n;
                long now = System.currentTimeMillis();
                if (now - lastNotify > 300) {
                    lastNotify = now;
                    int pct = pctBase + (int) Math.min(pctSpan, (totalRead * pctSpan / Math.max(1, size)));
                    if (listener != null) {
                        listener.onProgress(pct, stepTitle + " (" + pct + "%)");
                    }
                }
            }
            fos.flush();
        } finally {
            conn.disconnect();
        }
    }

    @PluginMethod
    public void installJava(PluginCall call) {
        String version = call.getString("version", "17");
        if ("21".equals(version)) {
            installJava21(call);
            return;
        }
        new Thread(() -> {
            HttpURLConnection conn = null;
            InputStream in = null;
            FileOutputStream out = null;
            try {
                // First check if persistent archive already exists on phone storage!
                File persistentArchive = getPersistentArchive(getContext());
                File targetArchive = null;

                if (persistentArchive != null && persistentArchive.exists() && persistentArchive.canRead() && persistentArchive.length() > 10000000) {
                    try {
                        try (InputStream testIn = new FileInputStream(persistentArchive)) {
                            testIn.read();
                        }
                        targetArchive = persistentArchive;
                        JSObject notify = new JSObject();
                        notify.put("step", "java");
                        notify.put("status", "Found local cached Java archive! Extracting...");
                        notify.put("percent", 70);
                        notifyListeners("setup-progress", notify);
                    } catch (Throwable ignored) {
                        targetArchive = null;
                    }
                }

                if (targetArchive == null) {
                    // Download PojavLauncher Android OpenJDK ARM64
                    String urlStr = POJAV_JRE17_ARM64_URL;

                    URL currentUrl = new URL(urlStr);
                    int redirects = 0;
                    while (redirects < 6) {
                        conn = (HttpURLConnection) currentUrl.openConnection();
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0 NuvyraCraft/1.0 (Android)");
                        conn.setInstanceFollowRedirects(true);
                        conn.setConnectTimeout(20000);
                        conn.setReadTimeout(60000);
                        conn.connect();

                        int responseCode = conn.getResponseCode();
                        if (responseCode == HttpURLConnection.HTTP_MOVED_PERM || 
                            responseCode == HttpURLConnection.HTTP_MOVED_TEMP || 
                            responseCode == 307 || responseCode == 308) {
                            String newLocation = conn.getHeaderField("Location");
                            conn.disconnect();
                            if (newLocation == null) break;
                            currentUrl = new URL(newLocation);
                            redirects++;
                        } else {
                            break;
                        }
                    }

                    int code = conn.getResponseCode();
                    if (code != 200) {
                        throw new IOException("HTTP " + code + " while downloading Java runtime");
                    }

                    long totalBytes = conn.getContentLengthLong();
                    in = conn.getInputStream();

                    targetArchive = new File(getContext().getFilesDir(), "jre-android.tar.xz");
                    out = new FileOutputStream(targetArchive);

                    byte[] buf = new byte[32768];
                    int n;
                    long downloaded = 0;
                    long lastNotify = 0;

                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        downloaded += n;
                        long now = System.currentTimeMillis();
                        if (now - lastNotify > 250) {
                            lastNotify = now;
                            int intPct = totalBytes > 0 ? (int) Math.min(80, (downloaded * 80L / totalBytes)) : 40;

                            JSObject progress = new JSObject();
                            progress.put("step", "java");
                            progress.put("status", "Downloading Java ARM64 (" + intPct + "%)...");
                            progress.put("percent", intPct);
                            progress.put("downloaded", downloaded);
                            progress.put("total", totalBytes);

                            notifyListeners("setup-progress", progress);
                            notifyListeners("java-download-progress", progress);
                        }
                    }
                    out.flush();
                    out.close();
                    out = null;
                    in.close();
                    in = null;

                    if (targetArchive.length() < 5000000) {
                        throw new IOException("Downloaded archive is incomplete (" + targetArchive.length() + " bytes)");
                    }

                    // Save persistent copy to app external storage
                    try {
                        File extAppDir = getContext().getExternalFilesDir(null);
                        if (extAppDir != null) {
                            if (!extAppDir.exists()) extAppDir.mkdirs();
                            copyFile(targetArchive, new File(extAppDir, "jre-android.tar.xz"));
                        }
                    } catch (Throwable ignored) {}
                }

                // Notify extracting
                JSObject extractNotify = new JSObject();
                extractNotify.put("step", "java");
                extractNotify.put("status", "Extracting Android Java runtime...");
                extractNotify.put("percent", 85);
                notifyListeners("setup-progress", extractNotify);
                notifyListeners("java-download-progress", extractNotify);

                File javaDir = getJavaRootDir();
                if (javaDir.exists()) {
                    deleteRecursive(javaDir);
                }
                javaDir.mkdirs();

                extractArchive(targetArchive, javaDir);
                setExecutableRecursive(javaDir);

                // Notify finished
                JSObject doneNotify = new JSObject();
                doneNotify.put("step", "java");
                doneNotify.put("status", "Java 17 ARM64 Installed");
                doneNotify.put("percent", 100);
                notifyListeners("setup-progress", doneNotify);
                notifyListeners("java-download-progress", doneNotify);

                File javaBin = getJavaBinary();
                JSObject res = new JSObject();
                res.put("success", true);
                res.put("path", javaBin.getAbsolutePath());
                call.resolve(res);

            } catch (Exception e) {
                JSObject errNotify = new JSObject();
                errNotify.put("step", "java");
                errNotify.put("status", "Java install failed: " + e.getMessage());
                errNotify.put("percent", 0);
                notifyListeners("setup-progress", errNotify);
                call.reject("Failed to download or install Java: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
                try { if (in != null) in.close(); } catch (Exception ignored) {}
                try { if (out != null) out.close(); } catch (Exception ignored) {}
            }
        }).start();
    }

    @PluginMethod
    public void getJavaSettings(PluginCall call) {
        String setting = "auto";
        try {
            File sdir = ServerProcessPlugin.getActiveServerDir(getContext());
            File meta = new File(sdir, ".mcmeta.json");
            if (meta.exists()) {
                try (BufferedReader br = new BufferedReader(new FileReader(meta))) {
                    StringBuilder sb = new StringBuilder();
                    String l;
                    while ((l = br.readLine()) != null) sb.append(l);
                    org.json.JSONObject obj = new org.json.JSONObject(sb.toString());
                    if (obj.has("javaVersion")) {
                        setting = obj.getString("javaVersion");
                    }
                } catch (Exception ignored) {}
            }
        } catch (Throwable ignored) {}

        if ("auto".equals(setting)) {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            setting = prefs.getString(KEY_JAVA_SETTING, "auto");
        }
        JSObject ret = new JSObject();
        ret.put("setting", setting);
        ret.put("configuredSetting", setting);
        ret.put("installedPath", getJavaBinary().getAbsolutePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void setJavaVersion(PluginCall call) {
        String setting = call.getString("setting", "auto");
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_JAVA_SETTING, setting).apply();

        // Also persist in active server .mcmeta.json
        try {
            File sdir = ServerProcessPlugin.getActiveServerDir(getContext());
            File meta = new File(sdir, ".mcmeta.json");
            org.json.JSONObject obj = new org.json.JSONObject();
            if (meta.exists()) {
                try (BufferedReader br = new BufferedReader(new FileReader(meta))) {
                    StringBuilder sb = new StringBuilder();
                    String l;
                    while ((l = br.readLine()) != null) sb.append(l);
                    obj = new org.json.JSONObject(sb.toString());
                } catch (Exception ignored) {}
            }
            obj.put("javaVersion", setting);
            try (FileWriter fw = new FileWriter(meta)) {
                fw.write(obj.toString(2));
            }
        } catch (Throwable ignored) {}

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("setting", setting);
        call.resolve(ret);
    }

    public static void extractArchive(File archiveFile, File destDir) throws Exception {
        InputStream raw = new FileInputStream(archiveFile);
        InputStream decompressed;
        if (archiveFile.getName().endsWith(".xz")) {
            decompressed = new XZInputStream(raw);
        } else {
            decompressed = new GZIPInputStream(raw);
        }

        try (TarArchiveReader reader = new TarArchiveReader(decompressed)) {
            TarEntry entry;
            byte[] buffer = new byte[32768];
            while ((entry = reader.getNextEntry()) != null) {
                String name = entry.getName();
                if (name.startsWith("PaxHeaders.") || name.contains("@LongLink")) {
                    continue;
                }
                if (name.startsWith("./")) {
                    name = name.substring(2);
                }
                if (name.isEmpty()) continue;

                File destPath = new File(destDir, name);
                if (entry.isDirectory()) {
                    destPath.mkdirs();
                } else if (entry.isSymbolicLink()) {
                    File parent = destPath.getParentFile();
                    if (parent != null) parent.mkdirs();
                    try {
                        destPath.delete();
                        Os.symlink(entry.getLinkTarget(), destPath.getAbsolutePath());
                    } catch (Exception e) {
                        try {
                            File target = new File(entry.getLinkTarget());
                            if (!target.isAbsolute() && parent != null) {
                                target = new File(parent, entry.getLinkTarget());
                            }
                            if (target.exists()) copyFile(target, destPath);
                        } catch (Exception ignored) {}
                    }
                } else {
                    File parent = destPath.getParentFile();
                    if (parent != null) parent.mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(destPath)) {
                        long remaining = entry.getSize();
                        int readChunk;
                        while (remaining > 0 && (readChunk = reader.read(buffer, 0, (int) Math.min(buffer.length, remaining))) != -1) {
                            fos.write(buffer, 0, readChunk);
                            remaining -= readChunk;
                        }
                    }
                    if (name.contains("bin/") || name.endsWith(".so") || name.equals("java")) {
                        destPath.setExecutable(true, false);
                        destPath.setReadable(true, false);
                    }
                }
            }
        }
    }

    public static void copyFile(File src, File dst) throws IOException {
        try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[32768];
            int len;
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
            }
        }
    }

    public static void setExecutableRecursive(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) setExecutableRecursive(child);
            }
        } else {
            String p = file.getAbsolutePath();
            if (p.contains("/bin/") || p.contains("\\bin\\") || p.endsWith(".so") || file.getName().equals("java")) {
                file.setExecutable(true, false);
                file.setReadable(true, false);
                try {
                    Os.chmod(p, 0755);
                } catch (Throwable ignored) {}
            }
        }
    }

    public static void deleteRecursive(File f) {
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) {
                for (File c : children) deleteRecursive(c);
            }
        }
        f.delete();
    }

    // ── Robust TAR format reader handling GNU LongLink, PAX headers & exact sizes ──
    private static class TarArchiveReader implements Closeable {
        private final InputStream in;
        private long bytesRemainingInEntry = 0;
        private String pendingLongName = null;

        public TarArchiveReader(InputStream in) {
            this.in = in;
        }

        public TarEntry getNextEntry() throws IOException {
            if (bytesRemainingInEntry > 0) {
                skipFully(bytesRemainingInEntry);
                bytesRemainingInEntry = 0;
            }

            while (true) {
                byte[] header = new byte[512];
                int read = 0;
                while (read < 512) {
                    int n = in.read(header, read, 512 - read);
                    if (n == -1) return null;
                    read += n;
                }

                boolean allZero = true;
                for (byte b : header) {
                    if (b != 0) { allZero = false; break; }
                }
                if (allZero) return null;

                String name = pendingLongName != null ? pendingLongName : parseNullTerminatedString(header, 0, 100);
                pendingLongName = null;

                long size = parseOctal(header, 124, 12);
                byte typeFlag = header[156];
                String linkTarget = parseNullTerminatedString(header, 157, 100);

                if (typeFlag == 'L') {
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    byte[] tmp = new byte[512];
                    long remaining = size;
                    while (remaining > 0) {
                        int r = in.read(tmp, 0, (int) Math.min(tmp.length, remaining));
                        if (r == -1) break;
                        baos.write(tmp, 0, r);
                        remaining -= r;
                    }
                    long pad = (512 - (size % 512)) % 512;
                    skipFully(pad);
                    pendingLongName = baos.toString("UTF-8").trim().replace("\0", "");
                    continue;
                }

                long padding = (512 - (size % 512)) % 512;
                bytesRemainingInEntry = size + padding;

                boolean isDir = typeFlag == '5' || name.endsWith("/");
                boolean isSymlink = typeFlag == '2';

                return new TarEntry(name, size, isDir, isSymlink, linkTarget);
            }
        }

        public int read(byte[] b, int off, int len) throws IOException {
            if (bytesRemainingInEntry <= 0) return -1;
            int toRead = (int) Math.min(len, bytesRemainingInEntry);
            int n = in.read(b, off, toRead);
            if (n != -1) bytesRemainingInEntry -= n;
            return n;
        }

        private void skipFully(long n) throws IOException {
            long remaining = n;
            byte[] skipBuf = new byte[4096];
            while (remaining > 0) {
                int r = in.read(skipBuf, 0, (int) Math.min(skipBuf.length, remaining));
                if (r == -1) break;
                remaining -= r;
            }
        }

        private static String parseNullTerminatedString(byte[] b, int off, int len) {
            int end = off;
            while (end < off + len && b[end] != 0) end++;
            try {
                return new String(b, off, end - off, "UTF-8").trim();
            } catch (Exception ignored) {
                return new String(b, off, end - off).trim();
            }
        }

        private static long parseOctal(byte[] b, int off, int len) {
            long val = 0;
            int i = off;
            while (i < off + len && (b[i] == ' ' || b[i] == 0)) i++;
            for (; i < off + len; i++) {
                if (b[i] >= '0' && b[i] <= '7') {
                    val = (val << 3) + (b[i] - '0');
                } else {
                    break;
                }
            }
            return val;
        }

        @Override
        public void close() throws IOException {
            in.close();
        }
    }

    private static class TarEntry {
        private final String name;
        private final long size;
        private final boolean isDir;
        private final boolean isSymlink;
        private final String linkTarget;

        public TarEntry(String name, long size, boolean isDir, boolean isSymlink, String linkTarget) {
            this.name = name;
            this.size = size;
            this.isDir = isDir;
            this.isSymlink = isSymlink;
            this.linkTarget = linkTarget;
        }

        public String getName() { return name; }
        public long getSize() { return size; }
        public boolean isDirectory() { return isDir; }
        public boolean isSymbolicLink() { return isSymlink; }
        public String getLinkTarget() { return linkTarget; }
    }
}
