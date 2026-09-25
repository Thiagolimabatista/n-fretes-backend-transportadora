import { Module } from '@nestjs/common';
import { SQSService } from './sqs.service';

/**
 * Só publica. A fila de push ao motorista (QUEUE_SHARING_NOTIFICATION_FREIGHT)
 * é consumida pelo n-fretes-workers.
 */
@Module({
  providers: [SQSService],
  exports: [SQSService],
})
export class SqsModule {}
