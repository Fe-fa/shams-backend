import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule, {
      cors: true,
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    const configService = app.get(ConfigService);
    const port = configService.get<number>('PORT', 3000);
    const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');

    // Security
    app.use(helmet());

    // Global prefix
    app.setGlobalPrefix(apiPrefix);

    // Global pipes
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Global filters
    app.useGlobalFilters(new HttpExceptionFilter());

    // Global interceptors
    app.useGlobalInterceptors(new TransformInterceptor());

    // CORS
    app.enableCors({
      origin: configService.get<string>('FRONTEND_URL', 'http://localhost:5173'),
      credentials: true,
    });

    // Test database connection
    const prismaService = app.get(PrismaService);
    await prismaService.$connect();
    logger.log('✅ Database connection verified');

    // Graceful shutdown
    app.enableShutdownHooks();

    await app.listen(port);
    logger.log(`🚀 Application is running on: http://localhost:${port}/${apiPrefix}`);
    logger.log(`📚 Environment: ${process.env.NODE_ENV || 'development'}`);
  } catch (error) {
    logger.error('❌ Application failed to start', error);
    process.exit(1);
  }
}

bootstrap();
