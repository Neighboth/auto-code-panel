#!/usr/bin/env node
"use strict";

/**
 * Custom Next.js server.
 *
 * - Reads the license text from src/LICENSE on every change (cached by mtime).
 * - Injects it as the very first bytes of every HTML page (<!DOCTYPE html>).
 * - Supports production (`node server.js`) and development (`node server.js --dev`).
 * - Prints the local and network URLs with the active port.
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { parse } = require("node:url");

const root = __dirname;
process.chdir(root);

try {
  require("dotenv").config({ path: path.join(root, ".env"), quiet: true });
} catch (error) {
  console.warn(`[env] .env okunamadi: ${error.message}`);
}

const dev = process.argv.includes("--dev") || process.env.NODE_ENV === "development";
process.env.NODE_ENV = dev ? "development" : "production";

const next = require("next");

const requestedPort = Number.parseInt(process.env.PORT || "3000", 10);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536 ? requestedPort : 3000;
const host = resolveHost();
const licenseFile = path.join(root, "src", "LICENSE");
const databaseFile = path.resolve(
  (process.env.SQLITE_PATH || path.join(root, "data", "app.db")).replace(/^file:/i, ""),
);

/* ---------------------------- Custom domains ---------------------------- */

const DOMAIN_CACHE_MS = 5_000;
let domainCache = { at: 0, map: new Map() };
let domainRefresh = null;
let domainClient = null;

function getDomainClient() {
  if (domainClient) return domainClient;
  if (!fs.existsSync(databaseFile)) return null;
  try {
    const { createClient } = require("@libsql/client");
    domainClient = createClient({ url: `file:${databaseFile}` });
    return domainClient;
  } catch (error) {
    console.warn(`[domain] SQLite istemcisi acilamadi: ${error.message}`);
    return null;
  }
}

function normalizeHostname(value) {
  let hostname = String(value || "").split(",")[0].trim().toLowerCase();
  if (!hostname) return "";
  if (hostname.startsWith("[")) {
    const end = hostname.indexOf("]");
    hostname = end >= 0 ? hostname.slice(0, end + 1) : hostname;
  } else {
    hostname = hostname.replace(/:\d+$/, "");
  }
  hostname = hostname.replace(/\.$/, "");
  if (hostname.startsWith("www.")) hostname = hostname.slice(4);
  return hostname;
}

async function refreshDomainCache() {
  const map = new Map();
  let loaded = false;
  const client = getDomainClient();
  if (client) {
    try {
      const result = await client.execute(
        "select slug, custom_domain from stores where custom_domain is not null and custom_domain_verified_at is not null",
      );
      for (const row of result.rows) {
        const domain = normalizeHostname(row.custom_domain);
        const slug = String(row.slug || "");
        if (domain && slug) map.set(domain, slug);
      }
      loaded = true;
    } catch (error) {
      console.warn(`[domain] Alan adlari okunamadi: ${error.message}`);
    }
  }
  domainCache = { at: Date.now(), map: loaded ? map : domainCache.map };
  return domainCache.map;
}

async function resolveStoreSlug(hostname) {
  if (Date.now() - domainCache.at > DOMAIN_CACHE_MS) {
    if (!domainRefresh) {
      domainRefresh = refreshDomainCache().finally(() => {
        domainRefresh = null;
      });
    }
    await domainRefresh;
  }
  return domainCache.map.get(hostname) || null;
}

function isDomainRewriteExempt(pathname) {
  const first = pathname.split("/")[1] ?? "";
  if (!first) return false;
  if (["_next", "api", "super-admin", "bayi", "favicon.ico", "robots.txt", "sitemap.xml"].includes(first)) {
    return true;
  }
  return /\.[a-z0-9]{2,8}$/i.test(pathname);
}

/**
 * If the request arrived on a dealer's verified custom domain, rewrite it to
 * the internal `/<slug>/...` route so the existing tenant routing keeps working.
 * Admin and storefront URLs both work (`magazadi.com/oyunlar`, `magazadi.com/admin`).
 */
async function applyCustomDomain(req) {
  const hostname = normalizeHostname(req.headers.host || req.headers["x-forwarded-host"] || "");
  if (!hostname || !hostname.includes(".") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return;

  const slug = await resolveStoreSlug(hostname);
  if (!slug) return;

  let parsed;
  try {
    parsed = parse(req.url || "/");
  } catch {
    return;
  }
  const pathname = parsed.pathname || "/";
  if (isDomainRewriteExempt(pathname)) return;
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) return;

  const rewritten = pathname === "/" ? `/${slug}` : `/${slug}${pathname}`;
  req.url = `${rewritten}${parsed.search || ""}`;
  req.headers["x-pixguard-domain"] = hostname;
}

