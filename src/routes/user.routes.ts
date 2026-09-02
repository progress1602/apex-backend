import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { UserModel } from '../models';

const router = Router();

// GET /api/v1/user/profile
router.get('/profile', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await UserModel.findOne({ userId: req.user!.userId });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      id: user.userId,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      tier: user.tier || 'Tier 1 - Standard',
      is2FAEnabled: user.is2FAEnabled || false,
      currencyPreference: user.currencyPreference || 'USD',
      notifications: user.notifications || {
        email: true,
        sms: false,
        yieldAlerts: false,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error fetching profile' });
  }
});

// PATCH /api/v1/user/profile
router.patch('/profile', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, phone, is2FAEnabled, currencyPreference, notifications } = req.body;
    const updates: Record<string, any> = {};

    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (is2FAEnabled !== undefined) updates.is2FAEnabled = is2FAEnabled;
    if (currencyPreference !== undefined) updates.currencyPreference = currencyPreference;
    if (notifications !== undefined) {
      const existing = req.user!.notifications || { email: true, sms: false, yieldAlerts: false };
      updates.notifications = { ...existing, ...notifications };
    }

    const updatedUser = await UserModel.findOneAndUpdate(
      { userId: req.user!.userId },
      { $set: updates },
      { new: true }
    );

    if (!updatedUser) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.userId,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        is2FAEnabled: updatedUser.is2FAEnabled,
        currencyPreference: updatedUser.currencyPreference,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal error updating profile' });
  }
});

export default router;
