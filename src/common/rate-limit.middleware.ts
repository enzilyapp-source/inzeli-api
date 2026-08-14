import { Request, Response, NextFunction } from 'express';

type Bucket = {
  count: number;
  resetAt: number;
};

type Rule = {
  match: (req: Request) => boolean;
  windowMs: number;
  max: number;
};

const buckets = new Map<string, Bucket>();

const rules: Rule[] = [
  {
    match: (req) => req.originalUrl.startsWith('/api/auth/'),
    windowMs: 60_000,
    max: 30,
  },
  {
    match: (req) =>
      req.originalUrl.startsWith('/api/rooms') && req.method !== 'GET',
    windowMs: 60_000,
    max: 45,
  },
  {
    match: (req) => req.originalUrl.startsWith('/api/admin/'),
    windowMs: 60_000,
    max: 120,
  },
  {
    match: () => true,
    windowMs: 60_000,
    max: 180,
  },
];

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function bucketPath(req: Request): string {
  const path = req.originalUrl.split('?')[0];
  if (path.startsWith('/api/auth/')) return '/api/auth';
  if (path.startsWith('/api/rooms')) return '/api/rooms';
  if (path.startsWith('/api/admin/')) return '/api/admin';
  return path;
}

export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const now = Date.now();
  const rule =
    rules.find((candidate) => candidate.match(req)) ?? rules[rules.length - 1]!;
  const key = `${clientIp(req)}:${req.method}:${rule.max}:${rule.windowMs}:${bucketPath(req)}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    next();
    return;
  }

  current.count += 1;
  if (current.count <= rule.max) {
    next();
    return;
  }

  const retryAfter = Math.ceil((current.resetAt - now) / 1000);
  res.setHeader('Retry-After', String(retryAfter));
  res.status(429).json({
    ok: false,
    message: 'Too many requests. Please slow down.',
    code: 'RATE_LIMITED',
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();
