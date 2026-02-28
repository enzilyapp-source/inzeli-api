import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  private allowed: string[];

  constructor() {
    const env = process.env.ADMIN_EMAILS ?? 'support@enzily.app';
    this.allowed = env
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const email = (user?.email ?? '').toString().toLowerCase();
    if (!email || !this.allowed.includes(email)) {
      throw new UnauthorizedException('ADMIN_ONLY');
    }
    return true;
  }
}
