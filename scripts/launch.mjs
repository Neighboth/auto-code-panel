#!/usr/bin/env node
/**
 * start.bat / start.sh tarafindan cagrilir.
 *
 * 1) Node surumunu kontrol eder.
 * 2) .env yoksa .env.example'dan guvenli rastgele degerlerle olusturur.
 * 3) Eksik bagimliliklari npm install ile kurar.
 * 4) Kaynak kod degistiyse uretim derlemesini yeniler.
 * 5) Sunucuyu bu terminale bagli olarak calistirir (terminal kapaninca kapanir).
 */

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const isWindows = process.platform === "win32";
const npmCommand = "npm";

function log(message) {
  console.log(message);
}

function fail(message) {
  console.error(`\n[HATA] ${message}\n`);
  process.exit(1);
}

function checkNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 20 || (major === 20 && minor < 9)) {
    fail(
      `Node.js 20.9 veya daha yeni bir surum gerekli. Su an: ${process.versions.node}\n` +
        "Indir: https://nodejs.org/ (LTS)",
    );
  }
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

function randomPassword(length = 18) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return value;
}

function setEnvValue(text, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) return text.replace(pattern, `${key}=${value}`);
  return `${text.trimEnd()}\n${key}=${value}\n`;
}

function readEnvValue(text, key) {
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

function warnWeakEnv(text) {
  const weak = [];
  const authSecret = readEnvValue(text, "AUTH_SECRET");
  const adminPassword = readEnvValue(text, "SUPER_ADMIN_PASSWORD");
  if (!authSecret || authSecret.startsWith("ornek-") || authSecret === "change-auth-secret-in-env") weak.push("AUTH_SECRET");
  if (!adminPassword || adminPassword === "Admin12345!") weak.push("SUPER_ADMIN_PASSWORD");
  if (weak.length > 0) {
    log(`[env] UYARI: ${weak.join(", ")} varsayilan/zayif degerde. .env dosyasindan degistirin.`);
  }
}

function ensureEnvFile() {
  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    warnWeakEnv(text);
    return { created: false, text };
  }

  const examplePath = path.join(root, ".env.example");
  if (!fs.existsSync(examplePath)) {
    fail(".env ve .env.example bulunamadi. Proje dosyalari eksik olabilir.");
  }

  let text = fs.readFileSync(examplePath, "utf8");
  const adminPassword = randomPassword();

  text = setEnvValue(text, "AUTH_SECRET", randomHex(32));
  text = setEnvValue(text, "DATA_ENCRYPTION_KEY", randomHex(32));
  text = setEnvValue(text, "CRON_SECRET", randomHex(24));
  text = setEnvValue(text, "SUPER_ADMIN_PASSWORD", adminPassword);

  fs.writeFileSync(envPath, text, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(envPath, 0o600);
  } catch {
    /* Windows'ta desteklenmeyebilir */
  }

  log("[env] .env bulunamadi; .env.example'dan olusturuldu.");
  log(`[env] SUPER_ADMIN_USERNAME=${readEnvValue(text, "SUPER_ADMIN_USERNAME") || "admin"}`);
  log(`[env] SUPER_ADMIN_PASSWORD=${adminPassword}`);
  log("[env] Bu bilgileri .env dosyasindan degistirebilirsiniz.\n");

  return { created: true, text };
}

function installStampPath() {
  return path.join(root, "node_modules", ".pixguard-install-stamp");
}

function packageNeedsInstall() {
  const nextPackage = path.join(root, "node_modules", "next", "package.json");
  const stamp = installStampPath();
  if (!fs.existsSync(nextPackage) || !fs.existsSync(stamp)) return true;

  const stampTime = fs.statSync(stamp).mtimeMs;
  const packageJson = path.join(root, "package.json");
  if (fs.existsSync(packageJson) && fs.statSync(packageJson).mtimeMs > stampTime + 1000) return true;

  const lockFile = path.join(root, "package-lock.json");
  if (fs.existsSync(lockFile) && fs.statSync(lockFile).mtimeMs > stampTime + 1000) return true;

  return false;
}

function runCommand(command, args, label) {
  log(`[start] ${label}...`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWindows,
    env: process.env,
  });

  if (result.error) fail(`${label} baslatilamadi: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} basarisiz oldu (cikis kodu: ${result.status}).`);
}

function walkNewest(dir, newest, skip) {
  if (!fs.existsSync(dir)) return newest;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (skip(full, entry)) continue;
    if (entry.isDirectory()) {
      newest = walkNewest(full, newest, skip);
      continue;
    }
    const time = fs.statSync(full).mtimeMs;
    if (time > newest) newest = time;
  }
  return newest;
}

function buildNeeded() {
  const buildId = path.join(root, ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) return true;

  const buildTime = fs.statSync(buildId).mtimeMs;
  const licenseFile = path.join(root, "src", "LICENSE");
  const newestSource = walkNewest(
    path.join(root, "src"),
    0,
    (full) => full === licenseFile || full.includes(`${path.sep}.next${path.sep}`),
  );

  let newest = newestSource;
  for (const file of ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs"]) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    newest = Math.max(newest, fs.statSync(full).mtimeMs);
  }

  return newest > buildTime;
}

function startServer() {
  log("[start] Sunucu baslatiliyor...\n");
  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
    windowsHide: false,
  });

  let stopping = false;
  const forward = (signal) => {
    stopping = true;
    if (child.killed) return;
    try {
      child.kill(signal);
    } catch {
      child.kill();
    }
  };
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGHUP", () => forward("SIGHUP"));

  child.on("error", (error) => fail(`Sunucu baslatilamadi: ${error.message}`));
  child.on("exit", (code, signal) => {
    if (stopping) process.exit(0);
    process.exit(code ?? (signal ? 1 : 0));
  });
}

checkNodeVersion();
ensureEnvFile();

if (packageNeedsInstall()) {
  runCommand(npmCommand, ["install", "--no-audit", "--no-fund"], "Bagimliliklar kuruluyor (npm install)");
  fs.writeFileSync(installStampPath(), `${new Date().toISOString()}\n`, "utf8");
} else {
  log("[start] Bagimliliklar hazir.");
}

if (buildNeeded()) {
  runCommand(npmCommand, ["run", "build"], "Proje derleniyor (npm run build)");
} else {
  log("[start] Derleme guncel.");
}

startServer();
