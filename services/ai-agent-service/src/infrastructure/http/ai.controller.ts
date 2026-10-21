import { Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { Permissions } from '@toka/contracts';
import { CircuitBreaker, CorrelatedRequest, InternalAuthGuard, PermissionsGuard, RequirePermissions } from '@toka/platform';
import { IsString, Length } from 'class-validator';
import { IngestKnowledgeUseCase, QueryKnowledgeUseCase } from '../../application/ai.usecases';
import { MetricsStore } from '../../domain/metrics';

class QueryDto {
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
export class AiController {
  constructor(
    private readonly queryKnowledge: QueryKnowledgeUseCase,
    private readonly ingestKnowledge: IngestKnowledgeUseCase,
    private readonly metrics: MetricsStore,
    private readonly breaker: CircuitBreaker,
  ) {}

  @Post('ai/query')
  @UseGuards(InternalAuthGuard, PermissionsGuard)
  @RequirePermissions(Permissions.AiQuery)
  query(@Body() dto: QueryDto, @Headers('x-user-id') userId = 'anonymous', @Headers('x-user-roles') roles = '', @Req() request: CorrelatedRequest) {
    return this.queryKnowledge.execute({
      question: dto.question,
      userId,
      roles: roles.split(',').map((role) => role.trim()).filter(Boolean),
      correlationId: request.correlationId,
      traceId: request.traceId,
    });
  }

  @Post('ai/ingest')
  @UseGuards(InternalAuthGuard, PermissionsGuard)
  @RequirePermissions(Permissions.AiQuery)
  ingest(@Body() dto: IngestDto) {
    return this.ingestKnowledge.execute(dto);
  }

  @Get('ai/metrics')
  @UseGuards(InternalAuthGuard, PermissionsGuard)
  @RequirePermissions(Permissions.AiQuery)
  metricsSnapshot() {
    return this.metrics.snapshot(this.breaker.snapshot().state);
  }

  @Get('ready')
  ready() {
    return { status: 'ready', service: 'ai-agent-service', circuit: this.breaker.snapshot().state };
  }
}