function resolveHost() {
  const explicit = process.env.HOST || process.env.BIND_HOST;
  if (explicit) return explicit;

  // Docker sets HOSTNAME=0.0.0.0; on regular shells it may be the machine name.
  const dockerHost = process.env.HOSTNAME;
  if (dockerHost && (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(dockerHost) || dockerHost === "::")) {
    return dockerHost;
  }
  return "0.0.0.0";
}

let licenseCache = { mtimeMs: -1, comment: "" };

function getLicenseComment() {
  try {
    const stat = fs.statSync(licenseFile);
    if (stat.mtimeMs !== licenseCache.mtimeMs) {
      let body = fs.readFileSync(licenseFile, "utf8").replace(/^\uFEFF/, "").trim();
      // An HTML comment must never contain a closing sequence.
      body = body.replace(/-->/g, "--&gt;").replace(/<!--/g, "&lt;!--");
      licenseCache = {
        mtimeMs: stat.mtimeMs,
        comment: `<!--\n${body}\n-->\n`,
      };
    }
    return licenseCache.comment;
  } catch (error) {
    console.warn(`[license] src/LICENSE okunamadi: ${error.message}`);
    return "";
  }
}

function isHtmlNavigation(req) {
  if (req.method !== "GET") return false;
  if (req.headers["rsc"] === "1" || req.headers["next-router-prefetch"] === "1") return false;

  const accept = String(req.headers.accept || "");
  if (accept.includes("text/html")) return true;
  if (accept && !accept.includes("*/*")) return false;

  let pathname = "/";
  try {
    pathname = parse(req.url || "/").pathname || "/";
  } catch {
    return false;
  }

  if (pathname.startsWith("/_next/") || pathname.startsWith("/api/")) return false;
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return false;
  return !/\.[a-z0-9]{2,8}$/i.test(pathname);
}

function toBuffer(chunk, encoding) {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === "string") {
    return Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8");
  }
  return Buffer.from(chunk);
}

function cleanHeaderObject(headers) {
  if (!headers) return headers;
  const isBlocked = (name) => {
    const lower = String(name).toLowerCase();
    return lower === "content-length" || lower === "etag";
  };

  if (Array.isArray(headers)) {
    // Node accepts either [key, value, key, value] or [[key, value], ...].
    if (headers.length > 0 && Array.isArray(headers[0])) {
      return headers.filter(([name]) => !isBlocked(name));
    }
    const cleaned = [];
    for (let index = 0; index < headers.length; index += 2) {
      if (isBlocked(headers[index])) continue;
      cleaned.push(headers[index]);
      if (index + 1 < headers.length) cleaned.push(headers[index + 1]);
    }
    return cleaned;
  }
  if (typeof headers === "object") {
    const cleaned = {};
    for (const [name, value] of Object.entries(headers)) {
      if (!isBlocked(name)) cleaned[name] = value;
    }
    return cleaned;
  }
  return headers;
}

function injectIntoResponse(req, res) {
  const license = getLicenseComment();
  if (!license) return;

  // Force an uncompressed, unconditional HTML response so the comment is always present.
  delete req.headers["accept-encoding"];
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];

  let injected = false;

  const originalWriteHead = res.writeHead;
  res.writeHead = function writeHead(statusCode, statusMessage, headers) {
    if (typeof statusMessage === "string") {
      return originalWriteHead.call(this, statusCode, statusMessage, cleanHeaderObject(headers));
    }
    return originalWriteHead.call(this, statusCode, cleanHeaderObject(statusMessage ?? headers));
  };

  const originalSetHeader = res.setHeader;
  res.setHeader = function setHeader(name, value) {
    const lower = String(name).toLowerCase();
    if (lower === "content-length" || lower === "etag") return this;
    return originalSetHeader.call(this, name, value);
  };

  const maybeInject = (chunk, encoding) => {
    if (injected || chunk === undefined || chunk === null) return chunk;
    if (res.statusCode === 204 || res.statusCode === 304) return chunk;
    if (res.getHeader("content-encoding")) return chunk;

    const type = String(res.getHeader("content-type") || "");
    if (!type.includes("text/html")) return chunk;

    const body = toBuffer(chunk, encoding);
    if (body.length === 0) return chunk;

    injected = true;
    return Buffer.concat([Buffer.from(license, "utf8"), body]);
  };

  const originalWrite = res.write;
  res.write = function write(chunk, encoding, callback) {
    return originalWrite.call(this, maybeInject(chunk, encoding), encoding, callback);
  };

  const originalEnd = res.end;
  res.end = function end(chunk, encoding, callback) {
    if (typeof chunk === "function") return originalEnd.call(this, chunk);
    return originalEnd.call(this, maybeInject(chunk, encoding), encoding, callback);
  };
}

