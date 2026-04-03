import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../lib/errors.js';
import type { AuthTokenPayload } from '../types.js';

const JWT_SECRET: Secret = env.jwtSecret;
const JWT_EXPIRES_IN: SignOptions['expiresIn'] = '7d';

export function signAuthToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || typeof decoded !== 'object') {
      throw new UnauthorizedError('Invalid token');
    }

    const payload = decoded as Partial<AuthTokenPayload>;
    if (!payload.userId || !payload.email) {
      throw new UnauthorizedError('Invalid token payload');
    }

    return {
      userId: Number(payload.userId),
      email: String(payload.email)
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired');
    }

    throw new UnauthorizedError('Invalid token');
  }
}
