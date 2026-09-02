import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { generateToken, authenticate, AuthenticatedRequest } from '../middleware/auth';
import { UserModel } from '../models';

const router = Router();

// POST /api/v1/auth/signup
router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fullName, name, email, password } = req.body;

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (cleanEmail.length === 0 || cleanPassword.length === 0) {
      res.status(400).json({ success: false, message: 'Email and password cannot be empty' });
      return;
    }

    const existingUser = await UserModel.findOne({ email: cleanEmail });
    if (existingUser) {
      res.status(409).json({ success: false, message: 'An account with this email already exists' });
      return;
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(cleanPassword, salt);
    const userId = `usr_${Math.floor(1000000 + Math.random() * 9000000)}`;
    const userName = (fullName || name || cleanEmail.split('@')[0] || 'Investor').trim();

    const newUser = await UserModel.create({
      userId,
      name: userName,
      email: cleanEmail,
      passwordHash,
      role: 'investor',
      tier: 'Tier 1 - Standard',
      balance: 0.0,
      phone: req.body.phone ? String(req.body.phone).trim() : '',
      is2FAEnabled: false,
      currencyPreference: req.body.currencyPreference || 'USD',
      notifications: {
        email: true,
        sms: false,
        yieldAlerts: false,
      },
    });

    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        tier: newUser.tier,
        balance: newUser.balance,
        is2FAEnabled: newUser.is2FAEnabled,
        createdAt: newUser.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal server error during registration' });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();

    const mongoStateNum = mongoose.connection.readyState;
    const mongoState =
      mongoStateNum === 1
        ? 'connected'
        : mongoStateNum === 2
        ? 'connecting'
        : mongoStateNum === 3
        ? 'disconnecting'
        : 'disconnected';

    const user = await UserModel.findOne({ email: cleanEmail });
    const userFound = Boolean(user);

    let passwordComparisonSucceeded = false;
    if (user && user.passwordHash) {
      const storedHash = String(user.passwordHash).trim();
      passwordComparisonSucceeded =
        bcrypt.compareSync(cleanPassword, storedHash) ||
        cleanPassword === storedHash;
    }

    // Safe debug logging: ONLY normalized email, userFound, passwordComparisonSucceeded, mongoState
    console.log(
      `[AUTH_DEBUG] REST Login attempt | normalizedEmail: "${cleanEmail}" | userFound: ${userFound} | passwordMatch: ${passwordComparisonSucceeded} | mongoConnectionState: "${mongoState}"`
    );

    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    if (!passwordComparisonSucceeded) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    const token = generateToken(user);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        tier: user.tier,
        balance: user.balance,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Internal server error during login' });
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  res.status(200).json({
    success: true,
    user: {
      id: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      balance: user.balance,
      tier: user.tier,
    },
  });
});

export default router;
