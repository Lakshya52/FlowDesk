import { Response } from 'express';
import mongoose from 'mongoose';
// @ts-ignore
import archiver from 'archiver';
import BackupSchedule from '../models/BackupSchedule';
import User from '../models/User';
import { AuthRequest } from '../middlewares/auth';
import { getTenantId, getTenantUserIds } from '../utils/tenant';
import { sendBackupEmail } from '../services/emailService';

const getCollections = () => ({
  withTenantId: [
    { name: 'users', model: 'User' },
    { name: 'leads', model: 'Lead' },
    { name: 'campaigns', model: 'Campaign' },
    { name: 'fieldvisits', model: 'FieldVisit' },
    { name: 'locationtracks', model: 'LocationTrack' },
  ],
  withIndirect: [
    { name: 'assignments', model: 'Assignment' },
    { name: 'tasks', model: 'Task' },
    { name: 'comments', model: 'Comment' },
    { name: 'attachments', model: 'Attachment' },
    { name: 'activitylogs', model: 'ActivityLog' },
    { name: 'notifications', model: 'Notification' },
    { name: 'canvasnotes', model: 'CanvasNote' },
    { name: 'teams', model: 'Team' },
    { name: 'conversations', model: 'Conversation' },
    { name: 'calendars', model: 'Calendar' },
  ],
  dependent: [
    { name: 'messages', model: 'Message', via: 'conversation', parent: 'conversations' },
    { name: 'chatmessages', model: 'ChatMessage', via: 'assignment', parent: 'assignments' },
    { name: 'contacts', model: 'Contact', via: 'companyId', parent: 'companies' },
  ],
});

export const exportBackup = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req.user);
    const tenantUserIds = await getTenantUserIds(req.user);
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const userObjectIds = tenantUserIds.map((id) => new mongoose.Types.ObjectId(id));

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="flowdesk-backup-${new Date().toISOString().split('T')[0]}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    const collections = getCollections();

    for (const col of collections.withTenantId) {
      const Model = mongoose.models[col.model] || (await import(`../models/${col.model}`)).default;
      const docs = await Model.find({ tenantId: tenantObjectId }).lean();
      archive.append(JSON.stringify(docs, null, 2), { name: `${col.name}.json` });
    }

    // Store parent collection data for dependent queries
    const parentData: Record<string, any[]> = {};

    for (const col of collections.withIndirect) {
      const Model = mongoose.models[col.model] || (await import(`../models/${col.model}`)).default;
      let docs: any[] = [];
      if (col.name === 'tasks') {
        docs = await Model.find({ $or: [{ assignedTo: { $in: userObjectIds } }, { createdBy: { $in: userObjectIds } }] }).lean();
      } else if (col.name === 'attachments') {
        docs = await Model.find({ uploadedBy: { $in: userObjectIds } }).lean();
      } else if (col.name === 'activitylogs' || col.name === 'notifications') {
        docs = await Model.find({ user: { $in: userObjectIds } }).lean();
      } else if (col.name === 'canvasnotes') {
        docs = await Model.find({ user: { $in: userObjectIds } }).lean();
      } else if (col.name === 'teams') {
        docs = await Model.find({ $or: [{ manager: { $in: userObjectIds } }, { members: { $in: userObjectIds } }] }).lean();
      } else if (col.name === 'conversations') {
        docs = await Model.find({ participants: { $in: userObjectIds } }).lean();
      } else if (col.name === 'calendars') {
        docs = await Model.find({ owner: { $in: userObjectIds } }).lean();
      } else {
        docs = await Model.find({ createdBy: { $in: userObjectIds } }).lean();
      }
      parentData[col.name] = docs;
      archive.append(JSON.stringify(docs, null, 2), { name: `${col.name}.json` });
    }

    // Companies: find those referenced by tenant's leads
    const LeadModel = mongoose.models.Lead || (await import('../models/Lead')).default;
    const tenantLeads = await LeadModel.find({ tenantId: tenantObjectId }).lean();
    const companyIds = [...new Set(tenantLeads.map((l: any) => l.companyId?.toString()).filter(Boolean))];
    let companies: any[] = [];
    if (companyIds.length > 0) {
      const CompanyModel = mongoose.models.Company || (await import('../models/Company')).default;
      companies = await CompanyModel.find({ _id: { $in: companyIds.map((id) => new mongoose.Types.ObjectId(id)) } }).lean();
    }
    parentData.companies = companies;
    archive.append(JSON.stringify(companies, null, 2), { name: 'companies.json' });

    // Dependent collections filtered by parent IDs
    for (const col of collections.dependent) {
      const Model = mongoose.models[col.model] || (await import(`../models/${col.model}`)).default;
      const parentDocs = parentData[col.parent] || [];
      const parentIds = parentDocs.map((p: any) => p._id).filter(Boolean);
      let docs: any[] = [];
      if (parentIds.length > 0) {
        if (col.name === 'contacts') {
          docs = await Model.find({ companyId: { $in: parentIds } }).lean();
        } else {
          docs = await Model.find({ [col.via]: { $in: parentIds } }).lean();
        }
      }
      archive.append(JSON.stringify(docs, null, 2), { name: `${col.name}.json` });
    }

    const TenantModel = mongoose.models.Tenant || (await import('../models/Tenant')).default;
    const tenantDoc = await TenantModel.findById(tenantObjectId).lean();
    archive.append(JSON.stringify(tenantDoc || {}, null, 2), { name: 'tenant.json' });

    await archive.finalize();
  } catch (error: any) {
    console.error('[BACKUP] Export failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Backup export failed', error: error.message });
    }
  }
};

