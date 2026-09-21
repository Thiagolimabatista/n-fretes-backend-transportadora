import { Injectable } from '@nestjs/common';

export interface PaginationParams {
  take?: number;
  page?: number;
}

@Injectable()
export class PaginationService {
  getDefaultPaginationParams(params: PaginationParams): {
    take: number;
    page: number;
  } {
    // Todos os serviços paginam com (page - 1) * take: página mínima é 1.
    const take = Math.max(Number(params.take) || 10, 1);
    const page = Math.max(Number(params.page) || 1, 1);

    return { take, page };
  }
}
