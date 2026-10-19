import { Response } from 'express';
import mongoose from 'mongoose';
import CaseFile from '../models/CaseFile';
import Lead from '../models/Lead';
import DocStatus from '../models/DocStatus';
import ActivityLog, { EntityType } from '../models/ActivityLog';
import { AuthRequest } from '../middlewares/auth';
import {
    emitCaseFileCreated,
    emitCaseFileUpdated,
    emitCaseFileDeleted,
    emitLeadUpdated,
} from '../services/crmSocketService';
import { buildDocsFromTemplate, mergeDocsForProductSwitch } from '../services/caseFileService';
import {
    ensureWorkflowDefaults,
    serializeCaseFile,
    DocStatusLike,
    FINALIZING_ITEMS,
    PROPOSAL_ITEMS,
    WORKFLOW_GROUP_ITEMS,
    WorkflowGroup,
} from '../services/caseFileWorkflow';

const getTenantId = (user: any): string =>
    (user.tenantId?._id || user.tenantId).toString();

const escapeRegex = (s: string): string =>
    s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CASE_FILE_STATUSES = ['in_process', 'closed', 'lost'];

// Display labels only â€” stored values stay in_process / closed / lost.
const CASE_FILE_STATUS_LABELS: Record<string, string> = {
    in_process: 'In Process',
    closed: 'Sanctioned',
    lost: 'Lost',
};

const caseFileStatusLabel = (s: string): string =>
    CASE_FILE_STATUS_LABELS[s] || s.replace(/_/g, ' ');

const getPopulated = (id: any) =>
    CaseFile.findById(id)
        .populate('productId', 'name isActive')
        .populate('clarifications.createdBy', 'name email avatar');

// Load the tenant's document statuses once per request â€” used for progress
// computation and one-click status advancing.
const loadDocStatusMap = async (tenantId: any) => {
    const statuses = await DocStatus.find({ tenantId }).sort({ order: 1, createdAt: 1 });
    const map = new Map<string, DocStatusLike>();
    for (const s of statuses) map.set(String(s._id), s.toObject() as any);
    return { statuses, map };
};

// Send a caseFile in its fully serialized (workflow + progress) shape.
const respondCaseFile = async (res: Response, caseFile: any, tenantId: any, extra: any = {}) => {
    const { map } = await loadDocStatusMap(tenantId);
    const payload = serializeCaseFile(caseFile, map);
    res.json({ success: true, caseFile: payload, ...extra });
    return payload;
};

const logCaseFile = async (
    caseFile: any,
    user: any,
    action: string,
    metadata: Record<string, any> = {}
) => {
    await ActivityLog.create({
        action,
        user: user._id,
        entityType: EntityType.CASE_FILE,
        entityId: caseFile._id,
        metadata: {
            leadName: caseFile.leadName,
            phone: caseFile.phone,
            company: caseFile.companyName,
            ...metadata,
        },
    });
};

