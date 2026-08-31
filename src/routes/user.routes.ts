import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/user/profile
router.get('/profile', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  res.status(200).json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '+1 (555) 234-5678',
    tier: user.tier,
    is2FAEnabled: user.is2FAEnabled,
    currencyPreference: user.currencyPreference || 'USD',
    notifications: user.notifications,
  });
});

// PATCH /api/v1/user/profile
router.patch('/profile', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const { name, phone, is2FAEnabled, currencyPreference, notifications } = req.body;

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (is2FAEnabled !== undefined) user.is2FAEnabled = is2FAEnabled;
  if (currencyPreference !== undefined) user.currencyPreference = currencyPreference;
  if (notifications !== undefined) user.notifications = { ...user.notifications, ...notifications };

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
  });
});

export default router;
