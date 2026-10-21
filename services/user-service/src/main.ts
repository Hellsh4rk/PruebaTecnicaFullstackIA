import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { configureHttp, JsonLogger } from '@toka/platform';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const service = process.env.SERVICE_NAME ?? 'user-service';
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger(service) });
  configureHttp(app, service);
  await app.listen(Number(process.env.PORT ?? 3002), '0.0.0.0');
}

void bootstrap();
