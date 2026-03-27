import { db } from './database.js';
import type { PublicUser, UserRecord } from '../types.js';

type UserRow = UserRecord;

function mapUserRow(row: UserRow): UserRecord {
  return {
    id: Number(row.id),
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export function createUser(input: { email: string; passwordHash: string; name?: string | null }) {
  const now = new Date().toISOString();
  const result = db.prepare(
    `INSERT INTO users (email, passwordHash, name, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)`
  ).run(input.email, input.passwordHash, input.name ?? null, now, now);

  return Number(result.lastInsertRowid);
}

export function findUserByEmail(email: string) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  return row ? mapUserRow(row) : null;
}

export function getUserById(id: number) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? mapUserRow(row) : null;
}

export function deleteAllUsers() {
  db.prepare('DELETE FROM users').run();
}
