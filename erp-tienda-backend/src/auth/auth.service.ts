import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsuariosService } from '../usuarios/usuarios.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { nombre, password } = loginDto;

    // Busca al usuario por nombre (incluyendo password_hash)
    const usuario = await this.usuariosService.findByNombreInternal(nombre);

    // Si el usuario no existe, lanza UnauthorizedException
    if (!usuario) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Compara el password en texto plano con el password_hash
    const isPasswordValid = await bcrypt.compare(
      password,
      usuario.password_hash,
    );

    // Si no coincide, lanza UnauthorizedException
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Genera el JWT
    const payload = {
      sub: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
    };

    const access_token = await this.jwtService.signAsync(payload);

    // Retorna el token y el usuario sin el password_hash
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userResult } = usuario;

    return {
      access_token,
      usuario: userResult,
    };
  }
}
