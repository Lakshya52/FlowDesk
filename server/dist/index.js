"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeUsers = exports.io = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const sharp_1 = __importDefault(require("sharp"));
// Load environment variables early
dotenv_1.default.config();
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const node_dns_1 = __importDefault(require("node:dns"));
const buddy_1 = __importDefault(require("./routes/buddy"));
// Force DNS to resolve IPv4 first to avoid Atlas connection issues on Windows
node_dns_1.default.setDefaultResultOrder("ipv4first");
const auth_1 = __importDefault(require("./routes/auth"));
const assignments_1 = __importDefault(require("./routes/assignments"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const comments_1 = __importDefault(require("./routes/comments"));
const files_1 = __importDefault(require("./routes/files"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const teams_1 = __importDefault(require("./routes/teams"));
const chat_1 = __importDefault(require("./routes/chat"));
const reports_1 = __importDefault(require("./routes/reports"));
const companies_1 = __importDefault(require("./routes/companies"));
const canvas_1 = __importDefault(require("./routes/canvas"));
const conversations_1 = __importDefault(require("./routes/conversations"));
const calendars_1 = __importDefault(require("./routes/calendars"));
const calendarEvents_1 = __importDefault(require("./routes/calendarEvents"));
const googleCalendarImport_1 = __importDefault(require("./routes/googleCalendarImport"));
const campaigns_1 = __importDefault(require("./routes/campaigns"));
const leads_1 = __importDefault(require("./routes/leads"));
const users_1 = __importDefault(require("./routes/users"));
const activityLogs_1 = __importDefault(require("./routes/activityLogs"));
const crmSummary_1 = __importDefault(require("./routes/crmSummary"));
const recurringTaskService_1 = require("./services/recurringTaskService");
const errorHandler_1 = require("./middlewares/errorHandler");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const clientUrls = [
    process.env.CLIENT_URL,
    "https://flowdesk-frontend-g35x.onrender.com",
    "http://localhost:5173",
    "https://districts-beside-roughly-reached.trycloudflare.com",
    "https://flowdesk.raksco.in",
].filter(Boolean);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin ||
                origin.startsWith("http://localhost:") ||
                origin.startsWith("file://") ||
                clientUrls.includes(origin)) {
                callback(null, true);
            }
            else {
                callback(null, false);
            }
        },
        credentials: true,
    },
});
exports.io = io;
const PORT = process.env.PORT || 5000;
// Global set to track online user IDs
exports.activeUsers = new Set();
// Security middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            frameSrc: ["'self'", "http://localhost:5000", "http://localhost:5173", "https://flowdesk.raksco.in", "https://flowdesk-api.raksco.in"],
            objectSrc: ["'self'", "http://localhost:5000", "https://flowdesk-api.raksco.in"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://static.cloudflareinsights.com"],
            scriptSrcElem: ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "http://localhost:5000", "https://flowdesk-api.raksco.in"],
            connectSrc: ["'self'", "*"],
            mediaSrc: ["'self'", "http://localhost:5000", "blob:", "https://flowdesk-api.raksco.in"],
            workerSrc: ["'self'", "blob:"],
        },
    },
}));
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || clientUrls.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(null, true); // Fallback to true if we're unsure, or log it
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
// Body parsing
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
// Serve files from GridFS
app.get("/uploads/:filename", async (req, res) => {
    try {
        if (!mongoose_1.default.connection.db) {
            return res
                .status(500)
                .json({ message: "Database connection not established" });
        }
        const bucket = new mongoose_1.default.mongo.GridFSBucket(mongoose_1.default.connection.db, {
            bucketName: "uploads",
        });
        const filename = req.params.filename;
        const files = await bucket.find({ filename }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).json({ message: "File not found" });
        }
        const file = files[0];
        if (file.contentType) {
            res.set("Content-Type", file.contentType);
        }
        else {
            // Fallback for files without contentType (though GridFS usually has it)
            const ext = filename.split(".").pop();
            if (ext === "png")
                res.set("Content-Type", "image/png");
            else if (ext === "jpg" || ext === "jpeg")
                res.set("Content-Type", "image/jpeg");
            else if (ext === "pdf")
                res.set("Content-Type", "application/pdf");
        }
        // Allow inline rendering (critical for PDF preview in iframes)
        res.set("Content-Disposition", "inline");
        // Allow embedding from the client origin
        res.set("X-Frame-Options", "ALLOWALL");
        res.set("Cross-Origin-Resource-Policy", "cross-origin");
        const downloadStream = bucket.openDownloadStreamByName(filename);
        downloadStream.on("error", () => {
            res.status(404).json({ message: "Error downloading file" });
        });
        downloadStream.pipe(res);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// Serve resized image from GridFS
app.get("/uploads/:filename/resize", async (req, res) => {
    try {
        if (!mongoose_1.default.connection.db) {
            return res.status(500).json({ message: "Database connection not established" });
        }
        const bucket = new mongoose_1.default.mongo.GridFSBucket(mongoose_1.default.connection.db, {
            bucketName: "uploads",
        });
        const filename = req.params.filename;
        const files = await bucket.find({ filename }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).json({ message: "File not found" });
        }
        const file = files[0];
        const contentType = file.contentType || "image/jpeg";
        // Only resize image types
        if (!contentType.startsWith("image/") || contentType === "image/gif") {
            const downloadStream = bucket.openDownloadStreamByName(filename);
            if (file.contentType)
                res.set("Content-Type", file.contentType);
            res.set("Cache-Control", "public, max-age=86400");
            downloadStream.pipe(res);
            return;
        }
        const w = Math.min(parseInt(req.query.w) || 40, 200);
        const q = Math.min(parseInt(req.query.q) || 60, 80);
        const chunks = [];
        const downloadStream = bucket.openDownloadStreamByName(filename);
        for await (const chunk of downloadStream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const resized = await (0, sharp_1.default)(buffer)
            .resize(w, w, { fit: "cover" })
            .jpeg({ quality: q, mozjpeg: true })
            .toBuffer();
        res.set("Content-Type", "image/jpeg");
        res.set("Cache-Control", "public, max-age=604800");
        res.send(resized);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// Ollama proxy endpoint
app.post("/api/buddy/ollama", async (req, res) => {
    try {
        req.setTimeout(120000); // 2 minutes
        res.setTimeout(120000);
        const response = await fetch("http://127.0.0.1:11434/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
        });
        if (!response.ok)
            throw new Error(`Ollama returned ${response.status}`);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Transfer-Encoding", "chunked");
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error("No response body");
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            res.write(value);
        }
        res.end();
    }
    catch (error) {
        res.status(500).json({ error: "Failed to connect to Ollama" });
    }
});
// API Routes
app.use("/api/buddy", buddy_1.default);
app.use("/api/auth", auth_1.default);
app.use("/api/assignments", assignments_1.default);
app.use("/api/tasks", tasks_1.default);
app.use("/api/comments", comments_1.default);
app.use("/api/files", files_1.default);
app.use("/api/notifications", notifications_1.default);
app.use("/api/dashboard", dashboard_1.default);
app.use("/api/teams", teams_1.default);
app.use("/api/chat", chat_1.default);
app.use("/api/reports", reports_1.default);
app.use("/api/companies", companies_1.default);
app.use("/api/canvas", canvas_1.default);
app.use("/api/conversations", conversations_1.default);
app.use("/api/calendars", calendars_1.default);
app.use("/api/calendar-events", calendarEvents_1.default);
app.use("/api/import/google-calendar", googleCalendarImport_1.default);
app.use("/api/campaigns", campaigns_1.default);
app.use("/api/leads", leads_1.default);
app.use("/api/users", users_1.default);
app.use("/api/activity-logs", activityLogs_1.default);
app.use("/api/crm-summary", crmSummary_1.default);
// Socket.io connection logic
io.on("connection", (socket) => {
    socket.on("join_assignment", (assignmentId) => {
        socket.join(`assignment_${assignmentId}`);
        console.log(`User joined assignment room: assignment_${assignmentId}`);
    });
    socket.on("join_conversation", (conversationId) => {
        socket.join(`conversation_${conversationId}`);
        console.log(`User joined conversation room: conversation_${conversationId}`);
    });
    socket.on("join_tenant", (tenantId) => {
        if (!tenantId)
            return;
        socket.join(`tenant_${tenantId}`);
        console.log(`User joined tenant room: tenant_${tenantId}`);
    });
    socket.on("join_user", (userId) => {
        if (!userId)
            return;
        socket.join(`user_${userId}`);
        socket.data.userId = userId;
        exports.activeUsers.add(userId.toString());
        io.emit("user_status_change", { userId, status: "online" });
        console.log(`User joined personal room: user_${userId}. Active users count: ${exports.activeUsers.size}`);
    });
    socket.on("user_active_status", ({ userId, status }) => {
        if (!userId)
            return;
        if (status === "online") {
            exports.activeUsers.add(userId.toString());
            io.emit("user_status_change", { userId, status: "online" });
            console.log(`📡 User ${userId} status set to online. Active count: ${exports.activeUsers.size}`);
        }
        else {
            exports.activeUsers.delete(userId.toString());
            io.emit("user_status_change", { userId, status: "offline" });
            console.log(`📡 User ${userId} status set to offline. Active count: ${exports.activeUsers.size}`);
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
            const Message = (await Promise.resolve().then(() => __importStar(require("./models/Message")))).default;
            const readAt = new Date();
            await Message.updateMany({
                conversation: conversationId,
                sender: { $ne: readerId },
                "readBy.user": { $ne: readerId },
            }, { $push: { readBy: { user: readerId, readAt } } });
            io.to(`conversation_${conversationId}`).emit("messages_read", {
                conversationId,
                readerId: readerId.toString(),
                readAt: readAt.toISOString(),
            });
        }
        catch (err) {
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
                exports.activeUsers.delete(userId.toString());
                io.emit("user_status_change", { userId, status: "offline" });
                console.log(`User ${userId} went offline.`);
            }
        }
    });
});
// Health check
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// Error handling
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.errorHandler);
// Database connection and server start
const startServer = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI ||
            "mongodb://AceoneSupport:A!ceone-mongocluster@ac-c2bzbo0-shard-00-00.dffbzkm.mongodb.net:27017,ac-c2bzbo0-shard-00-01.dffbzkm.mongodb.net:27017,ac-c2bzbo0-shard-00-02.dffbzkm.mongodb.net:27017/?ssl=true&replicaSet=atlas-10c7ui-shard-0&authSource=admin&appName=Cluster0";
        await mongoose_1.default.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            family: 4, // Force IPv4
        });
        console.log("✅ Connected to MongoDB");
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            (0, recurringTaskService_1.startRecurringJob)();
        });
    }
    catch (error) {
        console.error("❌ Failed to connect to MongoDB:", error);
        process.exit(1);
    }
};
startServer();
exports.default = app;
//# sourceMappingURL=index.js.map