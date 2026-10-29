#!/usr/bin/env node
/**
 * reset.bat / reset.sh tarafindan cagrilir.
 *
 * - .env.example haric tum .env dosyalarini siler.
 * - SQLite veritabani dosyalarini (*.db, -wal, -shm, -journal) siler.
 * - Projeyi ilk kurulum haline dondurur.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const ignoredDirs = new Set(["node_modules", ".next", ".git", ".turbo", "dist", "build"]);
const databaseExtensions = [".db", ".db-wal", ".db-shm", ".db-journal", ".sqlite", ".sqlite3", ".sqlite-wal", ".sqlite-shm"];

function walk(dir, visit) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      walk(full, visit);
      continue;
    }
    visit(full, entry.name);
  }
}

function readSqlitePathFromEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return null;
  const text = fs.readFileSync(envPath, "utf8");
  const match = text.match(/^\s*SQLITE_PATH\s*=\s*(.+)\s*$/m);
  if (!match) return null;

  const raw = match[1].trim().replace(/^["']|["']$/g, "").replace(/^file:/i, "");
  if (!raw) return null;

  const resolved = path.resolve(root, raw);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

function collectTargets() {
  const envFiles = [];
  const databaseFiles = new Set();

  walk(root, (full, name) => {
    if (name === ".env.example") return;
    if (name === ".env" || name.startsWith(".env.")) envFiles.push(full);

    const lower = name.toLowerCase();
    if (databaseExtensions.some((extension) => lower.endsWith(extension))) {
      databaseFiles.add(full);
    }
  });

  const configuredDb = readSqlitePathFromEnv();
  if (configuredDb) {
    databaseFiles.add(configuredDb);
    databaseFiles.add(`${configuredDb}-wal`);
    databaseFiles.add(`${configuredDb}-shm`);
    databaseFiles.add(`${configuredDb}-journal`);
  }

  return {
    envFiles: [...new Set(envFiles)].filter((file) => fs.existsSync(file)),
    databaseFiles: [...databaseFiles].filter((file) => fs.existsSync(file)),
  };
}

function askConfirmation() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Devam etmek icin "EVET" yazin: ', (answer) => {
      rl.close();
      resolve(answer.trim().toLocaleLowerCase("tr-TR") === "evet" || answer.trim().toLowerCase() === "yes");
    });
  });
}

function removeEmptyDataDir() {
  const dataDir = path.join(root, "data");
  if (!fs.existsSync(dataDir)) return;
  const hasFiles = fs.readdirSync(dataDir).length > 0;
  if (!hasFiles) {
    fs.rmdirSync(dataDir);
    console.log(`  silindi: ${path.relative(root, dataDir)}${path.sep}`);
  }
}

const skipConfirmation = process.argv.includes("--yes") || process.argv.includes("-y") || process.env.RESET_YES === "1";
const { envFiles, databaseFiles } = collectTargets();

console.log("");
console.log("  ============================================================");
console.log("   PROJE SIFIRLAMA");
console.log("  ============================================================");
console.log("   Silinecek .env dosyalari:");
if (envFiles.length === 0) console.log("     (yok)");
for (const file of envFiles) console.log(`     - ${path.relative(root, file)}`);
console.log("   Silinecek SQLite dosyalari:");
if (databaseFiles.length === 0) console.log("     (yok)");
for (const file of databaseFiles) console.log(`     - ${path.relative(root, file)}`);
console.log("  ============================================================");
console.log("");

if (envFiles.length === 0 && databaseFiles.length === 0) {
  console.log("  Silinecek bir sey bulunamadi. Proje zaten sifir durumda.");
  process.exit(0);
}

if (!skipConfirmation) {
  const confirmed = await askConfirmation();
  if (!confirmed) {
    console.log("  Iptal edildi. Hicbir dosya silinmedi.");
    process.exit(0);
  }
}

for (const file of [...envFiles, ...databaseFiles]) {
  try {
    fs.rmSync(file, { force: true });
    console.log(`  silindi: ${path.relative(root, file)}`);
  } catch (error) {
    console.error(`  SILINEMEDI: ${path.relative(root, file)} (${error.message})`);
    process.exitCode = 1;
  }
}

removeEmptyDataDir();

if (process.exitCode === 1) {
  console.log("");
  console.log("  Not: Sunucu hala calisiyorsa SQLite dosyasi kilitli olabilir.");
  console.log("  Once sunucu terminalinde CTRL + C yapip reset islemini tekrar deneyin.");
}

console.log("");
console.log(process.exitCode === 1 ? "  Sifirlama kismen tamamlandi." : "  Sifirlama tamamlandi.");
console.log("  Yeniden baslatmak icin start.bat (Windows) veya ./start.sh (Linux/macOS) calistirin.");
console.log("  .env ve SQLite veritabani ilk calistirmada otomatik olusturulacak.");
console.log("");
