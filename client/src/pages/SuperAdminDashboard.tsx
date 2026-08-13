import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import api from "../lib/api";

// const styleBlock = `
// @keyframes cr-blink {
//   0%, 100% { opacity: 1; }
//   50% { opacity: 0.35; }
// }
// @keyframes cr-scan {
//   0% { transform: translateY(-100%); }
//   100% { transform: translateY(400%); }
// }
// @keyframes cr-flash {
//   0% { background: rgba(63, 214, 138, 0.25); }
//   100% { background: transparent; }
// }
// .cr-led { display: inline-block; border-radius: 50%; }
// .cr-scanline { position: absolute; left: 0; right: 0; height: 40%; background: linear-gradient(180deg, transparent, rgba(120,180,255,0.06), transparent); animation: cr-scan 6s linear infinite; pointer-events: none; }
// .cr-num { font-family: "Consolas", "SF Mono", "Menlo", "Roboto Mono", monospace; font-variant-numeric: tabular-nums; }
// .cr-event-new { animation: cr-flash 1.2s ease-out; border-radius: 4px; }
// `;

const C = {
  bg: "#0b0d10",
  panel: "linear-gradient(180deg, #1d232b 0%, #151a20 55%, #12161b 100%)",
  panelInner: "linear-gradient(180deg, #0f1419 0%, #0b0f13 100%)",
  bezel: "#39424e",
  bezelDark: "#05070a",
  text: "#d6dce3",
  dim: "#8b94a2",
  faint: "#5c6572",
  green: "#3fd68a",
  amber: "#f0a63a",
  red: "#ef5555",
  blue: "#4da3ff",
  purple: "#a78bfa",
  silver: "#9aa5b1",
};

const PAD = (n: number, len = 2) => String(n).padStart(len, "0");

const formatBytes = (n: number) => {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log2(n) / 10), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
};

