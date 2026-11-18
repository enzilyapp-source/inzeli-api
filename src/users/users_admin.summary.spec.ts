import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request from 'supertest';
import { AdminUsersController } from './users_admin.controller';
import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma.service';

// Real HTTP route + real admin guard; only JWT identity and database are fixtures.
// No production database, user records or credentials are used by these tests.
describe('Admin account totals', () => {
  const groupBy = jest.fn();
  let app: any;

  beforeAll(async () => {
    const previous = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = 'admin@summary.invalid';
    try {
      const module = await Test.createTestingModule({
        controllers: [AdminUsersController],
        providers: [
          AdminGuard,
          { provide: PrismaService, useValue: { user: { groupBy } } },
        ],
      })
        .overrideGuard(AuthGuard('jwt'))
        .useValue({
          canActivate(context: ExecutionContext) {
            const req = context.switchToHttp().getRequest();
            if (!req.headers.authorization) throw new UnauthorizedException();
            req.user = {
              email:
                req.headers.authorization === 'Bearer admin'
                  ? 'admin@summary.invalid'
                  : 'player@summary.invalid',
            };
            return true;
          },
        })
        .compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api');
      await app.listen(0, '127.0.0.1');
    } finally {
      if (previous === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = previous;
    }
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => groupBy.mockReset());

  it('counts the full dataset rather than the searched or limited user list', async () => {
    groupBy.mockResolvedValue([
      { isTestAccount: false, _count: { _all: 1000 } },
      { isTestAccount: true, _count: { _all: 6 } },
    ]);
    const response = await request(app.getHttpServer())
      .get('/api/admin/users/summary?q=someone&limit=1')
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(response.body.data).toEqual({
      totalAccounts: 1006,
      registeredUsers: 1000,
      testAccounts: 6,
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['isTestAccount'],
      _count: { _all: true },
    });
  });
  it('returns an actual zero for an empty database and counts test-only datasets', async () => {
    groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ isTestAccount: true, _count: { _all: 3 } }]);
    const empty = await request(app.getHttpServer())
      .get('/api/admin/users/summary')
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(empty.body.data).toEqual({
      totalAccounts: 0,
      registeredUsers: 0,
      testAccounts: 0,
    });
    const tests = await request(app.getHttpServer())
      .get('/api/admin/users/summary')
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(tests.body.data).toEqual({
      totalAccounts: 3,
      registeredUsers: 0,
      testAccounts: 3,
    });
  });
  it('rejects missing authentication and ordinary players before reading counts', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/users/summary')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/admin/users/summary')
      .set('Authorization', 'Bearer player')
      .expect(401);
    expect(groupBy).not.toHaveBeenCalled();
  });
});
