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
exports.searchUsers = exports.deleteComment = exports.getComments = exports.createComment = void 0;
const Comment_1 = __importDefault(require("../models/Comment"));
const Notification_1 = require("../models/Notification");
const ActivityLog_1 = __importStar(require("../models/ActivityLog"));
const User_1 = __importDefault(require("../models/User"));
const notificationService_1 = require("../services/notificationService");
const tenant_1 = require("../utils/tenant");
const createComment = async (req, res) => {
    try {
        const { content, assignmentId, taskId, mentions } = req.body;
        const comment = await Comment_1.default.create({
            content,
            author: req.user._id,
            assignment: assignmentId,
            task: taskId,
            mentions: mentions || [],
        });
        // Notify mentioned users
        if (mentions && mentions.length > 0) {
            const payloads = mentions.map((m) => ({
                user: m.user,
                type: Notification_1.NotificationType.MENTION,
                title: "New Mention",
                message: `${req.user.name} mentioned you in a comment`,
                link: taskId
                    ? `/assignments/${assignmentId}?taskId=${taskId}`
                    : `/assignments/${assignmentId}`,
            }));
            await (0, notificationService_1.createNotifications)(payloads);
        }
        await ActivityLog_1.default.create({
            action: "Comment added",
            user: req.user._id,
            entityType: ActivityLog_1.EntityType.COMMENT,
            entityId: comment._id,
            metadata: { assignmentId, taskId },
        });
        const populated = await Comment_1.default.findById(comment._id)
            .populate("author", "name email avatar")
            .populate("mentions.user", "name email");
        res.status(201).json({ comment: populated });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createComment = createComment;
const getComments = async (req, res) => {
    try {
        const { assignmentId, taskId } = req.query;
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const filter = {};
        if (assignmentId)
            filter.assignment = assignmentId;
        if (taskId)
            filter.task = taskId;
        // Tenant scope: only show comments where author is in this tenant
        filter.author = { $in: tenantUserIds };
        const comments = await Comment_1.default.find(filter)
            .populate("author", "name email avatar")
            .populate("mentions.user", "name email")
            .sort({ createdAt: -1 });
        res.json({ comments });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getComments = getComments;
const deleteComment = async (req, res) => {
    try {
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const comment = await Comment_1.default.findById(req.params.id);
        if (!comment) {
            res.status(404).json({ message: "Comment not found" });
            return;
        }
        // Tenant check
        if (!tenantUserIds.includes(comment.author.toString())) {
            res.status(403).json({ message: "Access denied" });
            return;
        }
        // Only author or admin can delete
        if (comment.author.toString() !== req.user._id.toString() &&
            req.user.role !== "admin") {
            res.status(403).json({
                message: "Not authorized to delete this comment",
            });
            return;
        }
        await Comment_1.default.findByIdAndDelete(req.params.id);
        res.json({ message: "Comment deleted" });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteComment = deleteComment;
const searchUsers = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            res.json({ users: [] });
            return;
        }
        // const users = await User.find({
        //     $or: [
        //         { name: { $regex: q, $options: 'i' } },
        //         { email: { $regex: q, $options: 'i' } },
        //     ],
        //     isActive: true,
        // } as any).select('name email avatar').limit(10);
        const users = await User_1.default.find({
            tenantId: req.user.tenantId,
            $or: [
                { name: { $regex: q, $options: "i" } },
                { email: { $regex: q, $options: "i" } },
            ],
            isActive: true,
        })
            .select("name email avatar")
            .limit(10);
        res.json({ users });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.searchUsers = searchUsers;
//# sourceMappingURL=commentController.js.map