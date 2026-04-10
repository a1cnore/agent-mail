import { AGENTMAIL_DATABASE_FILE } from "../config/paths";
import { openDatabase, queryConversationBySession } from "../storage/database";
import {
  listProfiles,
  listSessionsForProfile,
  listAllSenders,
  listSessionsForSender,
  readMessageBody,
  readAttachment,
  getDispatchSummary,
  listDispatchQueueItems,
  retryDispatchJobs,
  getOpenClawMailSessions,
  getApolloUsageSummary,
  getBridgeLogEntries,
  getDispatchBindings,
  getSystemConfig,
  runDoctor,
  tailLogFile,
  getProfileEnvDetails,
  getHookContent,
  getWatcherInfo,
  getDatabaseStats,
  getStorageStats,
  triggerPoll,
  updatePollingConfig,
  updateDispatchBinding,
  saveHookContent,
  rebuildProfileIndex,
  installServices,
  uninstallServices,
  sendTestEmail,
  createAccountProfile,
  updateProfileEnv
} from "./queries";
import { INBOX_HTML } from "./templates";
import { deflateSync } from "node:zlib";

// --- PWA Icon Generation ---
const _crcT = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; _crcT[n] = c; }
function _crc(b: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = _crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function _pngChunk(t: string, d: Uint8Array): Uint8Array {
  const o = new Uint8Array(12 + d.length); const v = new DataView(o.buffer);
  v.setUint32(0, d.length); for (let i = 0; i < 4; i++) o[4 + i] = t.charCodeAt(i);
  o.set(d, 8); v.setUint32(8 + d.length, _crc(o.subarray(4, 8 + d.length))); return o;
}
function _makePng(sz: number): Uint8Array {
  const rL = 1 + sz * 3, raw = new Uint8Array(rL * sz);
  const G = [0x1c, 0x02, 0x1e, 0x22, 0x22, 0x1d], gW = 6, gH = 6;
  const sc = Math.floor(sz * 0.5 / gH), ox = (sz - gW * sc) >> 1, oy = (sz - gH * sc) >> 1;
  for (let y = 0; y < sz; y++) { raw[y * rL] = 0; for (let x = 0; x < sz; x++) {
    const o = y * rL + 1 + x * 3, gx = Math.floor((x - ox) / sc), gy = Math.floor((y - oy) / sc);
    const lit = gx >= 0 && gx < gW && gy >= 0 && gy < gH && (G[gy] & (1 << (gW - 1 - gx))) !== 0;
    raw[o] = lit ? 0x58 : 0x0d; raw[o + 1] = lit ? 0xa6 : 0x11; raw[o + 2] = lit ? 0xff : 0x17;
  }}
  const z = deflateSync(Buffer.from(raw));
  const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ih = new Uint8Array(13); const dv = new DataView(ih.buffer);
  dv.setUint32(0, sz); dv.setUint32(4, sz); ih[8] = 8; ih[9] = 2;
  const parts = [sig, _pngChunk("IHDR", ih), _pngChunk("IDAT", new Uint8Array(z)), _pngChunk("IEND", new Uint8Array(0))];
  let len = 0; for (const p of parts) len += p.length;
  const out = new Uint8Array(len); let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; } return out;
}
const icon192 = _makePng(192);
const icon512 = _makePng(512);

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export interface InboxServerOptions {
  port?: number;
  hostname?: string;
  databaseFile?: string;
}

