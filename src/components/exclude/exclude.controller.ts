import { Body, Controller, Post, Patch, Param } from '@nestjs/common';
import { ExcludeService } from './exclude.service';
import { CreateExcludeDto } from './dto/create-exclude.dto';

@Controller('exclude')
export class ExcludeController {
  constructor(private readonly excludeService: ExcludeService) {}

  @Post()
  async createExcludeRequest(@Body() dto: CreateExcludeDto) {
    return this.excludeService.createExcludeRequest(dto);
  }

  @Patch(':id/mark-deleted')
  async markAsDeleted(@Param('id') id: string) {
    return this.excludeService.markAsDeleted(id);
  }
}
