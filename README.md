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

## Seeds

El seed normal (`npm run db:seed`) es idempotente y crea o actualiza únicamente
al usuario administrador. No agrega cajeros, reservaciones ni información demo.

Credenciales temporales del seed actual:

- Usuario: `admin@magiccity.local`
- Contraseña: `MC-Admin-Temporal-2026!`

En producción se debe definir `SEED_ADMIN_PASSWORD` con un valor distinto al
predeterminado antes de ejecutar el seed. Después del primer acceso, cambia la
contraseña desde el panel.

El seed demo es independiente y sí reinicia la base con cajeros y datos de
operación:

```bash
npm run build
npm run db:demo:reset
```

Sus contraseñas se reciben mediante `DEMO_ADMIN_PASSWORD`,
`DEMO_CASHIER_PASSWORD` y `DEMO_INACTIVE_PASSWORD`.

## Key scripts

- `npm run build`
- `npm test -- --runInBand`
- `npm run openapi:json`
- `npm run db:deploy` (aplica migraciones y crea los índices grandes en línea)
- `npm run db:indexes` (reintenta de forma segura únicamente los índices en línea)
