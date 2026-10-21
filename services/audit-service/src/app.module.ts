import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AmqpClient, HealthController, InternalAuthGuard, JsonLogger, PermissionsGuard } from '@toka/platform';
import { AUDIT_STORE } from './application/ports';
import { ListAuditUseCase } from './application/list-audit.usecase';
import { AuditController } from './infrastructure/http/audit.controller';
import { AuditConsumer } from './infrastructure/messaging/audit.consumer';
import { AuditEvent, AuditEventSchema } from './infrastructure/persistence/audit.schema';
import { MongoAuditStore } from './infrastructure/persistence/mongo-audit.store';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URL'),
        retryAttempts: 20,
        retryDelay: 3000,
      }),
    }),
    MongooseModule.forFeature([{ name: AuditEvent.name, schema: AuditEventSchema }]),
  ],
  controllers: [AuditController, HealthController],
  providers: [
    ListAuditUseCase,
    MongoAuditStore,
    AuditConsumer,
    InternalAuthGuard,
    PermissionsGuard,
    { provide: JsonLogger, useFactory: () => new JsonLogger(process.env.SERVICE_NAME ?? 'audit-service') },
    { provide: AmqpClient, useFactory: () => new AmqpClient(new JsonLogger(process.env.SERVICE_NAME ?? 'audit-service')) },
    { provide: AUDIT_STORE, useExisting: MongoAuditStore },
  ],
})
export class AppModule {}
