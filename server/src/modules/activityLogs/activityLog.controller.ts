import { Response } from 'express';
import ActivityLog, { EntityType } from './activityLog.model';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';
import { getTenantUserIds } from '../../shared/utils/tenant';

export const getCrmActivityLogs = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { entityType, action, limit = '50', offset = '0' } = req.query;
        const tenantUserIds = await getTenantUserIds(req.user);

        const filter: any = {};
        filter.entityType = { $in: [EntityType.CAMPAIGN, EntityType.LEAD] };
        filter.user = { $in: tenantUserIds };

        if (entityType) filter.entityType = entityType;
        if (action) filter.action = { $regex: action as string, $options: 'i' };

        const total = await ActivityLog.countDocuments(filter);

        const logs = await ActivityLog.find(filter)
            .populate('user', 'name email avatar')
            .sort({ createdAt: -1 })
            .skip(parseInt(offset as string))
            .limit(parseInt(limit as string));

        res.json({ success: true, logs, total });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};
