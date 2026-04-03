import type { Queryable } from './database.js';
import { query } from './database.js';
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

export async function createUser(
  input: { email: string; passwordHash: string; name?: string | null },
  db?: Queryable
) {
  const now = new Date().toISOString();
  const result = await query<{ id: number }>(
    `INSERT INTO users (email, "passwordHash", name, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.email, input.passwordHash, input.name ?? null, now, now],
    db
  );

  return Number(result.rows[0].id);
}

export async function findUserByEmail(email: string, db?: Queryable) {
  const result = await query<UserRow>('SELECT * FROM users WHERE email = $1 LIMIT 1', [email], db);
  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

export async function getUserById(id: number, db?: Queryable) {
  const result = await query<UserRow>('SELECT * FROM users WHERE id = $1 LIMIT 1', [id], db);
  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

export async function deleteAllUsers(db?: Queryable) {
  await query('TRUNCATE TABLE users RESTART IDENTITY CASCADE', [], db);
}
