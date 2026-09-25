import { Injectable } from '@nestjs/common';

export interface PaginationParams {
  take?: number;
  page?: number;
}

const MAX_TAKE = 1000;

@Injectable()
export class PaginationService {
  getDefaultPaginationParams(params: PaginationParams): {
    take: number;
    page: number;
  } {
    // Todos os serviços paginam com (page - 1) * take: página mínima é 1.
    // Teto de 1000 (o monitoramento carrega a frota inteira de uma vez).
    const take = Math.min(Math.max(Number(params.take) || 10, 1), MAX_TAKE);
    const page = Math.max(Number(params.page) || 1, 1);

    return { take, page };
  }
}
