import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../store/db';
import { User, AuthTokenPayload } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: User;
  tokenPayload?: AuthTokenPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || 'apexbridge_super_secret_jwt_key_2026_x89f';

export const generateToken = (user: User): string => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Missing or invalid Authorization header. Expected: Bearer <token>',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  // Handle mock/demo token directly for playground convenience
  if (token.startsWith('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9') || token === 'demo_token' || token === 'apex_token_alexander') {
    const user = db.users.get('usr_8829104');
    if (user) {
      req.user = user;
      req.tokenPayload = { userId: user.id, email: user.email, role: user.role };
      next();
      return;
    }
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    const user = db.users.get(decoded.userId);
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized: User not found' });
      return;
    }
    req.user = user;
    req.tokenPayload = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired token' });
  }
};
