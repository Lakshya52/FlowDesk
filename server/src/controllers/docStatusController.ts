import { Response } from 'express';
import DocStatus, { DEFAULT_DOC_STATUSES } from '../models/DocStatus';
import CaseFile from '../models/CaseFile';
import { AuthRequest } from '../middlewares/auth';
import { emitDocStatusChanged } from '../services/crmSocketService';

const getTenantId = (user: any): string =>
    (user.tenantId?._id || user.tenantId).toString();

const escapeRegex = (s: string): string =>
    s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const getDocStatuses = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        let docStatuses = await DocStatus.find({ tenantId }).sort({ order: 1, createdAt: 1 });
        if (!docStatuses.length) {
            // First visit — seed the default vocabulary (fully editable afterwards).
            await DocStatus.insertMany(
                DEFAULT_DOC_STATUSES.map((s) => ({ ...s, tenantId, createdBy: req.user!._id }))
            );
            docStatuses = await DocStatus.find({ tenantId }).sort({ order: 1, createdAt: 1 });
        }
        res.json({ success: true, docStatuses });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createDocStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { name, color, isDefault, isResolved } = req.body;
        const trimmed = String(name || '').trim();
        if (!trimmed) {
            res.status(400).json({ success: false, message: 'Status name is required' });
            return;
        }
        const tenantId = getTenantId(req.user!);
        const duplicate = await DocStatus.findOne({
            tenantId,
            name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i'),
        });
        if (duplicate) {
            res.status(400).json({ success: false, message: 'A status with this name already exists' });
            return;
        }
        const last = await DocStatus.findOne({ tenantId }).sort({ order: -1 }).select('order');
        if (isDefault) {
            await DocStatus.updateMany({ tenantId }, { $set: { isDefault: false } });
        }
        const docStatus = await DocStatus.create({
            name: trimmed,
            color: HEX_COLOR.test(String(color || '')) ? String(color) : '#94a3b8',
            order: (last?.order ?? -1) + 1,
            isDefault: !!isDefault,
            isResolved: !!isResolved,
            isActive: true,
            tenantId,
            createdBy: req.user!._id,
        });
        emitDocStatusChanged(tenantId, docStatus);
        res.status(201).json({ success: true, docStatus });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateDocStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const docStatus = await DocStatus.findOne({ _id: req.params.id, tenantId });
        if (!docStatus) {
            res.status(404).json({ success: false, message: 'Status not found' });
            return;
        }
        const { name, color, isDefault, isResolved, isActive } = req.body;

        if (name !== undefined) {
            const trimmed = String(name || '').trim();
            if (!trimmed) {
                res.status(400).json({ success: false, message: 'Status name is required' });
                return;
            }
            const duplicate = await DocStatus.findOne({
                tenantId,
                _id: { $ne: docStatus._id },
                name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i'),
            });
            if (duplicate) {
                res.status(400).json({ success: false, message: 'A status with this name already exists' });
                return;
            }
            docStatus.name = trimmed;
        }
        if (color !== undefined && HEX_COLOR.test(String(color))) {
            docStatus.color = String(color);
        }
        if (isResolved !== undefined) docStatus.isResolved = !!isResolved;
        if (isActive !== undefined) docStatus.isActive = !!isActive;
        if (isDefault !== undefined) {
            if (isDefault) {
                // Only one default at a time; a default must be selectable.
                await DocStatus.updateMany(
                    { tenantId, _id: { $ne: docStatus._id } },
                    { $set: { isDefault: false } }
                );
                docStatus.isDefault = true;
                docStatus.isActive = true;
            } else {
                docStatus.isDefault = false;
            }
        }

        await docStatus.save();
        emitDocStatusChanged(tenantId, docStatus);
        res.json({ success: true, docStatus });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const reorderDocStatuses = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const ids: string[] = Array.isArray(req.body?.ids)
            ? req.body.ids.map((x: any) => String(x))
            : [];
        const statuses = await DocStatus.find({ tenantId });
        if (
            !ids.length ||
            ids.length !== statuses.length ||
            new Set(ids).size !== ids.length
        ) {
            res.status(400).json({
                success: false,
                message: 'Send every status id exactly once, in the new order',
            });
            return;
        }
        const byId = new Map(statuses.map((s) => [String(s._id), s]));
        if (ids.some((id) => !byId.has(id))) {
            res.status(400).json({ success: false, message: 'Invalid status id list' });
            return;
        }
        // Persist only the rows that actually moved.
        const changed: any[] = [];
        for (let i = 0; i < ids.length; i++) {
            const s = byId.get(ids[i])!;
            if (s.order !== i) {
                s.order = i;
                changed.push(s);
            }
        }
        for (const s of changed) await s.save();
        if (changed.length) {
            emitDocStatusChanged(tenantId, { reordered: true });
        }
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const deleteDocStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const docStatus = await DocStatus.findOne({ _id: req.params.id, tenantId });
        if (!docStatus) {
            res.status(404).json({ success: false, message: 'Status not found' });
            return;
        }
        const inUse = await CaseFile.exists({ tenantId, 'docs.statusId': docStatus._id });
        if (inUse) {
            res.status(400).json({
                success: false,
                message: 'This status is used by files — deactivate it instead',
            });
            return;
        }
        const activeCount = await DocStatus.countDocuments({ tenantId, isActive: true });
        if (docStatus.isActive && activeCount <= 1) {
            res.status(400).json({ success: false, message: 'At least one active status is required' });
            return;
        }
        await docStatus.deleteOne();
        emitDocStatusChanged(tenantId, { deletedId: docStatus._id });
        res.json({ success: true, message: 'Status removed' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};
