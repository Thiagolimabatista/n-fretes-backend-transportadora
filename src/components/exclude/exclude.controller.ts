import { Body, Controller, Post } from '@nestjs/common';
import { ExcludeService } from './exclude.service';
import { CreateExcludeDto } from './dto/create-exclude.dto';

/** Pedido público de exclusão de conta (LGPD). A baixa é feita pelo suporte. */
@Controller('exclude')
export class ExcludeController {
  constructor(private readonly excludeService: ExcludeService) {}

  @Post()
  async createExcludeRequest(@Body() dto: CreateExcludeDto) {
    return this.excludeService.createExcludeRequest(dto);
  }
}
