import { mkdirSync } from 'fs';
import { join } from 'path';

export const SPONSOR_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const SPONSOR_IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export function uploadsRoot() {
  return (
    process.env.UPLOADS_DIR?.trim() || join(process.cwd(), 'public', 'uploads')
  );
}

export function ensureUploadsRoot() {
  const dir = uploadsRoot();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureSponsorUploadsDir() {
  const dir = join(uploadsRoot(), 'sponsors');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function publicSponsorImagePath(fileName: string) {
  return `/uploads/sponsors/${fileName}`;
}
