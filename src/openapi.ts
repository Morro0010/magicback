import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function generateOpenApi() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: false },
  );

  const config = new DocumentBuilder()
    .setTitle('MAGIC CITY API')
    .setDescription('API demo funcional para manejo de eventos')
    .setVersion('1.0.0')
    .addCookieAuth('mc_session')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outputPath = resolve(process.cwd(), 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(document, null, 2));

  await app.close();
  // eslint-disable-next-line no-console
  console.log(`OpenAPI document generated at ${outputPath}`);
}

void generateOpenApi();
