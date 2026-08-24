import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import sharp from "sharp";

// Load environment variables early
dotenv.config({ path: path.resolve(__dirname, "../.env") });

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set");
  process.exit(1);
}

import { Server } from "socket.io";
import http from "http";
import dns from "node:dns";

import buddyRoute from "./routes/buddy";
import { authenticate } from "./middlewares/auth";

// Force DNS to resolve IPv4 first to avoid Atlas connection issues on Windows
dns.setDefaultResultOrder("ipv4first");

import authRoutes from "./routes/auth";
import assignmentRoutes from "./routes/assignments";
import taskRoutes from "./routes/tasks";
import commentRoutes from "./routes/comments";
import fileRoutes from "./routes/files";
import notificationRoutes from "./routes/notifications";
import dashboardRoutes from "./routes/dashboard";
import teamRoutes from "./routes/teams";
import chatRoutes from "./routes/chat";
import reportRoutes from "./routes/reports";
import companyRoutes from "./routes/companies";
import canvasRoutes from "./routes/canvas";
import conversationRoutes from "./routes/conversations";
import calendarRoutes from "./routes/calendars";
import calendarEventRoutes from "./routes/calendarEvents";
import googleCalendarImport from "./routes/googleCalendarImport";
import campaignRoutes from "./routes/campaigns";
import leadRoutes from "./routes/leads";
import userRoutes from "./routes/users";
import activityLogRoutes from "./routes/activityLogs";
import crmSummaryRoutes from "./routes/crmSummary";
import fieldVisitRoutes from "./routes/fieldVisits";
import settingsRoutes from "./routes/settings";
import boardRoutes from "./routes/boards";
import { startRecurringJob, stopRecurringJob } from "./services/recurringTaskService";
import { startFieldVisitHeartbeat } from "./services/fieldVisitHeartbeatService";
import backupRoutes from "./routes/backup";
import { startBackupScheduler, stopBackupScheduler } from "./services/backupScheduleService";
import { errorHandler, notFound } from "./middlewares/errorHandler";

const app = express();
const server = http.createServer(app);
const clientUrls = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "https://flowdesk.raksco.in",
].filter(Boolean) as string[];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (
        !origin ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("file://") ||
        clientUrls.includes(origin)
      ) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  },
});

const PORT = process.env.PORT || 5000;

// Export io for use in controllers
export { io };

