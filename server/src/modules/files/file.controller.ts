import { Response } from "express";
import Attachment from './attachment.model';
import ActivityLog, { EntityType } from '../activityLogs/activityLog.model';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import mongoose from "mongoose";
import { uploadToGridFS, deleteFromGridFS } from '../../shared/utils/gridfs';
import { getTenantUserIds } from '../../shared/utils/tenant';

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
