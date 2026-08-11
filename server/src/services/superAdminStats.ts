import os from "os";
import mongoose from "mongoose";
import Tenant from "../models/Tenant";
import User from "../models/User";
import Assignment from "../models/Assignment";
import Task from "../models/Task";
import Team from "../models/Team";
import Company from "../models/Company";
import Contact from "../models/Contact";
import Lead from "../models/Lead";
import Campaign from "../models/Campaign";
import CalendarEvent from "../models/CalendarEvent";
import FieldVisit from "../models/FieldVisit";
import BackupSchedule from "../models/BackupSchedule";
import Message from "../models/Message";
import Comment from "../models/Comment";
import ActivityLog from "../models/ActivityLog";
import { nextSpawnDate, getRecurringJobStatus } from "./recurringTaskService";
import { getBackupJobStatus } from "./backupScheduleService";

const toMap = (rows: { _id: string; count: number }[]) => {
  const map: Record<string, number> = {};
  for (const row of rows) map[row._id] = row.count;
  return map;
};

export const getOnlineCount = async (): Promise<number> => {
  try {
    const { activeUsers } = await import("../index");
    return activeUsers.size;
  } catch {
    return 0;
  }
};

export const getOverviewStats = async (): Promise<any> => {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const now24h = new Date(now.getTime() - dayMs);
  const now7d = new Date(now.getTime() - 7 * dayMs);
  const now30d = new Date(now.getTime() - 30 * dayMs);

  const [
    tenantTotal,
    tenantActive,
    tenantsByPlan,
    userTotal,
    userActive,
    usersNew7d,
    usersNew30d,
    usersByRole,
    assignmentByStatus,
    assignmentTotal,
    blueprintTotal,
    instanceTotal,
    recurringActive,
    recurringPaused,
    assignmentsOverdue,
    tasksByStatus,
    taskTotal,
    tasksOverdue,
    teamTotal,
    companyTotal,
    contactTotal,
    leadTotal,
    campaignTotal,
    calendarEventTotal,
    fieldVisitTotal,
    backupTotal,
    backupActive,
    messageTotal,
    commentTotal,
    activity24h,
    activity7d,
    onlineCount,
  ] = await Promise.all([
    Tenant.countDocuments(),
    Tenant.countDocuments({ isActive: true }),
    Tenant.aggregate([{ $group: { _id: "$plan", count: { $sum: 1 } } }]),
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ createdAt: { $gte: now7d } }),
    User.countDocuments({ createdAt: { $gte: now30d } }),
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    Assignment.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Assignment.countDocuments(),
    Assignment.countDocuments({ isRecurring: true, parentAssignmentId: null }),
    Assignment.countDocuments({ parentAssignmentId: { $ne: null } }),
    Assignment.countDocuments({
      isRecurring: true,
      parentAssignmentId: null,
      recurringPaused: { $ne: true },
    }),
    Assignment.countDocuments({
      isRecurring: true,
      parentAssignmentId: null,
      recurringPaused: true,
    }),
    Assignment.countDocuments({
      status: { $ne: "completed" },
      dueDate: { $lt: now },
    }),
    Task.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Task.countDocuments(),
    Task.countDocuments({ status: { $ne: "completed" }, dueDate: { $lt: now } }),
    Team.countDocuments(),
    Company.countDocuments(),
    Contact.countDocuments(),
    Lead.countDocuments(),
    Campaign.countDocuments(),
    CalendarEvent.countDocuments(),
    FieldVisit.countDocuments(),
    BackupSchedule.countDocuments(),
    BackupSchedule.countDocuments({ isActive: true }),
    Message.countDocuments(),
    Comment.countDocuments(),
    ActivityLog.countDocuments({ createdAt: { $gte: now24h } }),
    ActivityLog.countDocuments({ createdAt: { $gte: now7d } }),
    getOnlineCount(),
  ]);

  let storage = {
    dbBytes: 0,
    uploadsCount: 0,
    uploadsBytes: 0,
    uploadChunks: 0,
  };
  try {
    const db = mongoose.connection.db;
    if (db) {
      const [dbStats, filesAgg, chunksCount] = await Promise.all([
        db.stats(),
        db
          .collection("uploads.files")
          .aggregate([
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                sizeBytes: { $sum: "$length" },
              },
            },
          ])
          .toArray(),
        db.collection("uploads.chunks").countDocuments(),
      ]);
      storage = {
        dbBytes: dbStats.dataSize || 0,
        uploadsCount: filesAgg[0]?.count || 0,
        uploadsBytes: filesAgg[0]?.sizeBytes || 0,
        uploadChunks: chunksCount || 0,
      };
    }
  } catch {
    // storage metrics unavailable
  }

  const mem = process.memoryUsage();
  const dbReady = mongoose.connection.readyState === 1;
  let collectionCount = 0;
  try {
    const cols = await mongoose.connection.db?.listCollections().toArray();
    collectionCount = cols?.length || 0;
  } catch {
    collectionCount = 0;
  }

  return {
    generatedAt: now,
    counts: {
      tenants: {
        total: tenantTotal,
        active: tenantActive,
        byPlan: toMap(tenantsByPlan),
      },
      users: {
        total: userTotal,
        active: userActive,
        online: onlineCount,
        byRole: toMap(usersByRole),
        new7d: usersNew7d,
        new30d: usersNew30d,
      },
      assignments: {
        total: assignmentTotal,
        byStatus: toMap(assignmentByStatus),
        overdue: assignmentsOverdue,
        blueprints: blueprintTotal,
        instances: instanceTotal,
        recurringActive,
        recurringPaused,
      },
      tasks: {
        total: taskTotal,
        byStatus: toMap(tasksByStatus),
        overdue: tasksOverdue,
      },
      teams: teamTotal,
      companies: companyTotal,
      contacts: contactTotal,
      leads: leadTotal,
      campaigns: campaignTotal,
      calendarEvents: calendarEventTotal,
      fieldVisits: fieldVisitTotal,
      backups: { total: backupTotal, active: backupActive },
      messages: messageTotal,
      comments: commentTotal,
      activity: { last24h: activity24h, last7d: activity7d },
    },
    storage,
    system: {
      uptimeSeconds: process.uptime(),
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        total: os.totalmem(),
      },
      node: process.version,
      platform: os.platform(),
      arch: os.arch(),
      pid: process.pid,
      cpus: os.cpus().length,
      nodeEnv: process.env.NODE_ENV || "development",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      serverTime: now,
      db: {
        connected: dbReady,
        name: mongoose.connection.name,
        host: mongoose.connection.host,
        collections: collectionCount,
      },
      recurring: getRecurringJobStatus(),
      backup: getBackupJobStatus(),
    },
  };
};

