import { Controller, Get, Query } from '@nestjs/common';
import { CompanySearchService } from './company-search.service';

@Controller('company-search')
export class CompanySearchController {
  constructor(private readonly service: CompanySearchService) {}

  @Get('receita')
  async getCnpjFromReceita(@Query('cnpj') cnpj: string) {
    return this.service.getCnpjData(cnpj);
  }
}