// Keep the lead's own status in sync with the caseFile outcome.
//  - lost      â†’ lead closed_lost (call activity becomes available)
//  - sanctioned â†’ lead closed_won
//  - reopen     â†’ lead connected / attempted (never leave it closed_lost)
const syncLeadStatus = async (
    caseFile: any,
    nextStatus: 'closed_lost' | 'closed_won' | 'connected' | 'attempted',
    actor: any
) => {
    const lead = await Lead.findOne({ _id: caseFile.leadId, tenantId: caseFile.tenantId });
    if (!lead || lead.status === nextStatus) return null;

    const oldStatus = lead.status;
    lead.status = nextStatus as any;
    await lead.save();

    await ActivityLog.create({
        action: `Lead status changed: ${oldStatus.replace(/_/g, ' ')} â†’ ${nextStatus.replace(/_/g, ' ')}`,
        user: actor._id,
        entityType: EntityType.LEAD,
        entityId: lead._id,
        metadata: {
            name: lead.name,
            oldStatus,
            newStatus: nextStatus,
            phone: lead.phone,
            company: lead.companyName,
            via: 'caseFile',
            caseFileId: caseFile._id,
        },
    });

    const populated = await Lead.findById(lead._id)
        .populate('databaseId', 'name')
        .populate('partnerId', 'companyName personName partnerType')
        .populate('notes.createdBy', 'name email avatar');
    emitLeadUpdated((caseFile.tenantId as any).toString(), populated);
    return populated;
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Reads
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getCaseFiles = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const { status, productId, search, leadId } = req.query as any;
        const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));

        const filter: any = { tenantId: new mongoose.Types.ObjectId(tenantId) };
        if (status && CASE_FILE_STATUSES.includes(String(status))) filter.status = String(status);
        if (productId && mongoose.isValidObjectId(String(productId))) filter.productId = productId;
        // Used by deep links (e.g. a lead clicked inside the partner details modal).
        if (leadId && mongoose.isValidObjectId(String(leadId))) filter.leadId = String(leadId);
        const s = String(search || '').trim();
        if (s) {
            const rx = new RegExp(escapeRegex(s), 'i');
            filter.$or = [{ leadName: rx }, { companyName: rx }, { phone: rx }];
        }

        const [caseFiles, total, docStatusMap] = await Promise.all([
            CaseFile.find(filter)
                .sort({ updatedAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('productId', 'name isActive'),
            CaseFile.countDocuments(filter),
            loadDocStatusMap(tenantId).then((r) => r.map),
        ]);

        res.json({
            success: true,
            caseFiles: caseFiles.map((c) => serializeCaseFile(c, docStatusMap)),
            total,
            page,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getCaseFileStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const rows = await CaseFile.aggregate([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);
        const counts: any = { all: 0, in_process: 0, closed: 0, lost: 0 };
        for (const r of rows) {
            if (counts[r._id] !== undefined) counts[r._id] = r.count;
            counts.all += r.count;
        }
        res.json({ success: true, counts });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getCaseFile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await getPopulated(req.params.id);
        if (!caseFile || String((caseFile as any).tenantId) !== String(tenantId)) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        await respondCaseFile(res, caseFile, tenantId);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Chronological trail: lead import â†’ caseFile created â†’ every logged action.
// Merges caseFile logs with the lead's own activity (calls, notes, status
// changes) so the popup tells the whole story in one place.
export const getCaseFileTimeline = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }

        const lead = await Lead.findById(caseFile.leadId).select(
            'createdAt status name callCount lastCallAt'
        );

        const logs = await ActivityLog.find({
            $or: [
                { entityType: EntityType.CASE_FILE, entityId: caseFile._id },
                { entityType: EntityType.LEAD, entityId: caseFile.leadId },
            ],
        })
            .populate('user', 'name email avatar')
            .sort({ createdAt: 1 })
            .limit(500);

        const entries: any[] = [];

        if (lead?.createdAt) {
            entries.push({
                _id: 'lead-created',
                at: lead.createdAt,
                action: 'Lead imported into the system',
                user: null,
                kind: 'created',
            });
        }

        entries.push({
            _id: 'converted',
            at: caseFile.convertedAt,
            action: 'Lead marked closed won â€” file started',
            user: null,
            kind: 'converted',
        });

        for (const l of logs) {
            entries.push({
                _id: String(l._id),
                at: (l as any).createdAt,
                action: l.action,
                user: (l as any).user
                    ? {
                          _id: (l as any).user._id,
                          name: (l as any).user.name,
                          avatar: (l as any).user.avatar,
                      }
                    : null,
                kind: (l.metadata as any)?.kind || (l.entityType === EntityType.LEAD ? 'lead' : 'caseFile'),
                metadata: l.metadata || {},
            });
        }

        // The caseFile-created log already carries the "Lead converted"
        // message â€” drop the synthetic row when it's present.
        const hasConvertedLog = logs.some((l) => /converted/i.test(l.action));
        const timeline = entries
            .filter((e) => !(e._id === 'converted' && hasConvertedLog))
            .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

        res.json({ success: true, timeline });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Create / update
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Convert a lead: creates the caseFile and marks the lead closed_won.
// Idempotent â€” one caseFile per lead.
export const createCaseFile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const { leadId, productId, notes } = req.body;

        if (!leadId || !mongoose.isValidObjectId(String(leadId))) {
            res.status(400).json({ success: false, message: 'leadId is required' });
            return;
        }
        const lead = await Lead.findOne({ _id: leadId, tenantId });
        if (!lead) {
            res.status(404).json({ success: false, message: 'Lead not found' });
            return;
        }

        const existing = await CaseFile.findOne({ tenantId, leadId: lead._id });
        if (existing) {
            // Already tracked â€” optionally fill in the product if it was missing.
            if (!existing.productId && productId) {
                const docs = await buildDocsFromTemplate(productId, tenantId);
                if (docs) {
                    existing.productId = productId;
                    existing.docs = docs as any;
                    await existing.save();
                }
            }
            ensureWorkflowDefaults(existing);
            await existing.save();
            if (lead.status !== 'closed_won') {
                lead.status = 'closed_won';
                await lead.save();
            }
            const populated = await getPopulated(existing._id);
            emitCaseFileUpdated(tenantId, populated);
            await respondCaseFile(res, populated, tenantId, { existing: true });
            return;
        }

        let docs: any[] = [];
        let resolvedProductId: any = null;
        if (productId) {
            const built = await buildDocsFromTemplate(productId, tenantId);
            if (!built) {
                res.status(400).json({ success: false, message: 'Product not found' });
                return;
            }
            docs = built;
            resolvedProductId = productId;
        }

        const caseFile = await CaseFile.create({
            leadId: lead._id,
            leadName: lead.name,
            companyName: lead.companyName,
            phone: lead.phone,
            productId: resolvedProductId,
            status: 'in_process',
            docs,
            workflow: {
                proposal: PROPOSAL_ITEMS.map((i) => ({ key: i.key, done: false })),
                finalizing: FINALIZING_ITEMS.map((i) => ({ key: i.key, done: false })),
            },
            clarifications: [],
            notes: notes !== undefined ? String(notes || '').trim() || undefined : undefined,
            convertedAt: new Date(),
            tenantId: lead.tenantId,
            createdBy: req.user!._id,
        });

        // Marking the lead won is part of the convert action.
        if (lead.status !== 'closed_won') {
            const oldStatus = lead.status;
            lead.status = 'closed_won';
            await lead.save();
            await ActivityLog.create({
                action: `Lead status changed: ${oldStatus.replace(/_/g, ' ')} â†’ closed won`,
                user: req.user!._id,
                entityType: EntityType.LEAD,
                entityId: lead._id,
                metadata: {
                    name: lead.name,
                    oldStatus,
                    newStatus: 'closed_won',
                    phone: lead.phone,
                    company: lead.companyName,
                },
            });
        }

        await logCaseFile(caseFile, req.user!, `Lead converted: ${lead.name || 'Lead'}`, {
            kind: 'converted',
            leadId: lead._id,
            productId: resolvedProductId,
        });

        const populatedLead = await Lead.findById(lead._id).populate('databaseId', 'name');
        emitLeadUpdated(tenantId, populatedLead);

        const populated = await getPopulated(caseFile._id);
        emitCaseFileCreated(tenantId, populated);

        await respondCaseFile(res, populated, tenantId, { created: true });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateCaseFile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        const { status, productId, notes } = req.body;
        ensureWorkflowDefaults(caseFile);

        // Product switch rebuilds the checklist from the new template while
        // preserving the status of documents that exist in both products.
        if (productId !== undefined) {
            const nextPid = productId ? String(productId) : null;
            const currentPid = caseFile.productId ? String(caseFile.productId) : null;
            if (nextPid !== currentPid) {
                if (!nextPid) {
                    caseFile.productId = null;
                } else {
                    const docs = await buildDocsFromTemplate(nextPid, tenantId);
                    if (!docs) {
                        res.status(400).json({ success: false, message: 'Product not found' });
                        return;
                    }
                    caseFile.productId = nextPid as any;
                    // Keep statuses for documents common to both checklists.
                    caseFile.docs = mergeDocsForProductSwitch(
                        caseFile.docs as any[],
                        docs
                    ) as any;
                    caseFile.markModified('docs');
                }
                await logCaseFile(
                    caseFile,
                    req.user!,
                    nextPid
                        ? 'Loan product updated â€” checklist switched (matching documents kept their status)'
                        : 'Loan product removed',
                    { kind: 'product', productId: nextPid }
                );
            }
        }

        let statusChanged = false;
        const oldStatus = caseFile.status;
        if (
            status !== undefined &&
            CASE_FILE_STATUSES.includes(String(status)) &&
            String(status) !== caseFile.status
        ) {
            caseFile.status = String(status) as any;
            statusChanged = true;
            caseFile.closedAt = caseFile.status === 'in_process' ? null : new Date();

            if (caseFile.status === 'lost') {
                caseFile.lostAt = new Date();
                caseFile.sanctionedAt = null;
                // A reason is required by the dedicated endpoint; keep a
                // sensible fallback when status is changed through PUT.
                if (!caseFile.lostReason) caseFile.lostReason = 'Marked lost';
            } else if (caseFile.status === 'closed') {
                caseFile.sanctionedAt = new Date();
                caseFile.lostAt = null;
                caseFile.lostReason = undefined;
            } else {
                caseFile.lostAt = null;
                caseFile.lostReason = undefined;
                caseFile.sanctionedAt = null;
            }
        }

        if (notes !== undefined) {
            const next = String(notes || '').trim() || undefined;
            if (next !== caseFile.notes) {
                caseFile.notes = next;
                await logCaseFile(caseFile, req.user!, 'File notes updated', { kind: 'note' });
            }
        }

        await caseFile.save();

        if (statusChanged) {
            await logCaseFile(
                caseFile,
                req.user!,
                `File ${caseFileStatusLabel(oldStatus)} â†’ ${caseFileStatusLabel(caseFile.status)}${caseFile.leadName ? `: ${caseFile.leadName}` : ''}`,
                { kind: 'status', oldStatus, newStatus: caseFile.status }
            );

            if (caseFile.status === 'lost') {
                await syncLeadStatus(caseFile, 'closed_lost', req.user!);
            } else if (caseFile.status === 'closed') {
                await syncLeadStatus(caseFile, 'closed_won', req.user!);
            } else if (oldStatus === 'lost') {
                // Reopened: bring the lead back to an active status so the
                // Dial Queue stops showing it as closed lost.
                const lead = await Lead.findById(caseFile.leadId).select('callCount');
                await syncLeadStatus(
                    caseFile,
                    (lead?.callCount || 0) > 0 ? 'connected' : 'attempted',
                    req.user!
                );
            }
        }

        const populated = await getPopulated(caseFile._id);
        emitCaseFileUpdated(tenantId, populated);
        await respondCaseFile(res, populated, tenantId);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Document checklist â€” one-click advance
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const advanceCaseFileDoc = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        const doc = (caseFile.docs as any[]).find(
            (d) => String(d._id) === String(req.params.docId)
        );
        if (!doc) {
            res.status(404).json({ success: false, message: 'Document not found on this file' });
            return;
        }

        const { statuses, map } = await loadDocStatusMap(tenantId);
        const active = statuses.filter((s: any) => s.isActive);
        if (!active.length) {
            res.status(400).json({ success: false, message: 'No active document statuses configured' });
            return;
        }

        const currentIdx = active.findIndex((s: any) => String(s._id) === String(doc.statusId));
        // Advance to the next status in Docs Structure order. At the last
        // status the click is a no-op (use the menu to move backwards).
        const next = active[currentIdx < 0 ? 0 : Math.min(currentIdx + 1, active.length - 1)];
        const alreadyLast = currentIdx >= 0 && currentIdx === active.length - 1;

        if (!alreadyLast) {
            const previous = doc.statusId ? map.get(String(doc.statusId)) : null;
            doc.statusId = next._id;
            doc.statusChangedAt = new Date();
            doc.touched = true;
            caseFile.markModified('docs');
            await caseFile.save();

            await logCaseFile(
                caseFile,
                req.user!,
                `Document "${doc.name}" â†’ ${(next as any).name}`,
                {
                    kind: 'doc',
                    docName: doc.name,
                    oldStatus: previous?.name || 'â€”',
                    newStatus: (next as any).name,
                }
            );
        }

        const populated = await getPopulated(caseFile._id);
        emitCaseFileUpdated(tenantId, populated);
        await respondCaseFile(res, populated, tenantId, {
            advanced: !alreadyLast,
            docName: doc.name,
            status: (next as any).name,
        });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateCaseFileDoc = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        const doc = (caseFile.docs as any[]).find(
            (d) => String(d._id) === String(req.params.docId)
        );
        if (!doc) {
            res.status(404).json({ success: false, message: 'Document not found on this file' });
            return;
        }
        const { statusId } = req.body;
        if (!statusId || !mongoose.isValidObjectId(String(statusId))) {
            res.status(400).json({ success: false, message: 'statusId is required' });
            return;
        }
        const docStatus = await DocStatus.findOne({ _id: statusId, tenantId });
        if (!docStatus) {
            res.status(400).json({ success: false, message: 'Status not found' });
            return;
        }

        const previous = doc.statusId
            ? await DocStatus.findById(doc.statusId).select('name')
            : null;
        doc.statusId = docStatus._id;
        doc.touched = true;
        doc.statusChangedAt = new Date();
        caseFile.markModified('docs');
        await caseFile.save();

        if (String(previous?._id) !== String(docStatus._id)) {
            await logCaseFile(
                caseFile,
                req.user!,
                `Document "${doc.name}" â†’ ${docStatus.name}`,
                {
                    kind: 'doc',
                    docName: doc.name,
                    oldStatus: previous?.name || 'â€”',
                    newStatus: docStatus.name,
                }
            );
        }

        const populated = await getPopulated(caseFile._id);
        emitCaseFileUpdated(tenantId, populated);
        await respondCaseFile(res, populated, tenantId);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Proposal / Finalizing sub-checkpoints
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const toggleWorkflowItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        ensureWorkflowDefaults(caseFile);

        const group = String(req.params.group) as WorkflowGroup;
        if (!WORKFLOW_GROUP_ITEMS[group]) {
            res.status(400).json({ success: false, message: 'Unknown workflow group' });
            return;
        }
        const def = WORKFLOW_GROUP_ITEMS[group].find((i) => i.key === String(req.params.itemKey));
        if (!def) {
            res.status(400).json({ success: false, message: 'Unknown workflow item' });
            return;
        }

        const items = (caseFile.workflow as any)[group] as any[];
        let item = items.find((i) => i.key === def.key);
        if (!item) {
            item = { key: def.key, done: false, doneAt: null, doneBy: null };
            items.push(item);
        }

        const nextDone = req.body?.done !== undefined ? !!req.body.done : !item.done;
        item.done = nextDone;
        item.doneAt = nextDone ? new Date() : null;
        item.doneBy = nextDone ? req.user!._id : null;
        caseFile.markModified('workflow');
        await caseFile.save();

        await logCaseFile(
            caseFile,
            req.user!,
            `${def.label} ${nextDone ? 'completed' : 'reopened'}`,
            { kind: 'checkpoint', group, itemKey: def.key, done: nextDone }
        );

        const populated = await getPopulated(caseFile._id);
        emitCaseFileUpdated(tenantId, populated);
        await respondCaseFile(res, populated, tenantId);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Clarifications (notes trail)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Explicitly confirm that this lead needs no clarifications. This is the only
// way an empty Clarifications checkpoint can complete â€” it never auto-ticks.
export const setClarificationsCleared = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        const cleared = req.body?.cleared !== false;

        if (cleared && (caseFile.clarifications || []).length > 0) {
            res.status(400).json({
                success: false,
                message: 'Resolve or remove the existing clarifications first',
            });
            return;
        }

        if (!!caseFile.clarificationsCleared === cleared) {
            await respondCaseFile(res, await getPopulated(caseFile._id), tenantId);
            return;
        }

        caseFile.clarificationsCleared = cleared;
        caseFile.clarificationsClearedAt = cleared ? new Date() : null;
        caseFile.clarificationsClearedBy = cleared ? req.user!._id : null;
        await caseFile.save();

        await logCaseFile(
            caseFile,
            req.user!,
            cleared ? 'Clarifications confirmed â€” none needed' : 'Clarifications reopened',
            { kind: 'clarification', cleared }
        );

        const populated = await getPopulated(caseFile._id);
        emitCaseFileUpdated(tenantId, populated);
        await respondCaseFile(res, populated, tenantId);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const addClarification = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        const text = String(req.body?.text || '').trim();
        if (!text) {
            res.status(400).json({ success: false, message: 'Clarification text is required' });
            return;
        }

        caseFile.clarifications.push({
            text,
            resolved: false,
            createdBy: req.user!._id,
            createdAt: new Date(),
            resolvedAt: null,
            resolvedBy: null,
        } as any);
        // A new note means clarifications are needed again.
        caseFile.clarificationsCleared = false;
        caseFile.clarificationsClearedAt = null;
        caseFile.clarificationsClearedBy = null;
        await caseFile.save();

        await logCaseFile(caseFile, req.user!, 'Clarification added', {
            kind: 'clarification',
            text,
        });

        const populated = await getPopulated(caseFile._id);
        emitCaseFileUpdated(tenantId, populated);
        await respondCaseFile(res, populated, tenantId);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateClarification = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        const item = (caseFile.clarifications as any[]).find(
            (c) => String(c._id) === String(req.params.clarificationId)
        );
        if (!item) {
            res.status(404).json({ success: false, message: 'Clarification not found' });
            return;
        }

        const { text, resolved } = req.body || {};
        let action = '';
        if (text !== undefined) {
            const next = String(text || '').trim();
            if (!next) {
                res.status(400).json({ success: false, message: 'Clarification text is required' });
                return;
            }
            if (next !== item.text) {
                item.text = next;
                action = 'Clarification updated';
            }
        }
        if (resolved !== undefined && !!resolved !== !!item.resolved) {
            item.resolved = !!resolved;
            item.resolvedAt = resolved ? new Date() : null;
            item.resolvedBy = resolved ? req.user!._id : null;
            action = resolved ? 'Clarification resolved' : 'Clarification reopened';
        }

        if (!action) {
            await respondCaseFile(res, await getPopulated(caseFile._id), tenantId);
            return;
        }

        caseFile.markModified('clarifications');
        await caseFile.save();
        await logCaseFile(caseFile, req.user!, action, {
            kind: 'clarification',
            text: item.text,
        });

        const populated = await getPopulated(caseFile._id);
        emitCaseFileUpdated(tenantId, populated);
        await respondCaseFile(res, populated, tenantId);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const deleteClarification = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        const item = (caseFile.clarifications as any[]).find(
            (c) => String(c._id) === String(req.params.clarificationId)
        );
        if (!item) {
            res.status(404).json({ success: false, message: 'Clarification not found' });
            return;
        }

        caseFile.clarifications = (caseFile.clarifications as any[]).filter(
            (c) => String(c._id) !== String(req.params.clarificationId)
        ) as any;
        await caseFile.save();

        await logCaseFile(caseFile, req.user!, 'Clarification deleted', {
            kind: 'clarification',
            text: item.text,
        });

        const populated = await getPopulated(caseFile._id);
        emitCaseFileUpdated(tenantId, populated);
        await respondCaseFile(res, populated, tenantId);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Outcomes â€” sanction / lose / reopen
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const sanctionCaseFile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        if (caseFile.status === 'closed') {
            await respondCaseFile(res, await getPopulated(caseFile._id), tenantId);
            return;
        }

        caseFile.status = 'closed';
        caseFile.closedAt = new Date();
        caseFile.sanctionedAt = new Date();
        caseFile.lostAt = null;
        caseFile.lostReason = undefined;
        await caseFile.save();

        await logCaseFile(caseFile, req.user!, `File sanctioned${caseFile.leadName ? `: ${caseFile.leadName}` : ''}`, {
            kind: 'status',
            newStatus: 'closed',
        });
        await syncLeadStatus(caseFile, 'closed_won', req.user!);

        const populated = await getPopulated(caseFile._id);
        emitCaseFileUpdated(tenantId, populated);
        await respondCaseFile(res, populated, tenantId);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const loseCaseFile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        const reason = String(req.body?.reason || '').trim();
        if (!reason) {
            res.status(400).json({ success: false, message: 'A lost reason is required' });
            return;
        }

        caseFile.status = 'lost';
        caseFile.closedAt = new Date();
        caseFile.lostAt = new Date();
        caseFile.lostReason = reason;
        caseFile.sanctionedAt = null;
        await caseFile.save();

        await logCaseFile(caseFile, req.user!, `File marked lost â€” ${reason}`, {
            kind: 'status',
            newStatus: 'lost',
            reason,
        });
        // Lost leads stay callable in the Dial Queue (including partner leads).
        await syncLeadStatus(caseFile, 'closed_lost', req.user!);

        const populated = await getPopulated(caseFile._id);
        emitCaseFileUpdated(tenantId, populated);
        await respondCaseFile(res, populated, tenantId);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const reopenCaseFile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        if (caseFile.status === 'in_process') {
            await respondCaseFile(res, await getPopulated(caseFile._id), tenantId);
            return;
        }

        const wasLost = caseFile.status === 'lost';
        const previousLostReason = caseFile.lostReason;
        caseFile.status = 'in_process';
        caseFile.closedAt = null;
        caseFile.lostAt = null;
        caseFile.lostReason = undefined;
        caseFile.sanctionedAt = null;
        await caseFile.save();

        await logCaseFile(
            caseFile,
            req.user!,
            `File reopened${wasLost ? ' â€” lead is active again' : ''}`,
            { kind: 'status', newStatus: 'in_process', previousLostReason }
        );

        if (wasLost) {
            const lead = await Lead.findById(caseFile.leadId).select('callCount status');
            const next = (lead?.callCount || 0) > 0 ? 'connected' : 'attempted';
            await syncLeadStatus(caseFile, next, req.user!);
        }

        const populated = await getPopulated(caseFile._id);
        emitCaseFileUpdated(tenantId, populated);
        await respondCaseFile(res, populated, tenantId);
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const deleteCaseFile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const caseFile = await CaseFile.findOne({ _id: req.params.id, tenantId });
        if (!caseFile) {
            res.status(404).json({ success: false, message: 'File not found' });
            return;
        }
        await caseFile.deleteOne();
        await ActivityLog.create({
            action: `File deleted${caseFile.leadName ? `: ${caseFile.leadName}` : ''}`,
            user: req.user!._id,
            entityType: EntityType.CASE_FILE,
            entityId: caseFile._id,
            metadata: { leadName: caseFile.leadName, phone: caseFile.phone },
        });
        emitCaseFileDeleted(tenantId, caseFile._id.toString());
        res.json({ success: true, message: 'File deleted' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};
