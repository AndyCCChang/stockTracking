import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../lib/errors.js';
import { verifyAuthToken } from '../utils/jwt.js';

export function authenticateJWT(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing Bearer token'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(new UnauthorizedError('Missing Bearer token'));
    return;
  }

  try {
    req.user = verifyAuthToken(token);
    next();
  } catch (error) {
    next(error);
  }
}
