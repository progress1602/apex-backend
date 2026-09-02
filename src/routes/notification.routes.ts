import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { NotificationModel } from '../models';

const router = Router();

// GET /api/v1/notifications
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const notifs = await NotificationModel.find({ userId: user.userId }).sort({ createdAt: -1 });

    const formatted = notifs.map((n) => ({
      id: n.notificationId,
      title: n.title,
      message: n.message,
      type: n.type,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }));

    res.status(200).json({
      notifications: formatted,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching notifications' });
  }
});

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const id = req.params.id as string;

    const notif = await NotificationModel.findOneAndUpdate(
      { notificationId: id, userId: user.userId },
      { isRead: true },
      { new: true }
    );

    if (!notif) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error updating notification' });
  }
});

// POST /api/v1/notifications/mark-all-read
router.post('/mark-all-read', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    await NotificationModel.updateMany({ userId: user.userId }, { isRead: true });

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error updating notifications' });
  }
});

export default router;
