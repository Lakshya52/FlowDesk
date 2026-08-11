import os from "os";
import { getOverviewStats } from "./superAdminStats";

const HEAVY_REFRESH_MS = 30_000;
const ROOM = "super_admin_room";
const TICK_MS = 1000;
const STATS_MS = 30_000;

let statsTimer: ReturnType<typeof setInterval> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let cachedOverview: any = null;
let lastHeavyRefresh = 0;
let inFlight: Promise<any> | null = null;

// Cache-busting heavy overview: stats run only when super admins are online,
// and the full payload is re-pushed the moment one connects.
const heavyOverview = async (force = false): Promise<any> => {
  const now = Date.now();
  if (!force && cachedOverview && now - lastHeavyRefresh < HEAVY_REFRESH_MS) {
    return cachedOverview;
  }
  if (inFlight && !force) return inFlight;
  const run = getOverviewStats()
    .then((o) => {
      cachedOverview = o;
      lastHeavyRefresh = Date.now();
      return o;
    })
    .finally(() => {
      inFlight = null;
    });
  if (!force) inFlight = run;
  return run;
};

const buildStatsPayload = async (force = false): Promise<any> => {
  const base = await heavyOverview(force);
  const { activeUsers } = await import("../index");
  const online = activeUsers.size;
  const mem = process.memoryUsage();
  return {
    ...base,
    generatedAt: new Date(),
    counts: base.counts
      ? {
          ...base.counts,
          users: base.counts.users
            ? { ...base.counts.users, online }
            : base.counts.users,
        }
      : base.counts,
    system: base.system
      ? {
          ...base.system,
          serverTime: new Date(),
          uptimeSeconds: process.uptime(),
          memory: {
            rss: mem.rss,
            heapUsed: mem.heapUsed,
            heapTotal: mem.heapTotal,
            external: mem.external,
            total: os.totalmem(),
          },
        }
      : base.system,
  };
};

const broadcastStats = async () => {
  try {
    const { io } = await import("../index");
    const room = io.sockets.adapter.rooms.get(ROOM);
    if (!room || room.size === 0) return; // no super admin online → skip work
    io.to(ROOM).emit("super_admin:stats", await buildStatsPayload());
  } catch (error) {
    console.error("[SuperAdminRT] stats broadcast error:", error);
  }
};

const broadcastTick = async () => {
  try {
    const { io, activeUsers } = await import("../index");
    const room = io.sockets.adapter.rooms.get(ROOM);
    if (!room || room.size === 0) return; // no super admin online → skip work
    const mem = process.memoryUsage();
    io.to(ROOM).emit("super_admin:tick", {
      generatedAt: new Date(),
      online: activeUsers.size,
      system: {
        uptimeSeconds: process.uptime(),
        serverTime: new Date(),
        memory: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          external: mem.external,
          total: os.totalmem(),
        },
      },
    });
  } catch (error) {
    console.error("[SuperAdminRT] tick error:", error);
  }
};

// Push a freshly-computed full payload to a single socket (used on connect).
export const emitOverviewToSocket = async (socket: any): Promise<void> => {
  try {
    socket.emit("super_admin:stats", await buildStatsPayload(true));
  } catch (error) {
    console.error("[SuperAdminRT] connect push error:", error);
  }
};

export const startSuperAdminBroadcast = () => {
  if (statsTimer && tickTimer) return;
  broadcastStats();
  broadcastTick();
  statsTimer = setInterval(broadcastStats, STATS_MS);
  tickTimer = setInterval(broadcastTick, TICK_MS);
  console.log("[SuperAdminRT] Tick every 1s, stats reconciliation every 30s (idle when no super admin online)");
};

export const stopSuperAdminBroadcast = () => {
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
};
