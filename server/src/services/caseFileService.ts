import DocStatus from '../models/DocStatus';
import LoanProduct from '../models/LoanProduct';
import CaseFile from '../models/CaseFile';
import ActivityLog, { EntityType } from '../models/ActivityLog';
import { emitCaseFileCreated, emitCaseFileUpdated } from './crmSocketService';

// The status applied to freshly-created document entries: the flagged default,
// falling back to the first active status by order.
export const getDefaultDocStatusId = async (tenantId: any) => {
    const dflt = await DocStatus.findOne({ tenantId, isDefault: true, isActive: true });
    if (dflt) return dflt._id as any;
    const first = await DocStatus.findOne({ tenantId, isActive: true }).sort({ order: 1, createdAt: 1 });
    return first ? (first._id as any) : null;
};

// Snapshot a product's doc template into caseFile checklist entries.
export const buildDocsFromTemplate = async (productId: any, tenantId: any) => {
    const product = await LoanProduct.findOne({ _id: productId, tenantId });
    if (!product) return null;
    const defaultStatusId = await getDefaultDocStatusId(tenantId);
    return (product.docs as any[])
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((d) => ({
            name: d.name,
            required: d.required !== false,
            statusId: defaultStatusId,
            statusChangedAt: null,
            touched: false,
            removedFromTemplate: false,
        }));
};

// Called whenever a product's doc template changes. Keeps in-process caseFiles
// of that product in sync:
//  - docs dropped from the template are removed while untouched, otherwise kept
//    (flagged removedFromTemplate) so completed work is never lost
//  - docs added to the template appear as new entries with the default status
export const reconcileCaseFileDocs = async (productId: any, tenantId: any) => {
    const product = await LoanProduct.findOne({ _id: productId, tenantId });
    if (!product) return 0;
    const caseFiles = await CaseFile.find({ tenantId, productId, status: 'in_process' });
    if (!caseFiles.length) return 0;

    const defaultStatusId = await getDefaultDocStatusId(tenantId);
    const template = (product.docs as any[]).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const templateNames = new Set(template.map((d) => String(d.name).toLowerCase()));

    let changed = 0;
    for (const conv of caseFiles) {
        const before = JSON.stringify((conv.docs as any[]).map((d) => [d.name, d.required, String(d.statusId), !!d.removedFromTemplate]));

        // 1. Drop untouched docs removed from the template, keep worked-on ones.
        conv.docs = (conv.docs as any[]).filter(
            (d) => templateNames.has(String(d.name).toLowerCase()) || d.touched
        ) as any;

        // 2. Flag kept-but-removed docs; clear the flag if the doc came back.
        for (const d of conv.docs as any[]) {
            d.removedFromTemplate = !templateNames.has(String(d.name).toLowerCase());
        }

        // 3. Append template docs that are missing (newly added to the structure).
        const currentNames = new Set((conv.docs as any[]).map((d) => String(d.name).toLowerCase()));
        for (const t of template) {
            if (!currentNames.has(String(t.name).toLowerCase())) {
                (conv.docs as any[]).push({
                    name: t.name,
                    required: t.required !== false,
                    statusId: defaultStatusId,
                    statusChangedAt: null,
                    touched: false,
                    removedFromTemplate: false,
                });
            }
        }

        const after = JSON.stringify((conv.docs as any[]).map((d) => [d.name, d.required, String(d.statusId), !!d.removedFromTemplate]));
        if (before !== after) {
            await conv.save();
            changed++;
        }
    }
    return changed;
};

