import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CompanySearchService } from './company-search.service';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';

@Controller('company-search')
export class CompanySearchController {
  constructor(private readonly service: CompanySearchService) {}

  @Get()
  async findByCnpj(@Query('cnpj') cnpj: string) {
    return this.service.findByCnpj(cnpj);
  }

  @Get('receita')
  async getCnpjFromReceita(@Query('cnpj') cnpj: string) {
    return this.service.getCnpjData(cnpj);
  }
}
