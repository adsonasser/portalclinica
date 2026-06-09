import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) throw new ForbiddenException('Token ausente');

    const token = authHeader.slice(7);
    let payload: any;

    try {
      payload = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_SECRET') || 'secret',
      });
    } catch {
      throw new ForbiddenException('Token inválido');
    }

    if (payload?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Acesso restrito a administradores master');
    }

    req.user = payload;
    return true;
  }
}
