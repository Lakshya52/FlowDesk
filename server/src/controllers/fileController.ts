import { Response } from "express";
import Attachment from "../models/Attachment";
import ActivityLog, { EntityType } from "../models/ActivityLog";
import { AuthRequest } from "../middlewares/auth";
import mongoose from "mongoose";
import { uploadToGridFS, deleteFromGridFS } from "../utils/gridfs";
import { checkFileAccess } from "../utils/fileAccess";
import { getTenantUserIds } from "../utils/tenant";

export const uploadFile = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ message: "No file provided" });
      return;
    }

    const { assignmentId, taskId } = req.body;

    // Manual upload to GridFS from buffer
    const { filename } = await uploadToGridFS(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );

    const attachment = await Attachment.create({
      fileName: filename,
      originalName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      filePath: `/uploads/${filename}`,
      uploadedBy: req.user!._id,
      assignment: assignmentId,
      task: taskId,
    });

    await ActivityLog.create({
      action: "File uploaded",
      user: req.user!._id,
      entityType: EntityType.ATTACHMENT,
      entityId: attachment._id,
      metadata: { fileName: attachment.originalName, assignmentId, taskId },
    });

    const populated = await Attachment.findById(attachment._id).populate(
      "uploadedBy",
      "name email",
    );

    res.status(201).json({ attachment: populated });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getFiles = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { assignmentId, taskId } = req.query;
    const tenantUserIds = await getTenantUserIds(req.user);
    const filter: any = {};

    if (assignmentId) filter.assignment = assignmentId;
    if (taskId) filter.task = taskId;
    filter.uploadedBy = { $in: tenantUserIds };

    const attachments = await Attachment.find(filter)
      .populate("uploadedBy", "name email")
      .sort({ createdAt: -1 });

    res.json({ attachments });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const downloadFile = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const attachment = await Attachment.findById(req.params.id);
    if (!attachment) {
      res.status(404).json({ message: "File not found" });
      return;
    }

    if (!mongoose.connection.db) {
      res.status(500).json({ message: "Database connection not established" });
      return;
    }

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
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

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="FlowDesk_${attachment.originalName}"; filename*=UTF-8''FlowDesk_${encodeURIComponent(attachment.originalName)}`,
    );

    const downloadStream = bucket.openDownloadStreamByName(attachment.fileName);
    downloadStream.pipe(res);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// Tenant-checked download by GridFS filename. Used for sensitive files
// (e.g. partner agreements) by clients that can send an Authorization
// header. Filenames are unique per upload, so responses are immutable.
export const downloadByName = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const access = await checkFileAccess(String(req.params.filename), req.user);
    if (access === "not-found") {
      res.status(404).json({ message: "File not found" });
      return;
    }
    if (access === "forbidden") {
      res.status(403).json({ message: "Not authorized to access this file" });
      return;
    }

    if (!mongoose.connection.db) {
      res.status(500).json({ message: "Database connection not established" });
      return;
    }

    const filename = String(req.params.filename).replace(/^\/uploads\//, "");
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    const files = await bucket.find({ filename }).toArray();
    if (!files || files.length === 0) {
      res.status(404).json({ message: "File no longer exists in database" });
      return;
    }

    const stored = files[0] as any;
    if (stored.contentType) {
      res.setHeader("Content-Type", stored.contentType);
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
    }
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    const downloadStream = bucket.openDownloadStreamByName(filename);
    downloadStream.pipe(res);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteFile = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const attachment = await Attachment.findById(req.params.id);
    if (!attachment) {
      res.status(404).json({ message: "File not found" });
      return;
    }

    if (
      req.user!.role !== "admin" &&
      attachment.uploadedBy.toString() !== req.user!._id.toString()
    ) {
      res.status(403).json({ message: "Not authorized to delete this file" });
      return;
    }

    if (attachment.fileName) {
      await deleteFromGridFS(attachment.fileName);
    }

    await Attachment.findByIdAndDelete(req.params.id);

    await ActivityLog.create({
      action: "File deleted",
      user: req.user!._id,
      entityType: EntityType.ATTACHMENT,
      entityId: attachment._id,
      metadata: { fileName: attachment.originalName },
    });

    res.json({ message: "File deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
