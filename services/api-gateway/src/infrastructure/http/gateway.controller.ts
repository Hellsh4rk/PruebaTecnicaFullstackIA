import { randomUUID } from 'crypto';
import { Body, Controller, Delete, Get, Headers, Ip, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Permissions } from '@toka/contracts';
import { CorrelatedRequest, FixedWindowLimiter } from '@toka/platform';
import { IsEmail, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { Response } from 'express';
import { assertPermission, headersFromRequest } from '../../domain/http';
import { ServiceProxy, writeUpstream } from './proxy';
import { Public } from './access.guard';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 72)
  password!: string;
}

class RefreshDto {
  @IsString()
  @Length(20, 4000)
  refreshToken!: string;
}

class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 120)
  fullName!: string;

  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/)
  password!: string;

  @IsUUID()
  roleId!: string;
}

class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  fullName?: string;
}

class AssignmentDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  roleId!: string;
}

class PageQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  correlationId?: string;

  @IsOptional()
  @Min(1)
  page?: number;

  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number;
}

class AiQueryDto {
  @IsString()
  @Length(2, 2000)
  question!: string;
}

class IngestDto {
  @IsString()
  @Length(2, 160)
  title!: string;

  @IsString()
  @Length(2, 8000)
  text!: string;

  @IsString()
  @Length(2, 80)
  source!: string;
}

