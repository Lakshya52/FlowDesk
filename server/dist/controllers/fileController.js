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
exports.deleteFile = exports.downloadFile = exports.getFiles = exports.uploadFile = void 0;
const Attachment_1 = __importDefault(require("../models/Attachment"));
const ActivityLog_1 = __importStar(require("../models/ActivityLog"));
const mongoose_1 = __importDefault(require("mongoose"));
const gridfs_1 = require("../utils/gridfs");
const tenant_1 = require("../utils/tenant");
const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ message: "No file provided" });
            return;
        }
        const { assignmentId, taskId } = req.body;
        // Manual upload to GridFS from buffer
        const { filename } = await (0, gridfs_1.uploadToGridFS)(req.file.buffer, req.file.originalname, req.file.mimetype);
        const attachment = await Attachment_1.default.create({
            fileName: filename,
            originalName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            filePath: `/uploads/${filename}`,
            uploadedBy: req.user._id,
            assignment: assignmentId,
            task: taskId,
        });
        await ActivityLog_1.default.create({
            action: "File uploaded",
            user: req.user._id,
            entityType: ActivityLog_1.EntityType.ATTACHMENT,
            entityId: attachment._id,
            metadata: { fileName: attachment.originalName, assignmentId, taskId },
        });
        const populated = await Attachment_1.default.findById(attachment._id).populate("uploadedBy", "name email");
        res.status(201).json({ attachment: populated });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.uploadFile = uploadFile;
const getFiles = async (req, res) => {
    try {
        const { assignmentId, taskId } = req.query;
        const tenantUserIds = await (0, tenant_1.getTenantUserIds)(req.user);
        const filter = {};
        if (assignmentId)
            filter.assignment = assignmentId;
        if (taskId)
            filter.task = taskId;
        filter.uploadedBy = { $in: tenantUserIds };
        const attachments = await Attachment_1.default.find(filter)
            .populate("uploadedBy", "name email")
            .sort({ createdAt: -1 });
        res.json({ attachments });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getFiles = getFiles;
const downloadFile = async (req, res) => {
    try {
        const attachment = await Attachment_1.default.findById(req.params.id);
        if (!attachment) {
            res.status(404).json({ message: "File not found" });
            return;
        }
        if (!mongoose_1.default.connection.db) {
            res.status(500).json({ message: "Database connection not established" });
            return;
        }
        const bucket = new mongoose_1.default.mongo.GridFSBucket(mongoose_1.default.connection.db, {
            bucketName: "uploads",
        });
        const files = await bucket
            .find({ filename: attachment.fileName })
            .toArray();
        if (!files || files.length === 0) {
            res.status(404).json({ message: "File no longer exists in database" });
            return;
        }
        // Set proper Content-Type to preserve original file format
        // res.setHeader("Content-Type", attachment.fileType);
        res.setHeader("Content-Type", "application/octet-stream");
        // res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.originalName)}"`);
        res.setHeader("Content-Disposition", `attachment; filename="FlowDesk_${attachment.originalName}"; filename*=UTF-8''FlowDesk_${encodeURIComponent(attachment.originalName)}`);
        const downloadStream = bucket.openDownloadStreamByName(attachment.fileName);
        downloadStream.pipe(res);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.downloadFile = downloadFile;
const deleteFile = async (req, res) => {
    try {
        const attachment = await Attachment_1.default.findById(req.params.id);
        if (!attachment) {
            res.status(404).json({ message: "File not found" });
            return;
        }
        if (req.user.role !== "admin" &&
            attachment.uploadedBy.toString() !== req.user._id.toString()) {
            res.status(403).json({ message: "Not authorized to delete this file" });
            return;
        }
        if (attachment.fileName) {
            await (0, gridfs_1.deleteFromGridFS)(attachment.fileName);
        }
        await Attachment_1.default.findByIdAndDelete(req.params.id);
        await ActivityLog_1.default.create({
            action: "File deleted",
            user: req.user._id,
            entityType: ActivityLog_1.EntityType.ATTACHMENT,
            entityId: attachment._id,
            metadata: { fileName: attachment.originalName },
        });
        res.json({ message: "File deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteFile = deleteFile;
//# sourceMappingURL=fileController.js.map