export const getSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req.user);
    const schedules = await BackupSchedule.find({ tenantId }).sort({ createdAt: -1 });
    res.json({ schedules });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req.user);
    const { frequency, hour, minute, dayOfWeek, dayOfMonth, email, isActive } = req.body;

    const now = new Date();
    const nextRunAt = new Date();
    nextRunAt.setHours(hour, minute, 0, 0);
    if (nextRunAt <= now) {
      nextRunAt.setDate(nextRunAt.getDate() + 1);
    }

    const schedule = await BackupSchedule.create({
      tenantId, frequency, hour, minute, dayOfWeek, dayOfMonth, email,
      isActive: isActive ?? true, nextRunAt,
    });

    res.json({ message: 'Backup schedule created', schedule });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req.user);
    const schedule = await BackupSchedule.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!schedule) {
      res.status(404).json({ message: 'Schedule not found' });
      return;
    }
    res.json({ message: 'Backup schedule removed' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const triggerScheduledBackup = async (tenantId: string, email: string): Promise<boolean> => {
  try {
    const users = await User.find({ tenantId }).limit(1).lean();
    if (!users.length) return false;

    const tenantUserIds = await getTenantUserIds({ tenantId: { _id: tenantId } } as any);
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const userObjectIds = tenantUserIds.map((id) => new mongoose.Types.ObjectId(id));

    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));

    const collections = getCollections();

    const appendDocs = async (Model: any, filter: any, name: string) => {
      const docs = await Model.find(filter).lean();
      archive.append(JSON.stringify(docs, null, 2), { name: `${name}.json` });
    };

    for (const col of collections.withTenantId) {
      const Model = mongoose.models[col.model] || (await import(`../models/${col.model}`)).default;
      await appendDocs(Model, { tenantId: tenantObjectId }, col.name);
    }
    const parentData: Record<string, any[]> = {};

    for (const col of collections.withIndirect) {
      const Model = mongoose.models[col.model] || (await import(`../models/${col.model}`)).default;
      let filter: any = { createdBy: { $in: userObjectIds } };
      if (col.name === 'tasks') filter = { $or: [{ assignedTo: { $in: userObjectIds } }, { createdBy: { $in: userObjectIds } }] };
      if (col.name === 'attachments') filter = { uploadedBy: { $in: userObjectIds } };
      if (col.name === 'activitylogs' || col.name === 'notifications' || col.name === 'canvasnotes') filter = { user: { $in: userObjectIds } };
      if (col.name === 'teams') filter = { $or: [{ manager: { $in: userObjectIds } }, { members: { $in: userObjectIds } }] };
      if (col.name === 'conversations') filter = { participants: { $in: userObjectIds } };
      if (col.name === 'calendars') filter = { owner: { $in: userObjectIds } };
      const docs = await Model.find(filter).lean();
      parentData[col.name] = docs;
      archive.append(JSON.stringify(docs, null, 2), { name: `${col.name}.json` });
    }

    // Companies referenced by tenant's leads
    const LeadModel = mongoose.models.Lead || (await import('../models/Lead')).default;
    const tenantLeads = await LeadModel.find({ tenantId: tenantObjectId }).lean();
    const companyIds = [...new Set(tenantLeads.map((l: any) => l.companyId?.toString()).filter(Boolean))];
    let companies: any[] = [];
    if (companyIds.length > 0) {
      const CompanyModel = mongoose.models.Company || (await import('../models/Company')).default;
      companies = await CompanyModel.find({ _id: { $in: companyIds.map((id) => new mongoose.Types.ObjectId(id)) } }).lean();
    }
    parentData.companies = companies;
    archive.append(JSON.stringify(companies, null, 2), { name: 'companies.json' });

    // Dependent collections
    for (const col of collections.dependent) {
      const Model = mongoose.models[col.model] || (await import(`../models/${col.model}`)).default;
      const pDocs = parentData[col.parent] || [];
      const pIds = pDocs.map((p: any) => p._id).filter(Boolean);
      let docs: any[] = [];
      if (pIds.length > 0) {
        if (col.name === 'contacts') {
          docs = await Model.find({ companyId: { $in: pIds } }).lean();
        } else {
          docs = await Model.find({ [col.via]: { $in: pIds } }).lean();
        }
      }
      archive.append(JSON.stringify(docs, null, 2), { name: `${col.name}.json` });
    }

    const TenantModel = mongoose.models.Tenant || (await import('../models/Tenant')).default;
    const tenantDoc = await TenantModel.findById(tenantObjectId).lean();
    archive.append(JSON.stringify(tenantDoc || {}, null, 2), { name: 'tenant.json' });

    await archive.finalize();

    const zipBuffer = Buffer.concat(chunks);
    const filename = `flowdesk-backup-${new Date().toISOString().split('T')[0]}.zip`;

    await sendBackupEmail(email, `FlowDesk Backup - ${new Date().toLocaleDateString()}`, zipBuffer, filename);

    return true;
  } catch (error) {
    console.error('[BACKUP] Scheduled backup failed:', error);
    return false;
  }
};

export const emailBackupNow = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req.user);
    const email = req.body.email || req.user?.email;

    if (!email) {
      res.status(400).json({ message: 'Email is required' });
      return;
    }

    const success = await triggerScheduledBackup(tenantId, email);
    if (success) {
      res.json({ message: `Backup sent to ${email}` });
    } else {
      res.status(500).json({ message: 'Failed to generate or send backup' });
    }
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
