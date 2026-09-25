import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeListenerService } from './realtime-listener.service';
import { WebPushModule } from '@components/web-push/web-push.module';

@Module({
  imports: [WebPushModule],
  providers: [RealtimeGateway, RealtimeListenerService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
