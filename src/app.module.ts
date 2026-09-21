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
import { FreightRequestModule } from './components/freight-request/freight-request.module';
import { FreightRouteModule } from '@components/freight-route/freight-route.module';
//Croon
import { FreightRequestCronModule } from '@components/cron/freight-requests/freight-request-croon-module';
import { SqsModule } from '@components/sqs/sqs.module';
import { DashboardModule } from '@components/dashboard/dashboard.module';
import { NotificationModule } from '@components/notifications/notifications.module';
import { AnalysisModule } from '@components/analysis/analysis.module';
import { FeedbackModule } from '@components/feedback/feedback.module';
import { FormsModule } from '@components/forms/forms.module';
import { CompanySearchModule } from './components/company-search/company-search.module';
import { ExcludeModule } from '@components/exclude/exclude.module';
import { FreightRouteLocationsModule } from './components/freight-route-locations/freight-route-locations.module';
import { DistanceModule } from '@components/distance/distance.module';
import { SapiensModule } from '@components/sapiens/sapiens.module';
import { SiimpWebhookModule } from '@components/webhooks/siimp/siimp-webhook.module';
import { ExternalApiModule } from '@components/external-api/external-api.module';
import { DownloadTrackingModule } from '@components/download-tracking/download-tracking.module';
import { IntegrationsModule } from '@components/integrations/integrations.module';
import { SeedModule } from '@components/seed/seed.module';
import { FretebrasModule } from '@components/fretebras/fretebras.module';
import { UIFeaturesModule } from '@components/ui-features/ui-features.module';
import { SdrModule } from '@components/sdr/srd.module';
import { RouteCacheModule } from '@components/route-cache/route-cache.module';
import { GeocodingModule } from '@components/geocoding/geocoding.module';

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
    FreightRequestModule,
    FreightRouteModule,
    FreightRequestCronModule,
    SqsModule,
    DashboardModule,
    NotificationModule,
    AnalysisModule,
    FeedbackModule,
    FormsModule,
    CompanySearchModule,
    ExcludeModule,
    FreightRouteLocationsModule,
    DistanceModule,
    SapiensModule,
    SiimpWebhookModule,
    ExternalApiModule,
    DownloadTrackingModule,
    IntegrationsModule,
    SeedModule,
    FretebrasModule,
    UIFeaturesModule,
    SdrModule,
    RouteCacheModule,
    GeocodingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply().forRoutes('*');
  }
}
