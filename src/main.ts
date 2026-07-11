import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

function normalizeOrigin(origin: string) {
  const trimmed = origin.trim();
  if (trimmed === 'file://' || trimmed === 'null') {
    return trimmed;
  }

  return trimmed.replace(/\/+$/, '');
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 1_048_576,
      trustProxy: true,
      logger: true,
    }),
  );

  const configService = app.get(ConfigService);
  const isProduction = configService.getOrThrow<string>('NODE_ENV') === 'production';
  const frontendOrigin = configService.getOrThrow<string>('FRONTEND_ORIGIN');
  const frontendOrigins = frontendOrigin
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  const localDevelopmentOrigins = isProduction
    ? []
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const allowedOrigins = [...new Set([...frontendOrigins, ...localDevelopmentOrigins])];
  const cspConnectSources = frontendOrigins.flatMap((origin) => {
    if (origin === 'null') {
      return [];
    }

    if (origin === 'file://') {
      return ['file:'];
    }

    return [origin];
  });

  await app.register(fastifyCookie);
  await app.register(fastifyCompress, { global: true });

  await app.register(fastifyHelmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", ...cspConnectSources],
      },
    },
    hsts: isProduction
      ? {
          maxAge: 15552000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    xContentTypeOptions: true,
  });

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (
        allowedOrigins.includes(normalizedOrigin) ||
        (normalizedOrigin.startsWith('file://') && frontendOrigins.includes('file://')) ||
        (normalizedOrigin === 'null' && (frontendOrigins.includes('file://') || frontendOrigins.includes('null')))
      ) {
        callback(null, true);
        return;
      }

      app.getHttpAdapter().getInstance().log.warn(
        { origin: normalizedOrigin, allowedOrigins },
        'CORS origin rejected',
      );
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-CSRF-Token', 'X-Magic-Desktop'],
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MAGIC CITY API')
    .setDescription('API demo funcional para manejo de eventos')
    .setVersion('1.0.0')
    .addCookieAuth('mc_session')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const port = configService.getOrThrow<number>('PORT');
  const host = configService.get<string>('HOST') ?? (isProduction ? '0.0.0.0' : '127.0.0.1');
  await app.listen(port, host);
}

void bootstrap();
