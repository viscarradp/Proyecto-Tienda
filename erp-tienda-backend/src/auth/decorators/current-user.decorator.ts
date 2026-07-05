import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Forma del usuario autenticado tal como lo devuelve `JwtStrategy.validate`
 * (ver src/auth/jwt.strategy.ts) y lo deja Passport en `request.user`.
 */
export interface CurrentUserData {
  userId: number;
  nombre: string;
  rol: string;
}

/**
 * Extrae el usuario autenticado del request para persistir la trazabilidad de
 * autor (Bloque 1, §5.2). Uso: `@CurrentUser('userId') userId: number` o
 * `@CurrentUser() user: CurrentUserData`.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: CurrentUserData }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