@Controller()
export class GatewayController {
  constructor(
    private readonly proxy: ServiceProxy,
    private readonly config: ConfigService,
    private readonly limiter: FixedWindowLimiter,
  ) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'api-gateway' };
  }

  @Public()
  @Post('auth/login')
  async login(@Body() dto: LoginDto, @Req() request: CorrelatedRequest, @Res() response: Response, @Ip() ip: string) {
    if (!this.limiter.allow(ip || 'local')) {
      response.status(429).json({ message: 'Demasiados intentos de acceso', code: 'RATE_LIMITED', correlationId: request.correlationId });
      return;
    }
    writeUpstream(response, await this.forward('AUTH_SERVICE_URL', '/auth/login', 'POST', dto, request));
  }

  @Public()
  @Post('auth/refresh')
  async refresh(@Body() dto: RefreshDto, @Req() request: CorrelatedRequest, @Res() response: Response) {
    writeUpstream(response, await this.forward('AUTH_SERVICE_URL', '/auth/refresh', 'POST', dto, request));
  }

  @Post('auth/logout')
  async logout(@Headers('authorization') authorization = '', @Req() request: CorrelatedRequest, @Res() response: Response) {
    writeUpstream(
      response,
      await this.forward('AUTH_SERVICE_URL', '/auth/logout', 'POST', undefined, request, 8000, { authorization }),
    );
  }

  @Get('auth/me')
  async me(@Req() request: CorrelatedRequest, @Res() response: Response) {
    const profile = await this.forward('USER_SERVICE_URL', `/users/${request.user?.sub}`, 'GET', undefined, request);
    if (profile.status >= 400) {
      writeUpstream(response, profile);
      return;
    }
    const body = JSON.parse(profile.text) as Record<string, unknown>;
    response.status(200).json({ ...body, roles: request.user?.roles ?? [], permissions: request.user?.permissions ?? [] });
  }

  @Get('users')
  async users(@Query() query: PageQuery, @Req() request: CorrelatedRequest, @Res() response: Response) {
    assertPermission(request.user, Permissions.UsersRead);
    const upstream = await this.forward('USER_SERVICE_URL', `/users${this.queryString(query)}`, 'GET', undefined, request);
    if (upstream.status >= 400) {
      writeUpstream(response, upstream);
      return;
    }
    const body = JSON.parse(upstream.text) as { data: Array<{ id: string }>; total: number; page: number; limit: number };
    const enriched = await Promise.all(
      body.data.map(async (user) => {
        const access = await this.forward('ROLE_SERVICE_URL', `/internal/users/${user.id}/access`, 'GET', undefined, request);
        const roles = access.status < 400 ? ((JSON.parse(access.text) as { roles?: string[] }).roles ?? []) : [];
        return { ...user, roles };
      }),
    );
    response.status(200).json({ ...body, data: enriched });
  }

  @Post('users')
  async createUser(@Body() dto: CreateUserDto, @Req() request: CorrelatedRequest, @Res() response: Response) {
    assertPermission(request.user, Permissions.UsersWrite);
    assertPermission(request.user, Permissions.RolesAssign);
    const userId = randomUUID();
    const credential = await this.forward('AUTH_SERVICE_URL', '/internal/credentials', 'POST', {
      userId,
      email: dto.email,
      password: dto.password,
    }, request);
    if (credential.status >= 400) return writeUpstream(response, credential);

    const profile = await this.forward('USER_SERVICE_URL', '/users', 'POST', {
      id: userId,
      email: dto.email,
      fullName: dto.fullName,
    }, request);
    if (profile.status >= 400) {
      await this.forward('AUTH_SERVICE_URL', `/internal/credentials/${userId}`, 'DELETE', undefined, request);
      return writeUpstream(response, profile);
    }

    const assignment = await this.forward('ROLE_SERVICE_URL', '/assignments', 'POST', { userId, roleId: dto.roleId }, request);
    if (assignment.status >= 400) {
      await this.forward('USER_SERVICE_URL', `/internal/users/${userId}`, 'DELETE', undefined, request);
      await this.forward('AUTH_SERVICE_URL', `/internal/credentials/${userId}`, 'DELETE', undefined, request);
      return writeUpstream(response, assignment);
    }
    const created = JSON.parse(profile.text) as Record<string, unknown>;
    response.status(201).json({ ...created, roleId: dto.roleId });
  }

  @Get('users/:id')
  async user(@Param('id', ParseUUIDPipe) id: string, @Req() request: CorrelatedRequest, @Res() response: Response) {
    assertPermission(request.user, Permissions.UsersRead);
    writeUpstream(response, await this.forward('USER_SERVICE_URL', `/users/${id}`, 'GET', undefined, request));
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: CorrelatedRequest,
    @Res() response: Response,
  ) {
    assertPermission(request.user, Permissions.UsersWrite);
    const current = await this.forward('USER_SERVICE_URL', `/users/${id}`, 'GET', undefined, request);
    if (current.status >= 400) return writeUpstream(response, current);
    const previous = JSON.parse(current.text) as { email: string; fullName: string };
    const updated = await this.forward('USER_SERVICE_URL', `/users/${id}`, 'PATCH', dto, request);
    if (updated.status >= 400) return writeUpstream(response, updated);
    if (dto.email && dto.email.toLowerCase() !== previous.email) {
      const renamed = await this.forward('AUTH_SERVICE_URL', `/internal/credentials/${id}/email`, 'PATCH', { email: dto.email }, request);
      if (renamed.status >= 400) {
        await this.forward('USER_SERVICE_URL', `/users/${id}`, 'PATCH', { email: previous.email, fullName: previous.fullName }, request);
        return writeUpstream(response, renamed);
      }
    }
    writeUpstream(response, updated);
  }

  @Post('users/:id/deactivate')
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @Req() request: CorrelatedRequest, @Res() response: Response) {
    assertPermission(request.user, Permissions.UsersWrite);
    const updated = await this.forward('USER_SERVICE_URL', `/users/${id}/deactivate`, 'POST', {}, request);
    if (updated.status < 400) {
      await this.forward('AUTH_SERVICE_URL', `/internal/credentials/${id}/disable`, 'POST', {}, request);
    }
    writeUpstream(response, updated);
  }

  @Get('roles')
  async roles(@Req() request: CorrelatedRequest, @Res() response: Response) {
    assertPermission(request.user, Permissions.RolesRead);
    writeUpstream(response, await this.forward('ROLE_SERVICE_URL', '/roles', 'GET', undefined, request));
  }

  @Post('roles/assignments')
  async assign(@Body() dto: AssignmentDto, @Req() request: CorrelatedRequest, @Res() response: Response) {
    assertPermission(request.user, Permissions.RolesAssign);
    writeUpstream(response, await this.forward('ROLE_SERVICE_URL', '/assignments', 'POST', dto, request));
  }

  @Delete('roles/assignments/:userId/:roleId')
  async revoke(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Req() request: CorrelatedRequest,
    @Res() response: Response,
  ) {
    assertPermission(request.user, Permissions.RolesAssign);
    writeUpstream(response, await this.forward('ROLE_SERVICE_URL', `/assignments/${userId}/${roleId}`, 'DELETE', undefined, request));
  }

  @Get('audit')
  async audit(@Query() query: PageQuery, @Req() request: CorrelatedRequest, @Res() response: Response) {
    assertPermission(request.user, Permissions.AuditRead);
    writeUpstream(response, await this.forward('AUDIT_SERVICE_URL', `/audit${this.queryString(query)}`, 'GET', undefined, request));
  }

  @Post('ai/query')
  async ai(@Body() dto: AiQueryDto, @Req() request: CorrelatedRequest, @Res() response: Response) {
    assertPermission(request.user, Permissions.AiQuery);
    writeUpstream(response, await this.forward('AI_SERVICE_URL', '/ai/query', 'POST', dto, request, 30000));
  }

  @Post('ai/ingest')
  async ingest(@Body() dto: IngestDto, @Req() request: CorrelatedRequest, @Res() response: Response) {
    assertPermission(request.user, Permissions.AiQuery);
    writeUpstream(response, await this.forward('AI_SERVICE_URL', '/ai/ingest', 'POST', dto, request, 30000));
  }

  @Get('ai/metrics')
  async aiMetrics(@Req() request: CorrelatedRequest, @Res() response: Response) {
    assertPermission(request.user, Permissions.AiQuery);
    writeUpstream(response, await this.forward('AI_SERVICE_URL', '/ai/metrics', 'GET', undefined, request));
  }

  private forward(
    envName: string,
    path: string,
    method: string,
    body: unknown,
    request: CorrelatedRequest,
    timeoutMs = 8000,
    extraHeaders: Record<string, string> = {},
  ) {
    const base = this.config.getOrThrow<string>(envName).replace(/\/$/, '');
    return this.proxy.request(`${base}${path}`, {
      method,
      body,
      timeoutMs,
      headers: { ...headersFromRequest(request, this.config.getOrThrow<string>('INTERNAL_TOKEN')), ...extraHeaders },
    });
  }

  private queryString(query: PageQuery): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const text = params.toString();
    return text ? `?${text}` : '';
  }
}
