import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FreightQuote } from '@entities/freight-quote.entity';
import { CreateQuoteDto } from './dto/create-quote.dto';
import {
  SapiensAuthResponse,
  SapiensQuoteRequest,
  SapiensQuoteResponse,
} from './interfaces/sapiens.interface';
import axios from 'axios';

@Injectable()
export class SapiensService {
  private readonly SAPIENS_BASE_URL =
    process.env.SAPIENS_BASE_URL ??
    'https://integration-9a3k2z.fretes.sapiensagro.com';
  private readonly USERNAME = process.env.SAPIENS_USERNAME ?? '';
  private readonly PASSWORD = process.env.SAPIENS_PASSWORD ?? '';

  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    @InjectRepository(FreightQuote)
    private freightQuoteRepository: Repository<FreightQuote>,
  ) {}

  private async getAccessToken(): Promise<string> {
    if (!this.USERNAME || !this.PASSWORD) {
      throw new HttpException(
        'Serviço de cotação temporariamente indisponível',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post<SapiensAuthResponse>(
        `${this.SAPIENS_BASE_URL}/token`,
        new URLSearchParams({
          grant_type: 'password',
          username: this.USERNAME,
          password: this.PASSWORD,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + 3600 * 1000);

      return this.accessToken;
    } catch {
      throw new HttpException(
        'Erro ao autenticar com Sapiens API',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async fetchFromSapiens(
    request: SapiensQuoteRequest,
  ): Promise<SapiensQuoteResponse> {
    const token = await this.getAccessToken();

    try {
      const response = await axios.post<SapiensQuoteResponse>(
        `${this.SAPIENS_BASE_URL}/fretes-endpoint`,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      );

      return response.data;
    } catch {
      throw new HttpException(
        'Erro ao buscar cotação da Sapiens API',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getQuote(
    userId: string,
    createQuoteDto: CreateQuoteDto,
  ): Promise<FreightQuote> {
    const { date, cmdy, origin, destination, type_flag } = createQuoteDto;

    const existingQuote = await this.freightQuoteRepository.findOne({
      where: {
        origin,
        destination,
        commodity: cmdy,
      },
      order: { createdAt: 'DESC' },
    });
    if (existingQuote) {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      if (existingQuote.createdAt > threeMonthsAgo) {
        return existingQuote;
      }
    }
    const sapiensRequest: SapiensQuoteRequest = {
      date,
      cmdy,
      origin,
      destination,
      type_flag,
    };

    const sapiensResponse = await this.fetchFromSapiens(sapiensRequest);
    let predictedFreight: number;
    let horizonPredictions: Array<{ date: string; predicted_freight: number }>;
    let distance: number;
    let duration: number;
    let monthlyTotal: number;
    let anttData: any;

    if (sapiensResponse.predictions) {
      predictedFreight =
        sapiensResponse.predictions.specific_date_prediction.predicted_freight;
      horizonPredictions = sapiensResponse.predictions.horizon_predictions;
      distance = sapiensResponse.predictions.additional_info.distance;
      duration = sapiensResponse.predictions.additional_info.duration;
      monthlyTotal = sapiensResponse.predictions.additional_info.monthly_total;
      anttData = sapiensResponse.predictions.antt;
    } else {
      predictedFreight = sapiensResponse.predictedFreight;
      horizonPredictions = sapiensResponse.horizonPredictions;
      distance = sapiensResponse.distance;
      duration = sapiensResponse.duration;
      monthlyTotal = sapiensResponse.monthlyTotal;
      anttData = sapiensResponse.anttData;
    }

    const newQuote = this.freightQuoteRepository.create({
      userId,
      date,
      commodity: cmdy,
      origin,
      destination,
      typeFlag: type_flag,
      predictedFreight,
      horizonPredictions,
      distance,
      duration,
      monthlyTotal,
      anttData,
    });

    return await this.freightQuoteRepository.save(newQuote);
  }

  async getUserQuotes(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: FreightQuote[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [quotes, total] = await this.freightQuoteRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: quotes,
      total,
      page,
      limit,
    };
  }

  async getQuoteById(id: string, userId: string): Promise<FreightQuote> {
    const quote = await this.freightQuoteRepository.findOne({
      where: { id, userId },
    });

    if (!quote) {
      throw new HttpException('Cotação não encontrada', HttpStatus.NOT_FOUND);
    }

    return quote;
  }
}