// Global set to track online user IDs
export const activeUsers = new Set<string>();

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://static.cloudflareinsights.com"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://flowdesk-api.raksco.in"],
        connectSrc: ["'self'", "https://flowdesk-api.raksco.in", "https://api.brevo.com", "https://api.openai.com"],
        mediaSrc: ["'self'", "blob:"],
        workerSrc: ["'self'", "blob:"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || clientUrls.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve files from GridFS (no auth — browsers need direct img src)
app.get("/uploads/:filename", async (req, res) => {
  try {
    if (!mongoose.connection.db) {
      return res
        .status(500)
        .json({ message: "Database connection not established" });
    }
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    const filename = req.params.filename as string;
    const files = await bucket.find({ filename }).toArray();

    if (!files || files.length === 0) {
      return res.status(404).json({ message: "File not found" });
    }

    const file = files[0];
    if (file.contentType) {
      res.set("Content-Type", file.contentType);
    } else {
      const ext = filename.split(".").pop();
      if (ext === "png") res.set("Content-Type", "image/png");
      else if (ext === "jpg" || ext === "jpeg")
        res.set("Content-Type", "image/jpeg");
      else if (ext === "pdf") res.set("Content-Type", "application/pdf");
    }

    res.set("Content-Disposition", "inline");
    res.set("X-Frame-Options", "ALLOWALL");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");

    const downloadStream = bucket.openDownloadStreamByName(filename);

    downloadStream.on("error", () => {
      res.status(404).json({ message: "Error downloading file" });
    });

    downloadStream.pipe(res);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Serve resized image from GridFS (no auth — browsers need direct img src)
app.get("/uploads/:filename/resize", async (req, res) => {
  try {
    if (!mongoose.connection.db) {
      return res.status(500).json({ message: "Database connection not established" });
    }
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    const filename = req.params.filename as string;
    const files = await bucket.find({ filename }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ message: "File not found" });
    }

    const file = files[0];
    const contentType = file.contentType || "image/jpeg";

    if (!contentType.startsWith("image/") || contentType === "image/gif") {
      const downloadStream = bucket.openDownloadStreamByName(filename);
      if (file.contentType) res.set("Content-Type", file.contentType);
      res.set("Cache-Control", "public, max-age=86400");
      downloadStream.pipe(res);
      return;
    }

    const w = Math.min(parseInt(req.query.w as string) || 40, 200);
    const q = Math.min(parseInt(req.query.q as string) || 60, 80);

    const chunks: Buffer[] = [];
    const downloadStream = bucket.openDownloadStreamByName(filename);
    for await (const chunk of downloadStream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const resized = await sharp(buffer)
      .resize(w, w, { fit: "cover" })
      .jpeg({ quality: q, mozjpeg: true })
      .toBuffer();

    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=604800");
    res.send(resized);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Ollama proxy endpoint
app.post("/api/buddy/ollama", authenticate, async (req, res) => {
  try {
    req.setTimeout(120000); // 2 minutes maggie
    res.setTimeout(120000);

    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Transfer-Encoding", "chunked");

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (error) {
    res.status(500).json({ error: "Failed to connect to Ollama" });
  }
});

// API Routes
app.use("/api/buddy", authenticate, buddyRoute);
app.use("/api/auth", authRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/canvas", canvasRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/calendars", calendarRoutes);
app.use("/api/calendar-events", calendarEventRoutes);
app.use("/api/import/google-calendar", googleCalendarImport);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/users", userRoutes);
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/crm-summary", crmSummaryRoutes);
app.use("/api/field-visits", fieldVisitRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/boards", boardRoutes);
app.use("/api/backup", backupRoutes);

// Socket.io authentication middleware
io.use(async (socket, next) => {
  try {
    // Auth header only — tokens in query strings end up in access logs
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    const jwt = await import("jsonwebtoken");
    const decoded = jwt.default.verify(
      token as string,
      process.env.JWT_SECRET!,
    ) as { userId: string; tenantId: string };
    // Load role + active state so room guards and presence are trustworthy
    const User = (await import("./models/User")).default;
    const user = await User.findById(decoded.userId).select("role isActive").lean();
    if (!user || !(user as any).isActive) {
      return next(new Error("User not found or inactive"));
    }
    socket.data.userId = decoded.userId;
    socket.data.tenantId = decoded.tenantId;
    socket.data.role = (user as any).role;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

// ─── Membership-guarded room joins (async DB checks) ─────────────────────
async function isConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
  if (!conversationId || !/^[0-9a-f]{24}$/i.test(String(conversationId))) return false;
  try {
    const Conversation = (await import("./models/Conversation")).default;
    const conv = await Conversation.findById(conversationId).select("participants").lean();
    return !!conv && (conv.participants as any[]).some((p) => p.toString() === String(userId));
  } catch {
    return false;
  }
}

async function isAssignmentMember(assignmentId: string, userId: string, role: string): Promise<boolean> {
  if (!assignmentId || !/^[0-9a-f]{24}$/i.test(String(assignmentId))) return false;
  if (role === "admin") return true;
  try {
    const Assignment = (await import("./models/Assignment")).default;
    const a = await Assignment.findById(assignmentId).select("team createdBy").lean();
    if (!a) return false;
    return (
      (a.createdBy as any)?.toString() === String(userId) ||
      ((a.team as any[]) || []).some((t) => t.toString() === String(userId))
    );
  } catch {
    return false;
  }
}

// Socket.io connection logic
io.on("connection", (socket) => {
  socket.on("join_assignment", async (assignmentId) => {
    if (!(await isAssignmentMember(assignmentId, socket.data.userId!, socket.data.role || "member"))) return;
    socket.join(`assignment_${assignmentId}`);
  });

  socket.on("join_conversation", async (conversationId) => {
    if (!(await isConversationParticipant(conversationId, socket.data.userId!))) return;
    socket.join(`conversation_${conversationId}`);
  });

  socket.on("join_tenant", (tenantId) => {
    if (!tenantId || tenantId !== socket.data.tenantId) return;
    socket.join(`tenant_${tenantId}`);
  });

  socket.on("join_user", (userId) => {
    if (!userId || userId !== socket.data.userId) return;
    socket.join(`user_${userId}`);
    activeUsers.add(userId.toString());
    io.emit("user_status_change", { userId, status: "online" });
  });

  socket.on("user_active_status", ({ userId, status }) => {
    // Presence spoofing guard: a socket may only set its own user's status
    if (!userId || userId !== socket.data.userId) return;
    if (status === "online") {
      activeUsers.add(userId.toString());
      io.emit("user_status_change", { userId, status: "online" });
      console.log(
        `📡 User ${userId} status set to online. Active count: ${activeUsers.size}`,
      );
    } else {
      activeUsers.delete(userId.toString());
      io.emit("user_status_change", { userId, status: "offline" });
      console.log(
        `📡 User ${userId} status set to offline. Active count: ${activeUsers.size}`,
      );
    }
  });

  socket.on("typing", ({ assignmentId, userName }) => {
    socket
      .to(`assignment_${assignmentId}`)
      .emit("user_typing", { userName, userId: socket.id });
  });

  socket.on("stop_typing", ({ assignmentId }) => {
    socket
      .to(`assignment_${assignmentId}`)
      .emit("user_stop_typing", { userId: socket.id });
  });

  socket.on("chat_typing", ({ conversationId, userName }) => {
    socket.to(`conversation_${conversationId}`).emit("user_chat_typing", {
      conversationId,
      userName,
      userId: socket.data.userId,
    });
  });

  socket.on("chat_stop_typing", ({ conversationId }) => {
    socket.to(`conversation_${conversationId}`).emit("user_chat_stop_typing", {
      conversationId,
      userId: socket.data.userId,
    });
  });

  socket.on("mark_messages_read", async ({ conversationId, readerId }) => {
    try {
      // A socket may only mark its own user's reads, and only in conversations
      // it actually belongs to
      if (!readerId || readerId !== socket.data.userId) return;
      if (!(await isConversationParticipant(conversationId, socket.data.userId!))) return;
      const Message = (await import("./models/Message")).default;
      const readAt = new Date();
      await Message.updateMany(
        {
          conversation: conversationId,
          sender: { $ne: readerId },
          "readBy.user": { $ne: readerId },
        },
        { $push: { readBy: { user: readerId, readAt } } },
      );
      io.to(`conversation_${conversationId}`).emit("messages_read", {
        conversationId,
        readerId: readerId.toString(),
        readAt: readAt.toISOString(),
      });
    } catch (err) {
      console.error("mark_messages_read error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
    const userId = socket.data.userId;
    if (userId) {
      // Check if there are other sockets still connected for this user
      const userRoom = io.sockets.adapter.rooms.get(`user_${userId}`);
      if (!userRoom || userRoom.size === 0) {
        activeUsers.delete(userId.toString());
        io.emit("user_status_change", { userId, status: "offline" });
        console.log(`User ${userId} went offline.`);
      }
    }
  });
});

// Health check
app.get("/api/health", async (_req, res) => {
  try {
    await mongoose.connection.db?.admin().ping();
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "error", message: "Database unavailable" });
  }
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// Graceful shutdown handlers
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed');
  });
  stopRecurringJob();
  stopBackupScheduler();
  await mongoose.disconnect();
  console.log('MongoDB disconnected');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Database connection and server start
const startServer = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error("FATAL: MONGODB_URI environment variable is not set");
      process.exit(1);
    }
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      family: 4, // Force IPv4
    });
    console.log("✅ Connected to MongoDB");

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      startRecurringJob();
      startBackupScheduler();
    });
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    process.exit(1);
  }
};

startServer();

export default app;
