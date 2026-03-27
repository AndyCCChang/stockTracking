import { createUser, findUserByEmail, getUserById, toPublicUser } from '../db/userRepository.js';
import { ConflictError, UnauthorizedError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAuthToken } from '../utils/jwt.js';
import type { AuthResponse, LoginInput, RegisterInput } from '../types.js';

export async function registerUser(input: RegisterInput): Promise<AuthResponse> {
  const existing = findUserByEmail(input.email);
  if (existing) {
    throw new ConflictError('Email already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const userId = createUser({
    email: input.email,
    passwordHash,
    name: input.name ?? null
  });

  const user = getUserById(userId);
  if (!user) {
    throw new Error('User was not found after registration');
  }

  return {
    token: signAuthToken({ userId: user.id, email: user.email }),
    user: toPublicUser(user)
  };
}

export async function loginUser(input: LoginInput): Promise<AuthResponse> {
  const user = findUserByEmail(input.email);
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return {
    token: signAuthToken({ userId: user.id, email: user.email }),
    user: toPublicUser(user)
  };
}
