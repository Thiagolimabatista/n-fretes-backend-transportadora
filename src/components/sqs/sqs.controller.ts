import { Controller, Post, Body } from '@nestjs/common';
import { SQSService } from './sqs.service';
import { ApiTags } from '@nestjs/swagger';

@Controller('queue')
@ApiTags('queue')
export class SqsController {
  constructor(private readonly sqsService: SQSService) {}

  @Post('freight-scraper')
  async sendToFreightScraper(@Body() body: any) {
    await this.sqsService.sendToFreightScraperQueue(body);

    return {
      status: 'success',
      message: 'Mensagem enviada para fila de scraping',
      data: {
        timestamp: new Date().toISOString(),
        queue: 'FREIGHT_SCRAPER_QUEUE',
      },
    };
  }
}
