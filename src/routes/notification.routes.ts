import { Router, Response } from 'express';
import { db } from '../store/db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/notifications
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const notifs = Array.from(db.notifications.values())
    .filter((n) => n.userId === user.id)
    .map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      isRead: n.isRead,
      createdAt: n.createdAt,
    }));

  res.status(200).json({
    notifications: notifs,
  });
});

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const id = req.params.id as string;
  const notif = db.notifications.get(id);

  if (!notif) {
    res.status(404).json({ success: false, message: 'Notification not found' });
    return;
  }

  notif.isRead = true;

  res.status(200).json({
    success: true,
    message: 'Notification marked as read',
  });
});

// POST /api/v1/notifications/mark-all-read
router.post('/mark-all-read', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;

  for (const notif of db.notifications.values()) {
    if (notif.userId === user.id) {
      notif.isRead = true;
    }
  }

  res.status(200).json({
    success: true,
    message: 'All notifications marked as read',
  });
});

export default router;
