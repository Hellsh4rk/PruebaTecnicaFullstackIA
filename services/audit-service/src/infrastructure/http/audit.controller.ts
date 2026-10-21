import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Permissions } from '@toka/contracts';
import { InternalAuthGuard, PermissionsGuard, RequirePermissions } from '@toka/platform';
import { IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Connection } from 'mongoose';
import { ListAuditUseCase } from '../../application/list-audit.usecase';

class ListAuditQuery {
  @IsOptional()
  @IsString()
  @Length(0, 80)
  type?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  correlationId?: string;

  @IsOptional()
  @Min(1)
  page?: number;

  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number;
}

@Controller()
export class AuditController {
  constructor(
    private readonly listAudit: ListAuditUseCase,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  @Get('audit')
  @UseGuards(InternalAuthGuard, PermissionsGuard)
  @RequirePermissions(Permissions.AuditRead)
  list(@Query() query: ListAuditQuery) {
    return this.listAudit.execute(query);
  }

  @Get('ready')
  async ready() {
    if (this.connection.readyState !== 1) {
      throw new Error('Mongo no está listo');
    }
    return { status: 'ready', service: 'audit-service' };
  }
}
