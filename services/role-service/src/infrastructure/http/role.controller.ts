import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Permissions } from '@toka/contracts';
import { CorrelatedRequest, InternalAuthGuard, PermissionsGuard, RequirePermissions } from '@toka/platform';
import { DataSource } from 'typeorm';
import { AssignRoleUseCase, GetAccessUseCase, ListRolesUseCase, RevokeRoleUseCase } from '../../application/role.usecases';
import { AssignmentDto } from './dto';

@Controller()
export class RoleController {
  constructor(
    private readonly listRoles: ListRolesUseCase,
    private readonly getAccess: GetAccessUseCase,
    private readonly assignRole: AssignRoleUseCase,
    private readonly revokeRole: RevokeRoleUseCase,
    private readonly dataSource: DataSource,
  ) {}

  @Get('roles')
  @UseGuards(InternalAuthGuard, PermissionsGuard)
  @RequirePermissions(Permissions.RolesRead)
  list() {
    return this.listRoles.execute();
  }

  @Get('internal/users/:userId/access')
  @UseGuards(InternalAuthGuard)
  access(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.getAccess.execute(userId);
  }

  @Post('assignments')
  @UseGuards(InternalAuthGuard, PermissionsGuard)
  @RequirePermissions(Permissions.RolesAssign)
  assign(@Body() dto: AssignmentDto, @Req() request: CorrelatedRequest) {
    return this.assignRole.execute({ ...dto, correlationId: request.correlationId, traceId: request.traceId });
  }

  @Delete('assignments/:userId/:roleId')
  @UseGuards(InternalAuthGuard, PermissionsGuard)
  @RequirePermissions(Permissions.RolesAssign)
  revoke(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Req() request: CorrelatedRequest,
  ) {
    return this.revokeRole.execute({ userId, roleId, correlationId: request.correlationId, traceId: request.traceId });
  }

  @Get('ready')
  async ready() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ready', service: 'role-service' };
  }
}
