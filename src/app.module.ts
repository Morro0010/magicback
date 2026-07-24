import { Module } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { BlockedSlotsModule } from './blocked-slots/blocked-slots.module';
import { CalendarModule } from './calendar/calendar.module';
import { CommonModule } from './common/common.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CsrfGuard } from './common/guards/csrf.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { SessionAuthGuard } from './common/guards/session-auth.guard';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { ConfigModule } from './config/config.module';
import { CustomersModule } from './customers/customers.module';
import { FinanceModule } from './finance/finance.module';
import { HealthModule } from './health/health.module';
import { HistoryModule } from './history/history.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PackagesModule } from './packages/packages.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { PublicConfigModule } from './public-config/public-config.module';
import { PublicReservationsModule } from './public-reservations/public-reservations.module';
import { PurchasesModule } from './purchases/purchases.module';
import { ReservationsModule } from './reservations/reservations.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SalesModule } from './sales/sales.module';
import { SpecialEventsModule } from './special-events/special-events.module';
import { UsersModule } from './users/users.module';

function isLoginRequest(context: ExecutionContext) {
  return (
    context.getClass().name === 'AuthController' &&
    context.getHandler().name === 'login'
  );
}

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          limit: 200,
          ttl: 900_000,
        },
        {
          name: 'login-ip',
          limit: 10,
          ttl: 900_000,
          blockDuration: 900_000,
          skipIf: (context) => !isLoginRequest(context),
        },
        {
          name: 'login-account',
          limit: 12,
          ttl: 1_800_000,
          blockDuration: 1_800_000,
          skipIf: (context) => !isLoginRequest(context),
          getTracker: (request) => {
            const body = (request as { body?: unknown }).body;
            const rawEmail =
              body && typeof body === 'object'
                ? (body as { email?: unknown }).email
                : undefined;
            const email =
              typeof rawEmail === 'string'
                ? rawEmail.trim().toLowerCase()
                : '<invalid-email>';
            return `account:${email}`;
          },
        },
      ],
    }),
    PrismaModule,
    CommonModule,
    HealthModule,
    UsersModule,
    CustomersModule,
    AuthModule,
    ProductsModule,
    InventoryModule,
    SalesModule,
    PurchasesModule,
    FinanceModule,
    PackagesModule,
    ReservationsModule,
    PaymentsModule,
    CalendarModule,
    BlockedSlotsModule,
    HistoryModule,
    NotificationsModule,
    PublicReservationsModule,
    ReviewsModule,
    PublicConfigModule,
    SpecialEventsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