function networkAddresses() {
  const result = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) result.push(entry.address);
    }
  }
  return [...new Set(result)];
}

/* ---------------------------- Auth secret ---------------------------- */
const providedSecret = process.env.AUTH_SECRET || process.env.SESSION_SECRET;
if (!providedSecret || providedSecret === "change-auth-secret-in-env" || providedSecret.length < 32) {
  const generated = crypto.randomBytes(32).toString("hex");
  process.env.AUTH_SECRET = generated;
  process.env.SESSION_SECRET = generated;
  console.warn("[security] AUTH_SECRET missing or too short. A temporary strong secret was generated for this run.");
  console.warn(`[security] Save this value to .env as AUTH_SECRET to keep sessions across restarts: ${generated}`);
}

const app = next({ dev, hostname: host === "0.0.0.0" ? undefined : host, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer(async (req, res) => {
      try {
        await applyCustomDomain(req);
        if (isHtmlNavigation(req)) injectIntoResponse(req, res);
        await handle(req, res, parse(req.url, true));
      } catch (error) {
        console.error(`[server] istek hatasi (${req.url}):`, error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.end("Internal Server Error");
        } else {
          res.end();
        }
      }
    });

    server.on("upgrade", (req, socket, head) => {
      if (typeof app.getUpgradeHandler === "function") {
        app.getUpgradeHandler()(req, socket, head);
      } else {
        socket.destroy();
      }
    });

    let activePort = port;
    let shuttingDown = false;

    const shutdown = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`\n[server] ${signal} alindi, kapatiliyor...`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    };

    const printBanner = () => {
      const localUrl = `http://localhost:${activePort}`;
      console.log("");
      console.log("  ============================================================");
      console.log("   PixelithShop - Sunucu calisiyor");
      console.log("  ============================================================");
      console.log(`   Yerel    : ${localUrl}`);
      if (host === "0.0.0.0" || host === "::") {
        for (const ip of networkAddresses()) {
          console.log(`   Ag       : http://${ip}:${activePort}`);
        }
      } else {
        console.log(`   Adres    : http://${host}:${activePort}`);
      }
      console.log(`   Port     : ${activePort}`);
      console.log(`   Mod      : ${dev ? "development" : "production"}`);
      console.log("   Lisans   : src/LICENSE -> tum HTML kaynaklarinin en ustune ekleniyor");
      console.log("  ============================================================");
      console.log("  Kapatmak icin bu terminalde CTRL + C yapin.");
      console.log("");
    };

    const listen = (desiredPort, attempt = 0) => {
      const allowFallback = process.env.PORT_FALLBACK !== "0";
      const maxAttempts = allowFallback ? 20 : 0;

      const onError = (error) => {
        if (error.code === "EADDRINUSE" && attempt < maxAttempts) {
          server.removeListener("error", onError);
          server.removeListener("listening", onListening);
          const nextPort = desiredPort + 1;
          console.warn(`[server] ${desiredPort} portu dolu, ${nextPort} portu deneniyor...`);
          setTimeout(() => listen(nextPort, attempt + 1), 100);
          return;
        }

        if (error.code === "EADDRINUSE") {
          console.error(`\n[HATA] ${desiredPort} portu zaten kullanimda. .env icindeki PORT degerini degistirin.\n`);
        } else {
          console.error("[HATA] Sunucu baslatilamadi:", error);
        }
        process.exit(1);
      };

      const onListening = () => {
        server.removeListener("error", onError);
        activePort = desiredPort;
        printBanner();
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(desiredPort, host);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGHUP", () => shutdown("SIGHUP"));

    listen(port);
  })
  .catch((error) => {
    console.error("[HATA] Next.js baslatilamadi:", error);
    process.exit(1);
  });
