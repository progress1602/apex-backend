import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../store/db';
import { generateToken, authenticate, AuthenticatedRequest } from '../middleware/auth';
import { User } from '../types';

const router = Router();

// POST /api/v1/auth/signup
router.post('/signup', (req: Request, res: Response): void => {
  const { fullName, name, email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required' });
    return;
  }

  const existingUser = db.getUserByEmail(email);
  if (existingUser) {
    res.status(409).json({ success: false, message: 'An account with this email already exists' });
    return;
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const userId = `usr_${Math.floor(1000000 + Math.random() * 9000000)}`;
  const userName = fullName || name || '';

  const newUser: User = {
    id: userId,
    name: userName,
    email: email.trim(),
    passwordHash,
    role: 'investor',
    tier: 'Tier 1 - Standard',
    balance: 0.0,
    phone: req.body.phone || '',
    is2FAEnabled: false,
    currencyPreference: req.body.currencyPreference || 'USD',
    notifications: {
      email: true,
      sms: false,
      yieldAlerts: false,
    },
    createdAt: new Date().toISOString(),
  };

  db.users.set(newUser.id, newUser);
  const token = generateToken(newUser);

  res.status(201).json({
    success: true,
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      tier: newUser.tier,
      balance: newUser.balance,
      is2FAEnabled: newUser.is2FAEnabled,
      createdAt: newUser.createdAt,
    },
  });
});

// POST /api/v1/auth/login
router.post('/login', (req: Request, res: Response): void => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required' });
    return;
  }

  const user = db.getUserByEmail(email);
  if (!user) {
    res.status(401).json({ success: false, message: 'Invalid email or password' });
    return;
  }

  const isValidPassword = bcrypt.compareSync(password, user.passwordHash);
  if (!isValidPassword) {
    res.status(401).json({ success: false, message: 'Invalid email or password' });
    return;
  }

  const token = generateToken(user);

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar || '',
      tier: user.tier,
      balance: user.balance,
    },
  });
});

// GET /api/v1/auth/me
router.get('/me', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  res.status(200).json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      balance: user.balance,
      tier: user.tier,
    },
  });
});

export default router;
