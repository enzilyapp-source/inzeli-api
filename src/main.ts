import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { rateLimitMiddleware } from './common/rate-limit.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', 1);
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // ✅ أمان: يضيف هيدرات HTTP مهمة
  app.use(helmet());
  app.use(rateLimitMiddleware);

  // ✅ CORS: يمكن تضييقه من Render عبر CORS_ORIGINS=domain1,domain2
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ✅ كل مسارات الـ API تبدأ بـ /api
  app.setGlobalPrefix('api');

  // ✅ فالفيداشن للـ DTOs (يحذف قيم غريبة + يحوّل الأنواع)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 API running on http://0.0.0.0:${port}`);
}
bootstrap();
//main.ts