const formatDuration = (sec: number) => {
  const s = Math.floor(sec || 0);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${d > 0 ? `${d}d ` : ""}${PAD(h)}:${PAD(m)}:${PAD(ss)}`;
};

const formatDate = (v?: string | Date | null) => {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return `${PAD(d.getDate())}/${PAD(d.getMonth() + 1)}/${d.getFullYear()} ${PAD(d.getHours())}:${PAD(d.getMinutes())}:${PAD(d.getSeconds())}`;
};

const timeAgo = (v?: string | Date | null) => {
  if (!v) return "—";
  const diff = Date.now() - new Date(v).getTime();
  if (diff < 0) return "in future";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

const pct = (a?: number, b?: number) => {
  if (!a || !b || b <= 0) return 0;
  return Math.min(Math.max((a / b) * 100, 0), 100);
};

const Panel: React.FC<{
  title?: string;
  accent?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ title, accent = C.blue, children, style }) => (
  <div
    style={{
      position: "relative",
      background: C.panel,
      border: `1px solid ${C.bezel}`,
      borderRadius: 10,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px ${C.bezelDark}`,
      overflow: "hidden",
      ...style,
    }}
  >
    <div
      style={{
        position: "absolute",
        top: -3,
        left: -3,
        right: -3,
        height: 6,
        background: `linear-gradient(90deg, ${accent}66, ${accent}, ${accent}66)`,
        opacity: 0.85,
      }}
    />
    {["-4px -4px", "-4px calc(100% - 6px)", "calc(100% - 6px) -4px", "calc(100% - 6px) calc(100% - 6px)"].map(
      (pos, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: pos.split(" ")[0],
            left: pos.split(" ")[1],
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, #5a6472, #232a33 70%)",
            boxShadow: "inset 0 -1px 2px rgba(0,0,0,0.8)",
            zIndex: 2,
          }}
        />
      ),
    )}
    {title && (
      <div
        style={{
          padding: "10px 14px 8px",
          borderBottom: "1px solid #05070a",
          boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: accent,
            boxShadow: `0 0 8px ${accent}`,
          }}
        />
        <span
          style={{
            color: C.text,
            fontSize: "0.7rem",
            letterSpacing: "0.18em",
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
      </div>
    )}
    <div style={{ padding: 14, position: "relative" }}>{children}</div>
  </div>
);

const LED: React.FC<{ color: string; blink?: boolean; size?: number }> = ({
  color,
  blink,
  size = 9,
}) => (
  <span
    className="cr-led"
    style={{
      width: size,
      height: size,
      background: color,
      boxShadow: `0 0 8px ${color}, inset 0 0 4px rgba(255,255,255,0.5)`,
      animation: blink ? "cr-blink 1.4s ease-in-out infinite" : undefined,
    }}
  />
);

const DigitalReadout: React.FC<{
  label: string;
  value: React.ReactNode;
  color?: string;
  unit?: string;
  sub?: React.ReactNode;
}> = ({ label, value, color = C.blue, unit, sub }) => (
  <div
    style={{
      background: C.panelInner,
      border: "1px solid #0a0e13",
      borderRadius: 8,
      boxShadow: "inset 0 2px 6px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.05)",
      padding: "10px 12px",
    }}
  >
    <div
      style={{
        color: C.faint,
        fontSize: "0.6rem",
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        marginBottom: 4,
      }}
    >
      {label}
    </div>
    <div className="cr-num" style={{ color, fontSize: "1.35rem", fontWeight: 700, lineHeight: 1 }}>
      {value}
      {unit && (
        <span style={{ fontSize: "0.7rem", fontWeight: 400, marginLeft: 4, color: C.dim }}>
          {unit}
        </span>
      )}
    </div>
    {sub && <div style={{ marginTop: 6, color: C.dim, fontSize: "0.7rem" }}>{sub}</div>}
  </div>
);

const Gauge: React.FC<{
  value: number;
  label: string;
  color: string;
  display: string;
  unit?: string;
}> = ({ value, label, color, display, unit }) => {
  const angle = (Math.min(Math.max(value, 0), 100) / 100) * 180 - 90;
  const a0 = (-90 * Math.PI) / 180;
  const a1 = (90 * Math.PI) / 180;
  const r = 78;
  const cx = 100;
  const cy = 100;
  const arc = (from: number, to: number, radius: number) => {
    const x1 = cx + radius * Math.cos(from);
    const y1 = cy + radius * Math.sin(from);
    const x2 = cx + radius * Math.cos(to);
    const y2 = cy + radius * Math.sin(to);
    const large = to - from > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };
  const frac = Math.min(Math.max(value, 0), 100) / 100;
  const valEnd = a0 + frac * (a1 - a0);
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const ta = a0 + (i / 10) * (a1 - a0);
    const x1 = cx + (r - 8) * Math.cos(ta);
    const y1 = cy + (r - 8) * Math.sin(ta);
    const x2 = cx + (r - 1) * Math.cos(ta);
    const y2 = cy + (r - 1) * Math.sin(ta);
    return { x1, y1, x2, y2 };
  });
  const needleR = r - 12;
  const nx = cx + needleR * Math.cos((angle * Math.PI) / 180); // added - Math.PI / 2 for straight angle 
  const ny = cy + needleR * Math.sin((angle * Math.PI) / 180);
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 200 200" style={{ width: "100%", maxWidth: 210, height: "fit-content", rotate: "-90deg" }}>
        <path d={arc(a0, a1, r)} fill="none" stroke="#05070a" strokeWidth={13} strokeLinecap="round" />
        <path
          d={arc(a0, valEnd, r)}
          fill="none"
          stroke={color}
          strokeWidth={13}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={i <= Math.round(frac * 10) ? color : "#39424e"}
            strokeWidth={1.5}
          />
        ))}
        <circle cx={cx} cy={cy} r={7} fill="#0b0e12" stroke={color} strokeWidth={2} />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={C.text} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={2.5} fill={C.text} />
      </svg>
      <div style={{ marginTop: -6 }}>
        <div className="cr-num" style={{ color, fontSize: "1.5rem", fontWeight: 700 }}>
          {display}
          {unit && (
            <span style={{ fontSize: "0.7rem", fontWeight: 400, marginLeft: 4, color: C.dim }}>
              {unit}
            </span>
          )}
        </div>
        <div
          style={{
            color: C.dim,
            fontSize: "0.62rem",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            marginTop: 2,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
};

const SegMeter: React.FC<{ value: number; color: string }> = ({ value, color }) => {
  const segs = 14;
  const filled = Math.round((Math.min(Math.max(value, 0), 100) / 100) * segs);
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {Array.from({ length: segs }, (_, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            height: 10,
            borderRadius: 2,
            background: i < filled ? color : "#1a2027",
            boxShadow: i < filled ? `0 0 5px ${color}` : "inset 0 1px 2px rgba(0,0,0,0.6)",
          }}
        />
      ))}
    </div>
  );
};

const Toggle: React.FC<{
  on: boolean;
  onChange?: (v: boolean) => void;
  readOnly?: boolean;
  color?: string;
}> = ({ on, onChange, readOnly, color = C.green }) => (
  <div
    onClick={() => !readOnly && onChange?.(!on)}
    style={{
      width: 54,
      height: 26,
      borderRadius: 13,
      background: on ? `${color}33` : "#0c1014",
      border: `2px solid ${on ? color : C.bezel}`,
      boxShadow: on ? `inset 0 0 8px ${color}55, 0 0 6px ${color}33` : "inset 0 2px 6px rgba(0,0,0,0.7)",
      position: "relative",
      cursor: readOnly ? "default" : "pointer",
      transition: "all 0.2s ease",
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 1,
        left: on ? 28 : 2,
        width: 20,
        height: 20,
        borderRadius: 10,
        background: on
          ? `radial-gradient(circle at 40% 35%, #ffffff, ${color})`
          : "radial-gradient(circle at 40% 35%, #6b7582, #2a313a)",
        boxShadow: "0 2px 5px rgba(0,0,0,0.6)",
        transition: "left 0.2s ease",
      }}
    />
  </div>
);

