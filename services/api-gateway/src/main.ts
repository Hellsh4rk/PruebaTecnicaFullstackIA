import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { configureHttp, JsonLogger } from '@toka/platform';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const service = process.env.SERVICE_NAME ?? 'api-gateway';
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger(service) });
  configureHttp(app, service);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, allowedHeaders: ['content-type', 'authorization', 'x-correlation-id'] });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
