import { Router, Response } from 'express';
import User from './user.model';
import { AuthRequest, authenticate } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = req.user!;
        const tenantId = (user as any).tenantId?._id || (user as any).tenantId;

        const users = await User.find({ tenantId, isActive: true })
            .select('name email avatar role')
            .sort({ name: 1 });

        res.json({ success: true, users });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
