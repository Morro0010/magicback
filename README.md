# Backend - MAGIC CITY

NestJS + Fastify + Prisma (PostgreSQL).

## Run

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run db:migrate
npm run db:seed
npm run start:dev
```

## Key scripts

- `npm run build`
- `npm test -- --runInBand`
- `npm run openapi:json`
- `npm run db:deploy`
