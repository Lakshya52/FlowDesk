import { Request, Response } from 'express';
import Tenant from '../models/Tenant';
import { getTenantId } from '../utils/tenant';
import { AuthRequest } from '../middlewares/auth';

export const getSettings = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const tenant = await Tenant.findById(tenantId).select('settings');
        if (!tenant) {
            res.status(404).json({ message: 'Tenant not found' });
            return;
        }
        res.json({ success: true, settings: tenant.settings });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateSettings = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = getTenantId(req.user);
        const { geoFenceRadius } = req.body;

        if (geoFenceRadius !== undefined) {
            if (typeof geoFenceRadius !== 'number' || geoFenceRadius < 1 || geoFenceRadius > 10000) {
                res.status(400).json({ message: 'geoFenceRadius must be between 1 and 10000 meters' });
                return;
            }
        }

        const tenant = await Tenant.findByIdAndUpdate(
            tenantId,
            { $set: { 'settings.geoFenceRadius': geoFenceRadius } },
            { new: true }
        ).select('settings');

        if (!tenant) {
            res.status(404).json({ message: 'Tenant not found' });
            return;
        }

        res.json({ success: true, settings: tenant.settings });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
