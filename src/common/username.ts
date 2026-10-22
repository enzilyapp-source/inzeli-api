import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';

const RESERVED = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'enzily',
  'enzeli',
  'inzeli',
  'official',
  'system',
  'moderator',
  'root',
]);

/** Usernames are public handles. Never use them as room, token or account keys. */
export function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new BadRequestException('USERNAME_REQUIRED');
  const username = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(username))
    throw new BadRequestException('USERNAME_INVALID');
  if (RESERVED.has(username))
    throw new BadRequestException('USERNAME_RESERVED');
  return username;
}

// Older released apps cannot ask for a handle yet. Give only those new accounts
// an editable handle; existing players keep their id, publicId and optional handle.
export function legacyUsername(): string {
  return `u_${randomBytes(9).toString('hex')}`;
}

export function usernameWriteError(error: any): any {
  if (
    error?.code === 'P2002' &&
    String(error?.meta?.target ?? '').includes('username')
  ) {
    return new BadRequestException('USERNAME_TAKEN');
  }
  return error;
}
