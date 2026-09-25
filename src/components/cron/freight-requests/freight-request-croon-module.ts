import { Module } from '@nestjs/common';
import { SqsModule } from '@components/sqs/sqs.module';
import { FreightRequestCronService } from './freight-request-croon';

@Module({
  imports: [SqsModule],
  providers: [FreightRequestCronService],
  exports: [FreightRequestCronService],
})
export class FreightRequestCronModule {}
