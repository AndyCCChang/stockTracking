import type { AuthenticatedRequestUser } from '../types.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedRequestUser;
    }
  }
}

export {};
