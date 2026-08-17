import { Response } from 'express';
import Notification from './notification.model';
import { AuthRequest } from '../../shared/middlewares/auth.middleware';

export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const notifications = await Notification.find({ user: req.user!._id })
            .sort({ createdAt: -1 })
            .limit(10);

        const unreadCount = await Notification.countDocuments({ user: req.user!._id, isRead: false });

        res.json({ notifications, unreadCount });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await Notification.findOneAndUpdate(
            { _id: req.params.id, user: req.user!._id },
            { isRead: true },
            { returnDocument: 'after' }
        );
        res.json({ message: 'Notification marked as read' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await Notification.updateMany({ user: req.user!._id, isRead: false }, { isRead: true });
        res.json({ message: 'All notifications marked as read' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Push subscriptions removed - notifications now use Electron native via Socket.IO
export const subscribePush = async (_req: AuthRequest, res: Response): Promise<void> => {
    res.status(410).json({ message: 'Push subscriptions are deprecated. Native notifications handled via Electron.' });
};

export const unsubscribePush = async (_req: AuthRequest, res: Response): Promise<void> => {
    res.status(410).json({ message: 'Push subscriptions are deprecated. Native notifications handled via Electron.' });
};
