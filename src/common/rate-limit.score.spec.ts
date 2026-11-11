import { rateLimitMiddleware } from './rate-limit.middleware';
import type { Request, Response, NextFunction } from 'express';

describe('Companion score polling rate limits', () => {
  it('does not consume the existing room polling/voting bucket', () => {
    let nextCount = 0,
      rejected = 0;
    const next = (() => {
      nextCount++;
    }) as NextFunction;
    const res = {
      setHeader: () => {},
      status: () => ({
        json: () => {
          rejected++;
        },
      }),
    } as unknown as Response;
    const send = (path: string, method = 'GET') =>
      rateLimitMiddleware(
        {
          originalUrl: path,
          method,
          headers: {},
          ip: 'score-test-unique',
          socket: {},
        } as Request,
        res,
        next,
      );
    for (let i = 0; i < 180; i++) send('/api/rooms/ABCD');
    for (let i = 0; i < 90; i++) send('/api/rooms/ABCD/score-sheet');
    for (let i = 0; i < 30; i++) send('/api/rooms/ABCD/score-sheet', 'PUT');
    send('/api/rooms/ABCD/start', 'POST');
    expect(nextCount).toBe(301);
    expect(rejected).toBe(0);
    send('/api/rooms/ABCD');
    expect(rejected).toBe(1);
  });
});
