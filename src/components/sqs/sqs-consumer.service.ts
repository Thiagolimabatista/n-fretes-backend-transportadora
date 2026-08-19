import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SQSConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SQSConsumerService.name);
  private sqsClient: SQSClient;
  private readonly backgroundJobsEnabled =
    (process.env.BACKGROUND_JOBS_ENABLED ?? 'false').toLowerCase() === 'true';
  private isPolling = true;
  private pollingPromises: Promise<void>[] = [];
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_DELAY = 60000;
  private readonly RATE_LIMIT_DELAY = 60000; // 1 minuto entre mensagens
  private lastProcessedTime: Map<string, number> = new Map();

  private readonly queueUrlFreightSharing =
    process.env.QUEUE_SHARING_NOTIFICATION_FREIGHT;

  constructor(private configService: ConfigService) {
    if (this.backgroundJobsEnabled) {
      this.initializeSQSClient();
    }
  }

  private initializeSQSClient() {
    try {
      this.sqsClient = new SQSClient({
        region: this.configService.get('AWS_REGION'),
        credentials: {
          accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
          secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
        },
      });
      this.logger.log('✅ Cliente SQS inicializado com sucesso');
    } catch (error) {
      this.logger.error('❌ Erro ao inicializar cliente SQS:', error);
      throw error;
    }
  }

  async onModuleInit() {
    if (!this.backgroundJobsEnabled) {
      this.isPolling = false;
      this.logger.warn(
        'SQS Consumer desabilitado por BACKGROUND_JOBS_ENABLED=false',
      );
      return;
    }

    this.logger.log('🚀 Iniciando SQS Consumer (Worker Mode)...');
    this.logger.log('📡 Consumer ficará SEMPRE ativo escutando as filas');

    if (this.queueUrlFreightSharing) {
      const promise = this.startPollingWithRetry(
        this.queueUrlFreightSharing,
        'FREIGHT_SHARING_NOTIFICATIONS',
      );
      this.pollingPromises.push(promise);
    }

    this.startHeartbeat();
  }

  async onModuleDestroy() {
    this.logger.log('🛑 Parando SQS Consumer gracefully...');
    this.isPolling = false;
    await Promise.allSettled(this.pollingPromises);
  }

  private startHeartbeat() {
    setInterval(() => {
      this.logger.log('💓 SQS Consumer ATIVO - Escutando filas...');
    }, 60000);
  }

  private async startPollingWithRetry(
    queueUrl: string,
    queueName: string,
  ): Promise<void> {
    while (this.isPolling) {
      try {
        await this.startPolling(queueUrl, queueName);
      } catch (error) {
        this.logger.error(
          `❌ Erro crítico no polling de ${queueName}. Reconectando...`,
          error,
        );
        await this.handleReconnection(queueName);
      }
    }
  }

  private async handleReconnection(queueName: string): Promise<void> {
    this.reconnectAttempts++;
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.MAX_RECONNECT_DELAY,
    );

    this.logger.warn(
      `🔄 Tentativa de reconexão #${this.reconnectAttempts} para ${queueName} em ${delay}ms`,
    );

    await this.sleep(delay);

    try {
      this.initializeSQSClient();
      this.reconnectAttempts = 0;
      this.logger.log(`✅ Reconectado com sucesso à fila ${queueName}`);
    } catch (error) {
      this.logger.error('❌ Falha na reconexão, tentando novamente...', error);
    }
  }

  private async startPolling(
    queueUrl: string,
    queueName: string,
  ): Promise<void> {
    this.logger.log(`📡 Escutando fila: ${queueName}`);

    while (this.isPolling) {
      try {
        await this.checkRateLimit(queueName);

        const messages = await this.receiveMessages(queueUrl);

        if (messages && messages.length > 0) {
          this.logger.log(
            `📨 ${messages.length} mensagem(ns) recebida(s) de ${queueName}`,
          );

          await Promise.allSettled(
            messages.map((message) =>
              this.processMessage(message, queueUrl, queueName),
            ),
          );

          // Atualizar timestamp de último processamento
          this.lastProcessedTime.set(queueName, Date.now());

          // Aguardar 1 minuto antes de processar próxima mensagem
          this.logger.log(
            `⏱️ Aguardando ${this.RATE_LIMIT_DELAY / 1000}s antes de processar próxima mensagem de ${queueName}...`,
          );
          await this.sleep(this.RATE_LIMIT_DELAY);
        }
      } catch (error) {
        this.logger.error(
          `⚠️ Erro ao receber mensagens de ${queueName} (continuando...):`,
          error.message || error,
        );

        if (this.isConnectionError(error)) {
          this.logger.warn(
            `🔌 Problema de conexão detectado. Aguardando 10s antes de continuar...`,
          );
          await this.sleep(10000);
        } else {
          await this.sleep(2000);
        }
      }
    }
  }

  private isConnectionError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    return (
      errorMessage.includes('connection') ||
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound')
    );
  }

  private async receiveMessages(queueUrl: string): Promise<Message[]> {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1, // Processar apenas 1 mensagem por vez
      WaitTimeSeconds: 20,
      MessageAttributeNames: ['All'],
      AttributeNames: ['All'],
    });

    const response = await this.sqsClient.send(command);
    return response.Messages || [];
  }

  private async processMessage(
    message: Message,
    queueUrl: string,
    queueName: string,
  ): Promise<void> {
    const messageId = message.MessageId || 'unknown';

    try {
      const body = JSON.parse(message.Body || '{}');

      this.logger.log(`🔄 Processando mensagem de ${queueName}:`, {
        messageId,
        type: body.type,
      });

      await Promise.race([
        this.handleMessage(body, queueName),
        this.timeout(30000, `Timeout ao processar mensagem ${messageId}`),
      ]);

      await this.deleteMessage(queueUrl, message.ReceiptHandle!);

      this.logger.log(`✅ Mensagem ${messageId} processada e deletada`);
    } catch (error) {
      this.logger.error(
        `❌ Erro ao processar mensagem ${messageId} (mensagem retornará à fila):`,
        error.message || error,
      );

      if (error.stack) {
        this.logger.debug(`Stack trace: ${error.stack}`);
      }
    }
  }

  private timeout(ms: number, errorMessage: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms),
    );
  }

  private async handleMessage(
    messageBody: any,
    queueName: string,
  ): Promise<void> {
    try {
      switch (queueName) {
        case 'FREIGHT_SHARING_NOTIFICATIONS':
          await this.handleFreightSharingNotification(messageBody);
          break;

        case 'FREIGHT_USERS':
          await this.handleFreightUsersMessage(messageBody);
          break;

        case 'FREIGHT_SCRAPER':
          await this.handleFreightScraperMessage(messageBody);
          break;

        default:
          this.logger.warn(`⚠️ Tipo de fila desconhecido: ${queueName}`);
      }
    } catch (error) {
      this.logger.error(
        `❌ Erro no handler de ${queueName}:`,
        error.message || error,
      );
      throw error;
    }
  }

  private async handleFreightSharingNotification(
    messageBody: any,
  ): Promise<void> {
    try {
      this.logger.log('🚚 Processando notificação de frete:', messageBody);

      if (messageBody.type === 'FREIGHT_RESPONSE') {
        const { driverId, freightId } = messageBody.data || {};

        this.logger.log(
          `Driver ${driverId} recebeu resposta do frete ${freightId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        '❌ Erro em handleFreightSharingNotification:',
        error.message || error,
      );
      throw error;
    }
  }

  private async handleFreightUsersMessage(messageBody: any): Promise<void> {
    try {
      this.logger.log('👥 Processando compartilhamento de frete:', messageBody);

      const { freightId, tokens } = messageBody;

      this.logger.log(
        `Notificando ${tokens?.length || 0} usuários sobre frete ${freightId}`,
      );
    } catch (error) {
      this.logger.error(
        '❌ Erro em handleFreightUsersMessage:',
        error.message || error,
      );
      throw error;
    }
  }

  private async handleFreightScraperMessage(messageBody: any): Promise<void> {
    try {
      this.logger.log('🔍 Processando scraper de frete:', messageBody);
    } catch (error) {
      this.logger.error(
        '❌ Erro em handleFreightScraperMessage:',
        error.message || error,
      );
      throw error;
    }
  }

  private async deleteMessage(
    queueUrl: string,
    receiptHandle: string,
  ): Promise<void> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await this.sqsClient.send(command);
    } catch (error) {
      this.logger.warn(
        `⚠️ Erro ao deletar mensagem (ela será reprocessada):`,
        error.message || error,
      );
    }
  }

  private async checkRateLimit(queueName: string): Promise<void> {
    const lastProcessed = this.lastProcessedTime.get(queueName);

    if (lastProcessed) {
      const timeSinceLastProcessed = Date.now() - lastProcessed;
      const remainingWait = this.RATE_LIMIT_DELAY - timeSinceLastProcessed;

      if (remainingWait > 0) {
        this.logger.log(
          `⏳ Rate limit ativo para ${queueName}. Aguardando ${Math.ceil(remainingWait / 1000)}s...`,
        );
        await this.sleep(remainingWait);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