// Called from the lead side (Dial Queue status change, call logging) so the
// caseFile tracker mirrors the lead outcome:
//  - lead â†’ closed_lost  : caseFile is marked Lost (reason kept if already set)
//  - lead leaves closed_lost : a lost caseFile is reopened automatically
export const syncCaseFileForLeadStatus = async (
    lead: any,
    oldStatus: string,
    actor: any
) => {
    if (!lead) return null;
    const caseFile = await CaseFile.findOne({
        tenantId: lead.tenantId,
        leadId: lead._id,
    });
    if (!caseFile) return null;

    if (lead.status === 'closed_lost' && caseFile.status !== 'lost') {
        caseFile.status = 'lost';
        caseFile.closedAt = new Date();
        caseFile.lostAt = new Date();
        caseFile.lostReason = caseFile.lostReason || 'Lead marked closed lost';
        await caseFile.save();

        await ActivityLog.create({
            action: `File marked lost â€” ${caseFile.lostReason}`,
            user: actor?._id || lead._id,
            entityType: EntityType.CASE_FILE,
            entityId: caseFile._id,
            metadata: {
                kind: 'status',
                leadName: caseFile.leadName,
                newStatus: 'lost',
                reason: caseFile.lostReason,
                via: 'lead',
            },
        });

        emitCaseFileUpdated((caseFile.tenantId as any).toString(), caseFile);
        return caseFile;
    }

    if (lead.status !== 'closed_lost' && caseFile.status === 'lost') {
        const previousReason = caseFile.lostReason;
        caseFile.status = 'in_process';
        caseFile.closedAt = null;
        caseFile.lostAt = null;
        caseFile.lostReason = undefined;
        await caseFile.save();

        await ActivityLog.create({
            action: 'File reopened â€” lead is active again',
            user: actor?._id || lead._id,
            entityType: EntityType.CASE_FILE,
            entityId: caseFile._id,
            metadata: {
                kind: 'status',
                leadName: caseFile.leadName,
                newStatus: 'in_process',
                previousLostReason: previousReason,
                via: 'lead',
                oldLeadStatus: oldStatus,
                newLeadStatus: lead.status,
            },
        });

        emitCaseFileUpdated((caseFile.tenantId as any).toString(), caseFile);
        return caseFile;
    }

    return null;
};

// Switch a caseFile to a different product's checklist without losing work.
// Documents that exist in both templates (matched by name) keep their current
// status; only genuinely new documents start at the default status. Touched
// documents that are no longer in the template are kept and flagged as removed.
export const mergeDocsForProductSwitch = (existingDocs: any[], templateDocs: any[]) => {
    const norm = (name: any) => String(name || '').trim().toLowerCase();
    const existingByName = new Map<string, any>();
    for (const d of existingDocs) {
        const plain = d?.toObject ? d.toObject() : d;
        existingByName.set(norm(plain.name), plain);
    }
    const templateNames = new Set(templateDocs.map((t) => norm(t.name)));
    const reused = new Set<string>();

    const merged: any[] = templateDocs.map((t) => {
        const key = norm(t.name);
        const prev = existingByName.get(key);
        // Guard against duplicate names in a template reusing one source doc.
        if (!prev || reused.has(String(prev._id))) {
            return { ...t, removedFromTemplate: false };
        }
        reused.add(String(prev._id));
        return {
            // Preserve identity, status and audit info for common documents.
            _id: prev._id,
            name: t.name,
            required: t.required !== false,
            statusId: prev.statusId ?? t.statusId ?? null,
            statusChangedAt: prev.statusChangedAt || null,
            touched: !!prev.touched,
            removedFromTemplate: false,
        };
    });

    // Keep worked-on documents that the new product doesn't include, so a
    // completed checklist item never silently disappears.
    for (const d of existingDocs) {
        const plain = d?.toObject ? d.toObject() : d;
        if (!templateNames.has(norm(plain.name)) && plain.touched) {
            merged.push({ ...plain, removedFromTemplate: true });
        }
    }

    return merged;
};

// Safety net: any lead that reaches closed_won gets a caseFile, no matter
// which screen changed the status. Idempotent (one caseFile per lead).
export const ensureCaseFileForLead = async (lead: any, actor: any) => {
    if (!lead || lead.status !== 'closed_won') return null;

    const existing = await CaseFile.findOne({ tenantId: lead.tenantId, leadId: lead._id });
    if (existing) return existing;

    try {
        // Partner leads can arrive already carrying a product â€” carry it over
        // so the caseFile tracker starts with the right doc checklist.
        const productId = (lead as any).productId || null;
        const docs = productId
            ? (await buildDocsFromTemplate(productId, lead.tenantId)) || []
            : [];

        const caseFile = await CaseFile.create({
            leadId: lead._id,
            leadName: lead.name,
            companyName: lead.companyName,
            phone: lead.phone,
            productId,
            status: 'in_process',
            docs,
            clarifications: [],
            convertedAt: new Date(),
            tenantId: lead.tenantId,
            createdBy: actor?._id || lead._id,
        });

        await ActivityLog.create({
            action: `Lead converted: ${lead.name || 'Lead'}`,
            user: actor?._id || lead._id,
            entityType: EntityType.CASE_FILE,
            entityId: caseFile._id,
            metadata: {
                leadName: lead.name,
                phone: lead.phone,
                company: lead.companyName,
                leadId: lead._id,
            },
        });

        emitCaseFileCreated((lead.tenantId as any).toString(), caseFile);
        return caseFile;
    } catch (err: any) {
        // Unique index race â€” reuse the caseFile that won the race.
        if (err?.code === 11000) {
            return CaseFile.findOne({ tenantId: lead.tenantId, leadId: lead._id });
        }
        throw err;
    }
};