const StatusRow: React.FC<{
  label: string;
  value: string;
  color?: string;
  blink?: boolean;
}> = ({ label, value, color = C.green, blink }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
    <LED color={color} blink={blink} size={7} />
    <span style={{ color: C.dim, fontSize: "0.66rem", letterSpacing: "0.12em", textTransform: "uppercase", width: 96, flexShrink: 0 }}>
      {label}
    </span>
    <span className="cr-num" style={{ color: C.text, fontSize: "0.78rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {value}
    </span>
  </div>
);

const Badge: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.silver }) => (
  <span
    style={{
      fontSize: "0.62rem",
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      padding: "2px 7px",
      borderRadius: 4,
      color,
      border: `1px solid ${color}44`,
      background: `${color}14`,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

const PLAN_COLORS: Record<string, string> = {
  free: C.silver,
  starter: C.green,
  pro: C.blue,
  enterprise: C.purple,
};

interface TenantView {
  _id: string;
  name: string;
  plan: string;
  isActive: boolean;
  createdAt?: string;
  userCount: number;
  owner?: { name?: string; email?: string } | null;
}

interface BlueprintView {
  _id: string;
  title: string;
  pattern?: string | null;
  time?: string | null;
  paused: boolean;
  weekdays?: number[];
  maxInstances?: number | null;
  instanceCount: number;
  nextSpawnAt?: string | null;
  createdBy?: { tenant?: string | null } | null;
}

interface LogView {
  _id: string;
  createdAt?: string;
  action?: string;
  entityType?: string;
  user?: { name?: string } | null;
}

interface LiveEvent {
  id: number;
  at?: string;
  type: string;
  entityType?: string;
  action?: string;
  entityId?: string;
  title?: string | null;
  user?: { name?: string; email?: string; role?: string } | null;
  tenant?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface TickPayload {
  generatedAt?: string;
  online?: number;
  system?: {
    uptimeSeconds?: number;
    serverTime?: string;
    memory?: { rss?: number; heapUsed?: number; heapTotal?: number; external?: number; total?: number };
  };
}

interface OverviewCounts {
  tenants?: { total?: number; active?: number };
  users?: { total?: number; active?: number; online?: number; new7d?: number; new30d?: number };
  assignments?: { total?: number; byStatus?: Record<string, number>; blueprints?: number; instances?: number };
  tasks?: { total?: number; overdue?: number; byStatus?: Record<string, number> };
  backups?: { total?: number; active?: number };
  activity?: { last24h?: number; last7d?: number };
  teams?: number;
  companies?: number;
  contacts?: number;
  leads?: number;
  campaigns?: number;
  fieldVisits?: number;
  messages?: number;
  comments?: number;
}

interface OverviewSystem {
  memory?: { rss?: number; heapUsed?: number; heapTotal?: number; external?: number; total?: number };
  uptimeSeconds?: number;
  serverTime?: string;
  timezone?: string;
  db?: { connected?: boolean; name?: string; host?: string; collections?: number };
  recurring?: { nextTickAt?: string | null; lastScanAt?: string | null; running?: boolean };
  backup?: { nextBackupAt?: string | null } | null;
  node?: string;
  platform?: string;
  arch?: string;
  pid?: number;
  cpus?: number;
  nodeEnv?: string;
}

interface OverviewShape {
  success?: boolean;
  generatedAt?: string;
  counts?: OverviewCounts;
  system?: OverviewSystem;
  storage?: { dbBytes?: number; uploadsCount?: number; uploadsBytes?: number; uploadChunks?: number };
}

// Optimistic counter updates driven by the live event stream.
// The 30s full-stats broadcast + REST refetch act as reconciliation.
const applyLiveEvent = (
  ev: LiveEvent,
  old: OverviewShape | undefined,
): OverviewShape | undefined => {
  if (!old || !old.counts) return old;
  const c: OverviewCounts = JSON.parse(JSON.stringify(old.counts));
  const bump = (n: number | undefined, d: number) => Math.max(0, (n || 0) + d);

  // Status moves are logged by controllers as changes: { old, new }.
  const changes = (ev.metadata as Record<string, any> | null | undefined)?.changes || {};
  const newStatus: string | undefined = changes.status?.new;
  const oldStatus: string | undefined = changes.status?.old;

  // Every discrete event is platform activity (reconciled by the 30s stats push).
  c.activity = {
    ...(c.activity || {}),
    last24h: bump(c.activity?.last24h, 1),
  };

  if (ev.type === "activity") {
    const up = /create|add|assign|spawn|register/i.test(ev.action || "");
    const down = /delete|remove/i.test(ev.action || "");
    const d = up ? 1 : down ? -1 : 0;
    const isStatusMove = !up && !down && oldStatus && newStatus && oldStatus !== newStatus;
    switch (ev.entityType) {
      case "assignment": {
        const bs = { ...(c.assignments?.byStatus || {}) };
        if (d > 0) bs[newStatus || "not_started"] = bump(bs[newStatus || "not_started"], 1);
        if (d < 0 && oldStatus) bs[oldStatus] = bump(bs[oldStatus], -1);
        if (isStatusMove) {
          bs[oldStatus] = bump(bs[oldStatus], -1);
          bs[newStatus] = bump(bs[newStatus], 1);
        }
        c.assignments = {
          ...(c.assignments || {}),
          total: bump(c.assignments?.total, d),
          byStatus: bs,
        };
        break;
      }
      case "task": {
        const ts = { ...(c.tasks?.byStatus || {}) };
        if (d > 0) ts[newStatus || "todo"] = bump(ts[newStatus || "todo"], 1);
        if (d < 0 && oldStatus) ts[oldStatus] = bump(ts[oldStatus], -1);
        if (isStatusMove) {
          ts[oldStatus] = bump(ts[oldStatus], -1);
          ts[newStatus] = bump(ts[newStatus], 1);
        }
        c.tasks = {
          ...(c.tasks || {}),
          total: bump(c.tasks?.total, d),
          byStatus: ts,
        };
        break;
      }
      case "team":
        c.teams = bump(c.teams, d);
        break;
      case "company":
        c.companies = bump(c.companies, d);
        break;
      case "contact":
        c.contacts = bump(c.contacts, d);
        break;
      case "lead":
        c.leads = bump(c.leads, d);
        break;
      case "campaign":
        c.campaigns = bump(c.campaigns, d);
        break;
      case "comment":
        c.comments = bump(c.comments, d);
        break;
      case "user":
        if (d !== 0) {
          c.users = {
            ...(c.users || {}),
            total: bump(c.users?.total, d),
            active: bump(c.users?.active, d),
          };
        }
        break;
    }
  } else if (ev.type === "user_login") {
    // Online count is driven by the 1s tick (multi-tab safe); nothing else to bump here.
  } else if (ev.type === "tenant_registered") {
    c.tenants = {
      ...(c.tenants || {}),
      total: bump(c.tenants?.total, 1),
      active: bump(c.tenants?.active, 1),
    };
    c.users = {
      ...(c.users || {}),
      total: bump(c.users?.total, 1),
      active: bump(c.users?.active, 1),
      new7d: bump(c.users?.new7d, 1),
      new30d: bump(c.users?.new30d, 1),
    };
  } else if (ev.type === "blueprint_spawn") {
    const bs = { ...(c.assignments?.byStatus || {}) };
    bs["not_started"] = bump(bs["not_started"], 1);
    c.assignments = {
      ...(c.assignments || {}),
      total: bump(c.assignments?.total, 1),
      instances: bump(c.assignments?.instances, 1),
      byStatus: bs,
    };
  } else if (ev.type === "backup_completed") {
    c.backups = {
      ...(c.backups || {}),
      total: bump(c.backups?.total, 1),
    };
  }

  return { ...old, counts: c };
};

const SuperAdminDashboard: React.FC = () => {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [now, setNow] = useState(new Date());
  const [socketLive, setSocketLive] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let socket: ReturnType<typeof io> | null = null;
    try {
      const token = localStorage.getItem("flowdesk_token");
      const url = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
      socket = io(url, { auth: { token } });
      socket.on("connect", () => setSocketLive(true));
      socket.on("disconnect", () => setSocketLive(false));

      // Full snapshot: pushed on connect + every 30s (reconciliation).
      socket.on("super_admin:stats", (payload: unknown) => {
        queryClient.setQueryData(["sa-overview"], () => payload as OverviewShape);
      });

      // Lightweight 1s gauge tick: memory / uptime / server time / online.
      socket.on("super_admin:tick", (payload: unknown) => {
        const tick = payload as TickPayload;
        if (!tick.system) return;
        queryClient.setQueryData(["sa-overview"], (old: OverviewShape | undefined) => {
          if (!old) return old;
          return {
            ...old,
            counts: old.counts
              ? {
                  ...old.counts,
                  users: old.counts.users
                    ? { ...old.counts.users, online: tick.online ?? old.counts.users.online }
                    : old.counts.users,
                }
              : old.counts,
            system: { ...old.system, ...tick.system },
          };
        });
      });

      // Instant discrete events: live feed + optimistic counter deltas.
      socket.on("super_admin:event", (payload: unknown) => {
        const ev = payload as LiveEvent;
        setLiveEvents((prev) => [ev, ...prev].slice(0, 80));
        queryClient.setQueryData(["sa-overview"], (old: OverviewShape | undefined) =>
          applyLiveEvent(ev, old),
        );
      });
    } catch {
      // live feed socket is optional; page still works via polling
    }
    return () => {
      if (socket) {
        socket.off("super_admin:stats");
        socket.off("super_admin:tick");
        socket.off("super_admin:event");
        socket.off("connect");
        socket.off("disconnect");
        socket.disconnect();
      }
    };
  }, [queryClient]);

  const { data: ov, isLoading } = useQuery({
    queryKey: ["sa-overview"],
    queryFn: async () => (await api.get("/super-admin/overview")).data,
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const { data: tenantsData } = useQuery({
    queryKey: ["sa-tenants"],
    queryFn: async () => (await api.get("/super-admin/tenants")).data,
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const { data: blueprintsData } = useQuery({
    queryKey: ["sa-blueprints"],
    queryFn: async () => (await api.get("/super-admin/blueprints")).data,
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const { data: activityData } = useQuery({
    queryKey: ["sa-activity"],
    queryFn: async () => (await api.get("/super-admin/activity?limit=40")).data,
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const tenants = tenantsData?.tenants ?? [];
  const blueprints = blueprintsData?.blueprints ?? [];
  const logs = activityData?.logs ?? [];

  const counts = ov?.counts;
  const system = ov?.system;
  const storage = ov?.storage;

  const dbOk = !!system?.db?.connected;
  const ramPct = pct(system?.memory?.rss, system?.memory?.total);
  const heapPct = pct(system?.memory?.heapUsed, system?.memory?.heapTotal);
  const activeProjects = Math.max(
    0,
    (counts?.assignments?.total || 0) - (counts?.assignments?.byStatus?.completed || 0),
  );
  const projectsPct = pct(activeProjects, counts?.assignments?.total);
  const onlinePct = pct(counts?.users?.online, counts?.users?.active);

  const refreshAll = () => {
    window.location.reload();
  };

  if (isLoading && !ov) {
    return (
      <div style={{ background: C.bg, minHeight: "80vh", borderRadius: 14, border: `1px solid ${C.bezel}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="cr-num" style={{ color: C.amber, letterSpacing: "0.2em", animation: "cr-blink 1.2s infinite" }}>
          BOOTING SYSTEMS…
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 130px)", borderRadius: 14, border: `1px solid ${C.bezel}`, padding: 18, color: C.text, fontFamily: '"Inter", system-ui, sans-serif', position: "relative" }}>
      {/* <style>{styleBlock}</style> */}
      {/* <div className="cr-scanline" /> */}

      {/* ============ TOP BAR ============ */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 8,
              background: "radial-gradient(circle at 35% 30%, #2a3440, #12161b)",
              border: `1px solid ${C.bezel}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6)",
            }}
          >
            <LED color={C.green} blink size={12} />
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Super Admin · System Control Room
            </div>
            <div className="cr-num" style={{ color: C.dim, fontSize: "0.68rem", marginTop: 2 }}>
              FLOWDESK PLATFORM · GLOBAL TELEMETRY
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ textAlign: "right" }}>
            <div className="cr-num" style={{ fontSize: "1.05rem", color: C.green, fontWeight: 700 }}>
              {PAD(now.getHours())}:{PAD(now.getMinutes())}:{PAD(now.getSeconds())}
            </div>
            <div style={{ color: C.faint, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Local · {system?.timezone || "UTC"}
            </div>
          </div>
          <div
            style={{
              width: 1,
              height: 34,
              background: C.bezel,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ color: C.faint, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Auto refresh
            </div>
            <Toggle on={autoRefresh} onChange={setAutoRefresh} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
            <div style={{ color: C.faint, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Live feed
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <LED color={socketLive ? C.green : C.red} blink={socketLive} size={8} />
              <span className="cr-num" style={{ color: socketLive ? C.green : C.red, fontSize: "0.72rem", fontWeight: 700 }}>
                {socketLive ? "LIVE" : "OFFLINE"}
              </span>
            </span>
          </div>
          <button
            onClick={refreshAll}
            style={{
              background: "linear-gradient(180deg, #232b35, #151a20)",
              border: `1px solid ${C.bezel}`,
              color: C.text,
              borderRadius: 7,
              padding: "10px 16px",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 3px 8px rgba(0,0,0,0.4)",
            }}
          >
            ⟳ Re-sync
          </button>
        </div>
      </div>

      {/* ============ MASTER STATUS ============ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 14 }}>
        <Panel title="System Status Board" accent={C.green}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px" }}>
            <StatusRow label="Database" value={dbOk ? `ONLINE · ${system?.db?.name} (${system?.db?.host})` : "OFFLINE"} color={dbOk ? C.green : C.red} blink={dbOk} />
            <StatusRow label="Server" value={`PID ${system?.pid} · Node ${system?.node} · ${system?.cpus} core`} color={C.blue} />
            <StatusRow label="Recurring Job" value={system?.recurring?.nextTickAt ? `ARMED → ${formatDate(system.recurring.nextTickAt)}` : system?.recurring?.running ? "RUNNING SCAN" : "IDLE"} color={system?.recurring?.nextTickAt ? C.green : C.amber} blink={system?.recurring?.running} />
            <StatusRow label="Last Scan" value={system?.recurring?.lastScanAt ? timeAgo(system.recurring.lastScanAt) : "—"} color={C.dim} />
            <StatusRow label="Backup Job" value={system?.backup?.nextBackupAt ? `NEXT ${formatDate(system.backup.nextBackupAt)}` : "NO SCHEDULES"} color={system?.backup?.nextBackupAt ? C.green : C.amber} />
            <StatusRow label="Environment" value={`${system?.nodeEnv || "development"} · ${system?.platform}/${system?.arch}`} color={C.blue} />
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #05070a", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
            <StatusRow label="Uptime" value={formatDuration(system?.uptimeSeconds)} color={C.green} />
          </div>
        </Panel>

        <Panel title="Digital Readouts" accent={C.blue}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <DigitalReadout label="Uptime" value={formatDuration(system?.uptimeSeconds)} color={C.green} sub={system?.serverTime ? `server ${formatDate(system.serverTime)}` : ""} />
            <DigitalReadout label="Heap" value={formatBytes(system?.memory?.heapUsed)} color={C.blue} sub={`of ${formatBytes(system?.memory?.heapTotal)}`} />
            <DigitalReadout label="RAM" value={formatBytes(system?.memory?.rss)} color={C.amber} sub={`of ${formatBytes(system?.memory?.total)}`} />
            <DigitalReadout label="DB Data" value={formatBytes(storage?.dbBytes)} color={C.purple} sub={`${system?.db?.collections || 0} collections`} />
            <DigitalReadout label="Uploads" value={storage?.uploadsCount || 0} color={C.silver} sub={`${formatBytes(storage?.uploadsBytes)} · ${storage?.uploadChunks || 0} chunks`} />
            <DigitalReadout label="Re-Sync" value={ov?.generatedAt ? timeAgo(ov.generatedAt) : "—"} color={C.blue} sub="overview feed" />
          </div>
        </Panel>
      </div>

      {/* ============ GAUGES ============ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
        <Panel accent={C.blue}>
          <Gauge value={ramPct} label="RAM Load" color={C.blue} display={ramPct.toFixed(1)} unit="%" />
        </Panel>
        <Panel accent={C.purple}>
          <Gauge value={heapPct} label="Heap Used" color={C.purple} display={heapPct.toFixed(1)} unit="%" />
        </Panel>
        <Panel accent={C.green}>
          <Gauge value={projectsPct} label="Projects Active" color={C.green} display={projectsPct.toFixed(0)} unit="%" />
        </Panel>
        <Panel accent={C.amber}>
          <Gauge value={onlinePct} label="Users Online" color={C.amber} display={onlinePct.toFixed(0)} unit="%" />
        </Panel>
      </div>

      {/* ============ COUNTERS ============ */}
      <Panel title="Platform Counters" accent={C.green} style={{ marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <DigitalReadout label="Tenants" value={counts?.tenants?.total || 0} color={C.blue} sub={`${counts?.tenants?.active || 0} active`} />
          <DigitalReadout label="Users" value={counts?.users?.total || 0} color={C.green} sub={`${counts?.users?.active || 0} active · ${counts?.users?.online || 0} online`} />
          <DigitalReadout label="New Users" value={`${counts?.users?.new7d || 0}d / ${counts?.users?.new30d || 0}30`} color={C.amber} sub="last 7 / 30 days" />
          <DigitalReadout label="Projects" value={counts?.assignments?.total || 0} color={C.blue} sub={`${activeProjects} active · ${counts?.assignments?.byStatus?.in_progress || 0} in progress`} />
          <DigitalReadout label="Blueprints" value={counts?.assignments?.blueprints || 0} color={C.purple} sub={`${counts?.assignments?.instances || 0} spawned`} />
          <DigitalReadout label="Tasks" value={counts?.tasks?.total || 0} color={C.green} sub={`${counts?.tasks?.overdue || 0} overdue`} />
          <DigitalReadout label="Teams" value={counts?.teams || 0} color={C.silver} />
          <DigitalReadout label="Companies" value={counts?.companies || 0} color={C.silver} />
          <DigitalReadout label="Contacts" value={counts?.contacts || 0} color={C.silver} />
          <DigitalReadout label="Leads" value={counts?.leads || 0} color={C.amber} />
          <DigitalReadout label="Campaigns" value={counts?.campaigns || 0} color={C.blue} />
          <DigitalReadout label="Field Visits" value={counts?.fieldVisits || 0} color={C.blue} />
          <DigitalReadout label="Messages" value={counts?.messages || 0} color={C.blue} />
          <DigitalReadout label="Backups" value={`${counts?.backups?.active || 0}/${counts?.backups?.total || 0}`} color={C.green} sub="active / total" />
          <DigitalReadout label="Activity 24h" value={counts?.activity?.last24h || 0} color={C.amber} sub={`${counts?.activity?.last7d || 0} last 7d`} />
          <DigitalReadout label="Comments" value={counts?.comments || 0} color={C.silver} />
        </div>
        <div className="flex flex-col mt-3 gap-2">
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: C.dim, fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>RAM Load</span>
              <span className="cr-num" style={{ color: C.blue, fontSize: "0.7rem" }}>{ramPct.toFixed(1)}%</span>
            </div>
            <SegMeter value={ramPct} color={C.blue} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: C.dim, fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>Projects Active</span>
              <span className="cr-num" style={{ color: C.green, fontSize: "0.7rem" }}>{projectsPct.toFixed(0)}%</span>
            </div>
            <SegMeter value={projectsPct} color={C.green} />
          </div>
        </div>
      </Panel>

      {/* ============ SCHEDULERS + TENANTS ============ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14, marginBottom: 14 }}>
        <Panel title="Scheduler Consoles" accent={C.amber}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: C.panelInner, border: "1px solid #0a0e13", borderRadius: 8, padding: 12, boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <LED color={system?.recurring?.nextTickAt ? C.green : C.amber} blink={system?.recurring?.nextTickAt} />
                  <span style={{ color: C.text, fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Recurring Spawner</span>
                </div>
                <Badge color={system?.recurring?.nextTickAt ? C.green : C.amber}>
                  {system?.recurring?.running ? "SCANNING" : system?.recurring?.nextTickAt ? "ARMED" : "IDLE"}
                </Badge>
              </div>
              <div style={{ marginTop: 8, color: C.dim, fontSize: "0.7rem", display: "flex", flexDirection: "column", gap: 3 }}>
                <span className="cr-num">next tick: <span style={{ color: C.text }}>{system?.recurring?.nextTickAt ? formatDate(system.recurring.nextTickAt) : "—"}</span></span>
                <span className="cr-num">last scan: <span style={{ color: C.text }}>{system?.recurring?.lastScanAt ? timeAgo(system.recurring.lastScanAt) : "—"}</span></span>
              </div>
            </div>

            <div style={{ background: C.panelInner, border: "1px solid #0a0e13", borderRadius: 8, padding: 12, boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <LED color={system?.backup?.nextBackupAt ? C.green : C.amber} blink={system?.backup?.nextBackupAt} />
                  <span style={{ color: C.text, fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Backup Scheduler</span>
                </div>
                <Badge color={system?.backup?.nextBackupAt ? C.green : C.amber}>
                  {counts?.backups?.active ? "RUNNING" : "IDLE"}
                </Badge>
              </div>
              <div style={{ marginTop: 8, color: C.dim, fontSize: "0.7rem", display: "flex", flexDirection: "column", gap: 3 }}>
                <span className="cr-num">next backup: <span style={{ color: C.text }}>{system?.backup?.nextBackupAt ? formatDate(system.backup.nextBackupAt) : "—"}</span></span>
                <span className="cr-num">schedules: <span style={{ color: C.text }}>{counts?.backups?.active || 0} active / {counts?.backups?.total || 0} total</span></span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Tenant Readouts" accent={C.blue}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
            {tenants.length === 0 && <div style={{ color: C.faint, fontSize: "0.75rem" }}>No tenants registered.</div>}
            {tenants.map((t: TenantView) => (
              <div key={t._id} style={{ background: C.panelInner, border: "1px solid #0a0e13", borderRadius: 7, padding: "8px 10px", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                    <LED color={t.isActive ? C.green : C.red} size={7} />
                    <span style={{ fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <Badge color={PLAN_COLORS[t.plan] || C.silver}>{t.plan}</Badge>
                    <span className="cr-num" style={{ color: C.blue, fontSize: "0.7rem" }}>{t.userCount} users</span>
                  </div>
                </div>
                <div style={{ marginTop: 3, color: C.faint, fontSize: "0.62rem" }}>
                  {t.owner ? `${t.owner.name} · ${t.owner.email}` : "no owner"} · created {formatDate(t.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ============ BLUEPRINTS ============ */}
      <Panel title="Recurring Blueprint Console" accent={C.purple} style={{ marginBottom: 14 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem" }}>
            <thead>
              <tr>
                {["Blueprint", "Pattern", "Next Spawn", "Spawned", "Tenant", "State"].map((h) => (
                  <th key={h} style={{ textAlign: "left", color: C.faint, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", padding: "6px 8px", borderBottom: `1px solid ${C.bezel}` }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blueprints.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "12px 8px", color: C.faint }}>No recurring blueprints scheduled.</td>
                </tr>
              )}
              {blueprints.map((b: BlueprintView) => (
                <tr key={b._id}>
                  <td style={{ padding: "7px 8px", fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>{b.title}</td>
                  <td style={{ padding: "7px 8px" }}>
                    <Badge color={C.blue}>{b.pattern || "—"}{b.time ? ` ${b.time}` : ""}</Badge>
                    {b.weekdays && b.weekdays.length > 0 && (
                      <span style={{ color: C.dim, marginLeft: 6, fontSize: "0.64rem" }}>
                        {b.weekdays.map((w: number) => "SMTWTFS"[w]).join("")}
                      </span>
                    )}
                  </td>
                  <td className="cr-num" style={{ padding: "7px 8px", color: b.paused ? C.faint : C.green, whiteSpace: "nowrap" }}>
                    {b.paused ? "PAUSED" : b.nextSpawnAt ? formatDate(b.nextSpawnAt) : "—"}
                  </td>
                  <td className="cr-num" style={{ padding: "7px 8px", color: C.text, whiteSpace: "nowrap" }}>
                    {b.instanceCount} <span style={{ color: C.faint }}>/ {b.maxInstances ?? "∞"}</span>
                  </td>
                  <td style={{ padding: "7px 8px", color: C.dim }}>{b.createdBy?.tenant || "—"}</td>
                  <td style={{ padding: "7px 8px" }}>
                    <Badge color={b.paused ? C.amber : C.green}>{b.paused ? "paused" : "active"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ============ ACTIVITY LOG ============ */}
      <Panel title="Global Activity Feed" accent={C.green}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <LED color={socketLive ? C.green : C.red} blink={socketLive} size={8} />
          <span style={{ color: C.dim, fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Live Event Stream
          </span>
          <span className="cr-num" style={{ color: C.green, fontSize: "0.7rem" }}>
            {liveEvents.length} live
          </span>
        </div>
        <div
          className="cr-num"
          style={{
            background: "#07090c",
            border: "1px solid #0a0e13",
            borderRadius: 8,
            padding: "12px 14px",
            maxHeight: 360,
            overflowY: "auto",
            fontSize: "0.72rem",
            lineHeight: 1.7,
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.7)",
          }}
        >
          {liveEvents.length === 0 && logs.length === 0 && (
            <div style={{ color: C.faint }}>No activity recorded.</div>
          )}
          {liveEvents.map((e, i) => (
            <div
              key={e.id}
              className={i === 0 ? "cr-event-new" : undefined}
              style={{ display: "flex", gap: 10, alignItems: "baseline", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              <span style={{ color: e.type === "activity" ? C.dim : C.green, flexShrink: 0 }}>◈</span>
              <span style={{ color: C.faint, flexShrink: 0 }}>{formatDate(e.at)}</span>
              <span style={{ color: C.text, fontWeight: 600, flexShrink: 0 }}>{e.user?.name || "system"}</span>
              {e.tenant && <span style={{ color: C.blue, flexShrink: 0 }}>[{e.tenant}]</span>}
              <span style={{ color: C.dim }}>{e.action}{e.title ? ` — ${e.title}` : ""}</span>
              <span style={{ color: C.blue, flexShrink: 0 }}>#{e.entityType || e.type}</span>
            </div>
          ))}
          {liveEvents.length > 0 && logs.length > 0 && (
            <div style={{ borderTop: "1px dashed #1a2027", margin: "6px 0" }} />
          )}
          {logs.map((l: LogView) => (
            <div key={l._id} style={{ display: "flex", gap: 10, alignItems: "baseline", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <span style={{ color: C.faint, flexShrink: 0 }}>{formatDate(l.createdAt)}</span>
              <span style={{ color: C.dim, flexShrink: 0 }}>·</span>
              <span style={{ color: C.text, fontWeight: 600, flexShrink: 0 }}>{l.user?.name || "system"}</span>
              <span style={{ color: C.dim }}>{l.action}</span>
              <span style={{ color: C.blue, flexShrink: 0 }}>#{l.entityType}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
};

export default SuperAdminDashboard;
