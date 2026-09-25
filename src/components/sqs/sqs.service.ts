import { Injectable } from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SQSService {
  private sqsClient: SQSClient;
  private readonly queueUrlFreightSharing =
    process.env.QUEUE_SHARING_NOTIFICATION_FREIGHT;

  constructor(private configService: ConfigService) {
    this.sqsClient = new SQSClient({
      region: this.configService.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async sendNotificationToDriver(payload: {
    freightRequestId: string;
    driverId: string;
    freightId: string;
    status: string;
    expiresAt: string;
    /** Rota criada no aceite (status ACCEPTED), para o app abrir o frete ativo. */
    routeId?: string;
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
}
