import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';

export interface AuthRequest extends Request {
  userId?: string;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];

    if (!admin.apps.length) {
      // If Firebase isn't initialized, accept a test token for development
      if (process.env.NODE_ENV === 'development') {
        req.userId = 'dev-user';
        return next();
      }
      return res.status(401).json({ error: 'Auth not configured' });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.userId = decodedToken.uid;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
