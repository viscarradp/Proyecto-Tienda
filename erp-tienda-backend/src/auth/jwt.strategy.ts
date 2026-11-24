import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsuariosService } from '../usuarios/usuarios.service';
interface JwtPayload {
  sub: number;
  nombre: string;
  rol: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usuariosService: UsuariosService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_SECRET no está configurado. Define la variable de entorno antes de iniciar el servidor.',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Se ejecuta en CADA request autenticado. El token solo identifica (`sub`):
   * el usuario debe existir y estar activo, y el rol que cuenta es el de la
   * base de datos, no el del token. Así una desactivación o un cambio de rol
   * aplican de inmediato, sin esperar a que el token expire. A esta escala,
   * una consulta por request es aceptable.
   */
  async validate(payload: JwtPayload) {
    const usuario = await this.usuariosService.findParaAutenticacion(
      payload.sub,
    );
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException(
        'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
      );
    }
    return {
      userId: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
    };
  }
}
