import { Response } from 'express';
import mongoose from 'mongoose';
import LoanProduct from '../models/LoanProduct';
import CaseFile from '../models/CaseFile';
import { AuthRequest } from '../middlewares/auth';
import {
    emitLoanProductCreated,
    emitLoanProductUpdated,
    emitLoanProductDeleted,
    emitCaseFileUpdated,
} from '../services/crmSocketService';
import { reconcileCaseFileDocs } from '../services/caseFileService';

const getTenantId = (user: any): string =>
    (user.tenantId?._id || user.tenantId).toString();

const escapeRegex = (s: string): string =>
    s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Accepts the docs array from the client and normalizes it (order = array index).
// Returns null when the field is absent (leave unchanged).
const normalizeDocs = (raw: any): any[] | null => {
    if (raw === undefined) return null;
    if (!Array.isArray(raw)) return [];
    return raw
        .map((d, i) => ({
            name: String(d?.name || '').trim(),
            required: d?.required !== false,
            order: i,
        }))
        .filter((d) => d.name);
};

const serializeDocs = (arr: any[]): string =>
    JSON.stringify((arr || []).map((d) => [String(d?.name || '').trim(), d?.required !== false]));

export const getLoanProducts = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const products = await LoanProduct.find({ tenantId }).sort({ order: 1, createdAt: 1 });
        const ids = products.map((p) => p._id);
        const usage = await CaseFile.aggregate([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), productId: { $in: ids } } },
            { $group: { _id: '$productId', count: { $sum: 1 } } },
        ]);
        const countMap = new Map(usage.map((u: any) => [String(u._id), u.count as number]));
        res.json({
            success: true,
            products: products.map((p) => ({
                ...(p.toObject() as any),
                usageCount: countMap.get(String(p._id)) || 0,
            })),
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createLoanProduct = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { name, description, docs, isActive } = req.body;
        const trimmed = String(name || '').trim();
        if (!trimmed) {
            res.status(400).json({ success: false, message: 'Product name is required' });
            return;
        }
        const tenantId = getTenantId(req.user!);
        const duplicate = await LoanProduct.findOne({
            tenantId,
            name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i'),
        });
        if (duplicate) {
            res.status(400).json({ success: false, message: 'A product with this name already exists' });
            return;
        }
        const last = await LoanProduct.findOne({ tenantId }).sort({ order: -1 }).select('order');
        const product = await LoanProduct.create({
            name: trimmed,
            description: description ? String(description).trim() : undefined,
            isActive: isActive !== false,
            order: (last?.order ?? -1) + 1,
            docs: normalizeDocs(docs) || [],
            tenantId,
            createdBy: req.user!._id,
        });
        emitLoanProductCreated(tenantId, product);
        res.status(201).json({ success: true, product });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateLoanProduct = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const product = await LoanProduct.findOne({ _id: req.params.id, tenantId });
        if (!product) {
            res.status(404).json({ success: false, message: 'Product not found' });
            return;
        }
        const { name, description, docs, isActive } = req.body;

        if (name !== undefined) {
            const trimmed = String(name || '').trim();
            if (!trimmed) {
                res.status(400).json({ success: false, message: 'Product name is required' });
                return;
            }
            const duplicate = await LoanProduct.findOne({
                tenantId,
                _id: { $ne: product._id },
                name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i'),
            });
            if (duplicate) {
                res.status(400).json({ success: false, message: 'A product with this name already exists' });
                return;
            }
            product.name = trimmed;
        }
        if (description !== undefined) {
            product.description = String(description || '').trim() || undefined;
        }
        if (isActive !== undefined) {
            product.isActive = !!isActive;
        }

        let docsChanged = false;
        const nextDocs = normalizeDocs(docs);
        if (nextDocs) {
            docsChanged = serializeDocs(product.docs as any[]) !== serializeDocs(nextDocs);
            product.docs = nextDocs as any;
        }

        await product.save();

        let syncedCaseFiles = 0;
        if (docsChanged) {
            // Keep in-process caseFiles on this product up to date.
            syncedCaseFiles = await reconcileCaseFileDocs(product._id, tenantId);
            if (syncedCaseFiles > 0) {
                emitCaseFileUpdated(tenantId, { productId: product._id, synced: syncedCaseFiles });
            }
        }

        emitLoanProductUpdated(tenantId, product);
        res.json({ success: true, product, syncedCaseFiles });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const deleteLoanProduct = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user!);
        const product = await LoanProduct.findOne({ _id: req.params.id, tenantId });
        if (!product) {
            res.status(404).json({ success: false, message: 'Product not found' });
            return;
        }
        const inUse = await CaseFile.exists({ tenantId, productId: product._id });
        if (inUse) {
            res.status(400).json({
                success: false,
                message: 'This product is used by existing files — deactivate it instead',
            });
            return;
        }
        await product.deleteOne();
        emitLoanProductDeleted(tenantId, product._id.toString());
        res.json({ success: true, message: 'Product removed' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};
