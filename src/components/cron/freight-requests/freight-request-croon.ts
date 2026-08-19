import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Repository, LessThan } from 'typeorm';

import {
  FreightRequest,
  FreightRequestStatus,
} from '@entities/freight-requests.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class FreightRequestCronService {
  private readonly logger = new Logger(FreightRequestCronService.name);
  private readonly backgroundJobsEnabled =
    (process.env.BACKGROUND_JOBS_ENABLED ?? 'true').toLowerCase() !== 'false';

  constructor(
    @InjectRepository(FreightRequest)
    private readonly freightRequestRepository: Repository<FreightRequest>,
  ) {}

  //*/10 * * * * *
  @Cron('0 */30 * * * *')
  async checkExpiredRequests() {
    if (!this.backgroundJobsEnabled) {
      return;
    }

    const now = new Date();
    this.logger.log('Verificando status de expiração de solicitações...');

    const expiredRequests = await this.freightRequestRepository.find({
      where: {
        status: FreightRequestStatus.AWAITING_USER_DRIVE_RESPONSE,
        expiresAt: LessThan(now),
      },
    });

    if (expiredRequests.length === 0) {
      this.logger.log('Nenhuma solicitação expirou.');
      return;
    }

    this.logger.log(
      `Encontradas ${expiredRequests.length} solicitações expiradas.`,
    );

    for (const request of expiredRequests) {
      request.status = FreightRequestStatus.PENDING;
      request.expiresAt = null;
      request.solicitationsOrder = 1;
      await this.freightRequestRepository.save(request);

      this.logger.log(`Solicitação ${request.id} foi revertida para PENDING.`);
    }

    this.logger.log(
      `✔️ ${expiredRequests.length} solicitações foram revertidas para PENDING.`,
    );
  }
}