export async function startInboxServer(options: InboxServerOptions = {}): Promise<void> {
  const port = options.port ?? 8025;
  const hostname = options.hostname ?? "127.0.0.1";
  const databaseFile = options.databaseFile ?? AGENTMAIL_DATABASE_FILE;

  const db = openDatabase(databaseFile);

  const server = Bun.serve({
    port,
    hostname,
    async fetch(request) {
      const url = new URL(request.url);
      const pathname = url.pathname;

      try {
        if (pathname === "/") {
          return new Response(INBOX_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" }
          });
        }

        if (pathname === "/manifest.json") {
          return new Response(JSON.stringify({
            name: "agentmail inbox",
            short_name: "agentmail",
            start_url: "/",
            display: "standalone",
            background_color: "#0d1117",
            theme_color: "#0d1117",
            icons: [
              { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
              { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
            ]
          }), { headers: { "Content-Type": "application/json" } });
        }

        if (pathname === "/sw.js") {
          return new Response(
            "self.addEventListener('fetch',function(e){e.respondWith(fetch(e.request).catch(function(){return caches.match(e.request)}))});",
            { headers: { "Content-Type": "application/javascript" } }
          );
        }

        if (pathname === "/icon-192.png") {
          return new Response(icon192, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
        }

        if (pathname === "/icon-512.png") {
          return new Response(icon512, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
        }

        if (pathname === "/api/profiles") {
          return jsonResponse(listProfiles(db));
        }

        const profileMatch = pathname.match(/^\/api\/profiles\/([^/]+)\/sessions$/);
        if (profileMatch) {
          const profileId = decodeURIComponent(profileMatch[1]);
          return jsonResponse(listSessionsForProfile(db, profileId));
        }

        const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
        if (sessionMatch) {
          const sessionId = decodeURIComponent(sessionMatch[1]);
          return jsonResponse(queryConversationBySession(sessionId, undefined, databaseFile));
        }

        if (pathname === "/api/messages/body") {
          const dirParam = url.searchParams.get("dir");
          if (!dirParam) {
            return jsonResponse({ error: "Missing dir parameter" }, 400);
          }
          const messageDir = Buffer.from(dirParam, "base64url").toString("utf8");
          const body = await readMessageBody(messageDir);
          return jsonResponse(body);
        }

        if (pathname === "/api/messages/attachment") {
          const dirParam = url.searchParams.get("dir");
          const filePath = url.searchParams.get("path");
          if (!dirParam || !filePath) {
            return jsonResponse({ error: "Missing dir or path parameter" }, 400);
          }
          const messageDir = Buffer.from(dirParam, "base64url").toString("utf8");
          const { data, filename } = await readAttachment(messageDir, filePath);
          return new Response(data, {
            headers: {
              "Content-Disposition": `attachment; filename="${filename}"`,
              "Content-Type": "application/octet-stream"
            }
          });
        }

        if (pathname === "/api/dispatch/summary") {
          return jsonResponse(getDispatchSummary(db));
        }

        if (pathname === "/api/dispatch/queue") {
          const statusParam = url.searchParams.get("status");
          const statuses = statusParam ? statusParam.split(",").filter(Boolean) : undefined;
          const includeStalled = url.searchParams.get("stalled") === "true";
          const limitParam = url.searchParams.get("limit");
          const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
          return jsonResponse(listDispatchQueueItems(db, { statuses, includeStalled, limit }));
        }

        if (pathname === "/api/dispatch/retry" && request.method === "POST") {
          const includeDeadletter = url.searchParams.get("include-deadletter") === "true";
          const retried = retryDispatchJobs(db, { includeDeadletter });
          return jsonResponse({ retried });
        }

        if (pathname === "/api/senders") {
          return jsonResponse(listAllSenders(db));
        }

        const senderMatch = pathname.match(/^\/api\/senders\/([^/]+)\/sessions$/);
        if (senderMatch) {
          const peerEmail = decodeURIComponent(senderMatch[1]);
          return jsonResponse(listSessionsForSender(db, peerEmail));
        }

        if (pathname === "/api/openclaw/sessions") {
          const sessions = await getOpenClawMailSessions();
          return jsonResponse(sessions);
        }

        if (pathname === "/api/openclaw/bindings") {
          const bindings = await getDispatchBindings();
          return jsonResponse(bindings);
        }

        if (pathname === "/api/apollo/usage") {
          return jsonResponse(getApolloUsageSummary());
        }

        if (pathname === "/api/config") {
          const config = await getSystemConfig(db);
          return jsonResponse(config);
        }

        if (pathname === "/api/bridge/log") {
          const limitParam = url.searchParams.get("limit");
          const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
          const entries = await getBridgeLogEntries(limit);
          return jsonResponse(entries);
        }

        // --- Configuration page endpoints ---

        if (pathname === "/api/config/doctor") {
          const report = await runDoctor(db);
          return jsonResponse(report);
        }

        if (pathname === "/api/config/logs") {
          const profile = url.searchParams.get("profile");
          const type = url.searchParams.get("type");
          const linesParam = url.searchParams.get("lines");
          if (!profile || !type) {
            return jsonResponse({ error: "Missing profile or type parameter" }, 400);
          }
          if (type !== "receive" && type !== "dispatch" && type !== "bridge") {
            return jsonResponse({ error: "Invalid log type" }, 400);
          }
          const lines = linesParam ? Number.parseInt(linesParam, 10) : 200;
          const logLines = await tailLogFile(profile, type, lines);
          return jsonResponse(logLines);
        }

        const envMatch = pathname.match(/^\/api\/config\/env\/([^/]+)$/);
        if (envMatch) {
          const profileId = decodeURIComponent(envMatch[1]);
          const details = await getProfileEnvDetails(profileId);
          return jsonResponse(details);
        }

        const hookGetMatch = pathname.match(/^\/api\/config\/hook\/([^/]+)$/);
        if (hookGetMatch && request.method === "GET") {
          const profileId = decodeURIComponent(hookGetMatch[1]);
          const hook = await getHookContent(profileId);
          return jsonResponse(hook);
        }

        const hookPostMatch = pathname.match(/^\/api\/config\/hook\/([^/]+)$/);
        if (hookPostMatch && request.method === "POST") {
          const profileId = decodeURIComponent(hookPostMatch[1]);
          const body = await request.json() as { content?: string };
          if (typeof body.content !== "string") {
            return jsonResponse({ error: "Missing content" }, 400);
          }
          await saveHookContent(profileId, body.content);
          return jsonResponse({ ok: true });
        }

        const watcherMatch = pathname.match(/^\/api\/config\/watcher\/([^/]+)$/);
        if (watcherMatch) {
          const profileId = decodeURIComponent(watcherMatch[1]);
          const info = await getWatcherInfo(profileId);
          return jsonResponse(info);
        }

        if (pathname === "/api/config/db-stats") {
          const stats = await getDatabaseStats(db);
          return jsonResponse(stats);
        }

        if (pathname === "/api/config/storage-stats") {
          const stats = await getStorageStats();
          return jsonResponse(stats);
        }

        if (pathname === "/api/config/poll-trigger" && request.method === "POST") {
          const body = await request.json() as { profileId?: string };
          if (!body.profileId) {
            return jsonResponse({ error: "Missing profileId" }, 400);
          }
          const result = await triggerPoll(body.profileId);
          return jsonResponse(result);
        }

        if (pathname === "/api/config/polling" && request.method === "POST") {
          const body = await request.json() as { profileId?: string; mailbox?: string; intervalSeconds?: number };
          if (!body.profileId) {
            return jsonResponse({ error: "Missing profileId" }, 400);
          }
          const result = await updatePollingConfig(body.profileId, body.mailbox, body.intervalSeconds);
          return jsonResponse(result);
        }

        if (pathname === "/api/config/binding" && request.method === "POST") {
          const body = await request.json() as { profileId?: string; agentId?: string; enabled?: boolean };
          if (!body.profileId || !body.agentId || typeof body.enabled !== "boolean") {
            return jsonResponse({ error: "Missing profileId, agentId, or enabled" }, 400);
          }
          await updateDispatchBinding(body.profileId, body.agentId, body.enabled);
          return jsonResponse({ ok: true });
        }

        if (pathname === "/api/config/index-rebuild" && request.method === "POST") {
          const body = await request.json() as { profileId?: string };
          if (!body.profileId) {
            return jsonResponse({ error: "Missing profileId" }, 400);
          }
          const result = await rebuildProfileIndex(body.profileId);
          return jsonResponse(result);
        }

        if (pathname === "/api/config/services/install" && request.method === "POST") {
          const result = await installServices();
          return jsonResponse(result);
        }

        if (pathname === "/api/config/services/uninstall" && request.method === "POST") {
          const result = await uninstallServices();
          return jsonResponse(result);
        }

        if (pathname === "/api/config/account-create" && request.method === "POST") {
          const body = (await request.json()) as Record<string, unknown>;
          if (!body.name || !body.smtpHost || !body.smtpUser || !body.smtpPass || !body.imapHost || !body.imapUser || !body.imapPass) {
            return jsonResponse({ error: "Missing required fields" }, 400);
          }
          const result = await createAccountProfile(body as any);
          return jsonResponse(result);
        }

        if (pathname === "/api/config/env-update" && request.method === "POST") {
          const body = (await request.json()) as { profileId?: string; fields?: Record<string, unknown> };
          if (!body.profileId || !body.fields) {
            return jsonResponse({ error: "Missing profileId or fields" }, 400);
          }
          await updateProfileEnv(body.profileId, body.fields as any);
          return jsonResponse({ ok: true });
        }

        if (pathname === "/api/config/send-test" && request.method === "POST") {
          const body = await request.json() as { profileId?: string; to?: string; subject?: string; text?: string };
          if (!body.profileId || !body.to || !body.subject || !body.text) {
            return jsonResponse({ error: "Missing profileId, to, subject, or text" }, 400);
          }
          const result = await sendTestEmail(body.profileId, body.to, body.subject, body.text);
          return jsonResponse(result);
        }

        return new Response("Not Found", { status: 404 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResponse({ error: message }, 500);
      }
    }
  });

  console.log(`[INFO] Inbox viewer running at http://${hostname}:${port}`);
  console.log("[INFO] Press Ctrl+C to stop");

  return new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      server.stop();
      db.close();
      resolve();
    });
  });
}
