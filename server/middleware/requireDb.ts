import { Request, Response, NextFunction } from 'express';
import { getDatabaseHealth, isDatabaseConnected } from '../config/db.ts';

export function requireDb(_req: Request, res: Response, next: NextFunction): void {
  if (!isDatabaseConnected()) {
    const health = getDatabaseHealth();
    res.status(503).json({
      error: 'MongoDB Atlas is not connected.',
      code: 'DB_NOT_CONNECTED',
      status: health.status,
      details: health.message,
    });
    return;
  }
  next();
}