export const getTenantsList = async () => {
  const tenants = await Tenant.find().sort({ createdAt: -1 }).lean();
  const ids = tenants.map((t) => t._id);
  const userCountRows = await User.aggregate([
    { $match: { tenantId: { $in: ids } } },
    { $group: { _id: "$tenantId", count: { $sum: 1 } } },
  ]);
  const ownerIds = tenants
    .map((t) => t.ownerId)
    .filter((id) => id != null) as mongoose.Types.ObjectId[];
  const owners = await User.find({ _id: { $in: ownerIds } })
    .select("name email")
    .lean();
  const ownerMap = new Map(owners.map((o) => [o._id.toString(), o]));
  const userCountMap = toMap(userCountRows);

  return tenants.map((t) => ({
    _id: t._id,
    name: t.name,
    plan: t.plan,
    isActive: t.isActive,
    website: t.website || "",
    createdAt: t.createdAt,
    trialEndsAt: t.trialEndsAt || null,
    userCount: userCountMap[t._id.toString()] || 0,
    owner: t.ownerId ? ownerMap.get(t.ownerId.toString()) || null : null,
  }));
};

export const getRecurringBlueprints = async () => {
  const templates = await Assignment.find({
    isRecurring: true,
    parentAssignmentId: null,
  })
    .sort({ createdAt: -1 })
    .lean();

  const templateIds = templates.map((t) => t._id);
  const instanceRows = await Assignment.aggregate([
    { $match: { parentAssignmentId: { $in: templateIds } } },
    { $group: { _id: "$parentAssignmentId", count: { $sum: 1 } } },
  ]);
  const instanceCountMap = toMap(instanceRows);

  const creatorIds = templates
    .map((t) => t.createdBy)
    .filter((id) => id != null) as mongoose.Types.ObjectId[];
  const creators = await User.find({ _id: { $in: creatorIds } })
    .select("name email role tenantId")
    .populate("tenantId", "name")
    .lean();
  const creatorMap = new Map(creators.map((c) => [c._id.toString(), c]));

  return templates.map((t) => ({
    _id: t._id,
    title: t.title,
    pattern: t.recurringPattern || null,
    time: t.recurringTime || null,
    paused: !!t.recurringPaused,
    weekdays: t.recurringWeekdays || [],
    dayOfMonth: t.recurringDayOfMonth || null,
    endDate: t.recurringEndDate || null,
    maxInstances: t.recurringMaxInstances || null,
    spawnedCount: t.recurringSpawnedCount || 0,
    instanceCount: instanceCountMap[t._id.toString()] || 0,
    lastSpawnedAt: t.recurringLastSpawnedAt || null,
    nextSpawnAt: nextSpawnDate(t, t.recurringLastSpawnedAt || null),
    status: t.status,
    createdBy: creatorMap.get(t.createdBy.toString())
      ? {
          name: (creatorMap.get(t.createdBy.toString()) as any).name,
          email: (creatorMap.get(t.createdBy.toString()) as any).email,
          tenant:
            ((creatorMap.get(t.createdBy.toString()) as any).tenantId as any)
              ?.name || null,
        }
      : null,
  }));
};

export const getRecentActivity = async (limit: number = 50) => {
  const logs = await ActivityLog.find()
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .populate("user", "name email role")
    .lean();
  return logs;
};
