import { Body, Controller, Delete, Get, Headers, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Permissions as PermissionCodes } from '@toka/contracts';
import { CorrelatedRequest, DomainError, InternalAuthGuard, PermissionsGuard, RedisClient, RequirePermissions } from '@toka/platform';
import { LoginUseCase } from '../../application/login.usecase';
import {
  ChangeCredentialEmailUseCase,
  DeleteCredentialUseCase,
  DisableCredentialUseCase,
  LogoutUseCase,
  RefreshUseCase,
  RegisterCredentialUseCase,
} from '../../application/session.usecases';
import { ChangeEmailDto, LoginDto, RefreshDto, RegisterCredentialDto } from './dto';

@Controller()
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly registerUseCase: RegisterCredentialUseCase,
    private readonly changeEmailUseCase: ChangeCredentialEmailUseCase,
    private readonly disableUseCase: DisableCredentialUseCase,
    private readonly deleteUseCase: DeleteCredentialUseCase,
    private readonly dataSource: DataSource,
    @Inject(RedisClient) private readonly redis: RedisClient,
  ) {}

  @Post('auth/login')
  @UseGuards(InternalAuthGuard)
  login(@Body() dto: LoginDto, @Req() request: CorrelatedRequest) {
    return this.loginUseCase.execute({
      email: dto.email,
      password: dto.password,
      correlationId: request.correlationId,
      traceId: request.traceId,
    });
  }

  @Post('auth/refresh')
  @UseGuards(InternalAuthGuard)
  refresh(@Body() dto: RefreshDto) {
    return this.refreshUseCase.execute({ refreshToken: dto.refreshToken });
  }

  @Post('auth/logout')
  @UseGuards(InternalAuthGuard)
  logout(@Headers('authorization') authorization: string | undefined, @Req() request: CorrelatedRequest) {
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!accessToken) throw new DomainError('Token inválido', 'UNAUTHORIZED');
    return this.logoutUseCase.execute({
      accessToken,
      correlationId: request.correlationId,
      traceId: request.traceId,
    });
  }

  @Post('internal/credentials')
  @UseGuards(InternalAuthGuard, PermissionsGuard)
  @RequirePermissions(PermissionCodes.UsersWrite)
  register(@Body() dto: RegisterCredentialDto) {
    return this.registerUseCase.execute(dto);
  }

  @Patch('internal/credentials/:userId/email')
  @UseGuards(InternalAuthGuard, PermissionsGuard)
  @RequirePermissions(PermissionCodes.UsersWrite)
  changeEmail(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: ChangeEmailDto) {
    return this.changeEmailUseCase.execute({ userId, email: dto.email });
  }

  @Post('internal/credentials/:userId/disable')
  @UseGuards(InternalAuthGuard, PermissionsGuard)
  @RequirePermissions(PermissionCodes.UsersWrite)
  disable(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.disableUseCase.execute(userId);
  }

  @Delete('internal/credentials/:userId')
  @UseGuards(InternalAuthGuard, PermissionsGuard)
  @RequirePermissions(PermissionCodes.UsersWrite)
  remove(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.deleteUseCase.execute(userId);
  }

  @Get('ready')
  async ready() {
    await this.dataSource.query('SELECT 1');
    await this.redis.get('ready:auth');
    return { status: 'ready', service: 'auth-service' };
  }
}
