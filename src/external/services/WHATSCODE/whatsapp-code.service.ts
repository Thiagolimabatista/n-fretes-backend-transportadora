import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class WhatsappService {
  private readonly baseURL: string;

  constructor(private readonly httpService: HttpService) {
    this.baseURL = process.env.WHATSAPP_2FA_WEBHOOK_URL ?? '';
  }

  async whatsAppCode(phone: string, code: number) {
    try {
      if (!this.baseURL) {
        throw new HttpException(
          'Serviço de envio de código temporariamente indisponível',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const url = `${this.baseURL}`;
      const data = {
        phone,
        code,
      };
      const response = await firstValueFrom(this.httpService.post(url, data));

      if (response.status !== 200) {
        throw new HttpException(
          'Erro ao enviar código de redefinição',
          HttpStatus.BAD_REQUEST,
        );
      }

      return response.data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.response?.data?.message || 'Erro ao enviar código de redefinição',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
