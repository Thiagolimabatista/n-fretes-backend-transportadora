import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import typeorm from './config/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { AuthModule } from '@components/auth/auth.module';
import { ContactCompanyModule } from '@components/contact-company/contact-company.module';
import { ContactGroupModule } from '@components/contact-group/contact-group.module';
import { UsersContactCompanyModule } from '@components/users-contact-company/users-contact.module';
import { FreightModule } from '@components/freight/freight.module';
import { CompanyModule } from '@components/company/company.module';
import { PreferencesModule } from '@components/preferences/preferences.module';
import { FreightRequestModule } from './components/freight-request/freight-request.module';
import { FreightRouteModule } from '@components/freight-route/freight-route.module';
//Croon
import { FreightRequestCronModule } from '@components/cron/freight-requests/freight-request-croon-module';
import { SqsModule } from '@components/sqs/sqs.module';
import { DashboardModule } from '@components/dashboard/dashboard.module';
import { NotificationModule } from '@components/notifications/notifications.module';
import { FormsModule } from '@components/forms/forms.module';
import { CompanySearchModule } from './components/company-search/company-search.module';
import { ExcludeModule } from '@components/exclude/exclude.module';
import { FreightRouteLocationsModule } from './components/freight-route-locations/freight-route-locations.module';
import { DistanceModule } from '@components/distance/distance.module';
import { DownloadTrackingModule } from '@components/download-tracking/download-tracking.module';
import { RouteCacheModule } from '@components/route-cache/route-cache.module';
import { GeocodingModule } from '@components/geocoding/geocoding.module';
import { RealtimeModule } from '@components/realtime/realtime.module';
import { WebPushModule } from '@components/web-push/web-push.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [typeorm],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) =>
        configService.get('typeorm'),
    }),

    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    ContactCompanyModule,
    ContactGroupModule,
    UsersContactCompanyModule,
    FreightModule,
    CompanyModule,
    PreferencesModule,
    FreightRequestModule,
    FreightRouteModule,
    FreightRequestCronModule,
    SqsModule,
    DashboardModule,
    NotificationModule,
    FormsModule,
    CompanySearchModule,
    ExcludeModule,
    FreightRouteLocationsModule,
    DistanceModule,
    DownloadTrackingModule,
    RouteCacheModule,
    GeocodingModule,
    RealtimeModule,
    WebPushModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply().forRoutes('*');
  }
}
