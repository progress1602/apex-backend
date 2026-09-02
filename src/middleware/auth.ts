import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel, IUserDocument } from '../models';
import { AuthTokenPayload } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: IUserDocument;
  tokenPayload?: AuthTokenPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || 'apexbridge_super_secret_jwt_key_2026_x89f';

export const generateToken = (user: { userId?: string; id?: string; email: string; role: string }): string => {
  return jwt.sign(
    {
      userId: user.userId || user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Missing or invalid Authorization header. Expected: Bearer <token>',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    const user = await UserModel.findOne({ userId: decoded.userId });
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized: User not found in database' });
      return;
    }
    req.user = user;
    req.tokenPayload = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired token' });
  }
};

export const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  await authenticate(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({
        success: false,
        message: 'Forbidden: Admin access required for this operation',
      });
      return;
    }
    next();
  });
};
