import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SQSService {
  private sqsClient: SQSClient;
  private readonly queueUrlFreightSharing =
    process.env.QUEUE_SHARING_NOTIFICATION_FREIGHT;
  private readonly freightScraperQueue = process.env.FREIGHT_SCRAPER_QUEUE;

  constructor(private configService: ConfigService) {
    this.sqsClient = new SQSClient({
      region: this.configService.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async sendMessage(
    queueUrl: string,
    message: any,
    messageGroupId?: string,
  ): Promise<void> {
    const params = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
      ...(messageGroupId && { MessageGroupId: messageGroupId }),
    };

    try {
      const command = new SendMessageCommand(params);
      await this.sqsClient.send(command);
    } catch (error) {
      console.error('Error sending message to SQS:', error);
      throw error;
    }
  }

  async sendNotificationToDriver(payload: {
    freightRequestId: string;
    driverId: string;
    freightId: string;
    status: string;
    expiresAt: string;
  }) {
    const params = {
      QueueUrl: this.queueUrlFreightSharing,
      MessageBody: JSON.stringify({
        type: 'FREIGHT_RESPONSE',
        data: payload,
        timestamp: new Date().toISOString(),
      }),
      MessageAttributes: {
        EventType: {
          DataType: 'String',
          StringValue: 'FREIGHT_RESPONSE',
        },
        DriverId: {
          DataType: 'String',
          StringValue: payload.driverId,
        },
      },
    };

    try {
      await this.sqsClient.send(new SendMessageCommand(params));
    } catch (error) {
      console.error('Erro ao enviar mensagem para SQS:', error);
      throw new Error('Falha ao enviar notificação para o motorista');
    }
  }

  async sendToFreightScraperQueue(payload: any): Promise<void> {
    try {
      const message = {
        ...payload,
        timestamp: new Date().toISOString(),
      };

      await this.sendMessage(this.freightScraperQueue, message);
    } catch (error) {
      console.error('Error sending to freight scraper queue:', error);
      throw new HttpException(
        'Failed to send message to freight scraper queue',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
