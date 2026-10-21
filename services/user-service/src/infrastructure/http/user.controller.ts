import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Permissions } from '@toka/contracts';
import { CorrelatedRequest, InternalAuthGuard, PermissionsGuard, RequirePermissions } from '@toka/platform';
import { DataSource } from 'typeorm';
import {
  CreateUserUseCase,
  DeactivateUserUseCase,
  GetUserUseCase,
  ListUsersUseCase,
  RemoveUserUseCase,
  UpdateUserUseCase,
} from '../../application/user.usecases';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto';

@Controller()
export class UserController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly listUsers: ListUsersUseCase,
    private readonly deactivateUser: DeactivateUserUseCase,
    private readonly removeUser: RemoveUserUseCase,
    private readonly dataSource: DataSource,
  ) {}

  @Post('users')
  @RequirePermissions(Permissions.UsersWrite)
  create(@Body() dto: CreateUserDto, @Req() request: CorrelatedRequest) {
    return this.createUser.execute({ ...dto, correlationId: request.correlationId, traceId: request.traceId });
  }

  @Get('users')
  @RequirePermissions(Permissions.UsersRead)
  list(@Query() query: ListUsersQuery) {
    return this.listUsers.execute(query);
  }

  @Get('users/:id')
  @RequirePermissions(Permissions.UsersRead)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.getUser.execute(id);
  }

  @Patch('users/:id')
  @RequirePermissions(Permissions.UsersWrite)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @Req() request: CorrelatedRequest) {
    return this.updateUser.execute({ id, ...dto, correlationId: request.correlationId, traceId: request.traceId });
  }

  @Post('users/:id/deactivate')
  @RequirePermissions(Permissions.UsersWrite)
  deactivate(@Param('id', ParseUUIDPipe) id: string, @Req() request: CorrelatedRequest) {
    return this.deactivateUser.execute({ id, correlationId: request.correlationId, traceId: request.traceId });
  }

  @Delete('internal/users/:id')
  @RequirePermissions(Permissions.UsersWrite)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: CorrelatedRequest) {
    return this.removeUser.execute({ id, correlationId: request.correlationId, traceId: request.traceId });
  }

  @Get('ready')
  async ready() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ready', service: 'user-service' };
  }
}
