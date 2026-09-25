import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { FreightRequestService } from './freight-request.service';
import { CreateFreightRequestDto } from './dto/create-freight-request.dto';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { GetUserId } from 'src/decorators/get-user-decorator';
import { Actor, GetActor } from 'src/decorators/get-actor.decorator';
import { ParamsFreightRequest } from './interface/IFreightRequest';

@UseGuards(JwtAuthGuard)
@Controller('freight-request')
export class FreightRequestController {
  constructor(private readonly freightRequestService: FreightRequestService) {}

  @Post()
  create(
    @GetUserId() companyId: string,
    @Body() createFreightRequestDto: CreateFreightRequestDto,
  ) {
    return this.freightRequestService.create(
      companyId,
      createFreightRequestDto,
    );
  }

  @Get()
  findAll(@GetUserId() userId: string, @Query() params: ParamsFreightRequest) {
    return this.freightRequestService.findAll(userId, params);
  }

  /** Aceite em 1 passo: cria a rota e avisa o motorista para iniciá-la. */
  @Patch(':id/accept')
  async acceptFreightRequest(@GetActor() actor: Actor, @Param('id') id: string) {
    return this.freightRequestService.acceptFreightRequest(actor.companyId, id, actor);
  }

  /** Mantido por compatibilidade: mesma lógica e resposta de `:id/accept`. */
  @Patch(':id/accept-direct')
  async acceptFreightRequestDirect(@GetActor() actor: Actor, @Param('id') id: string) {
    return this.freightRequestService.acceptFreightRequest(actor.companyId, id, actor);
  }

  @Patch(':id/confirmed')
  async confirmedFreightRequest(@GetActor() actor: Actor, @Param('id') id: string) {
    return this.freightRequestService.confirmedFreightRequest(actor.companyId, id, actor);
  }

  @Patch(':id/reject')
  async rejectFreightRequest(@GetActor() actor: Actor, @Param('id') id: string) {
    return this.freightRequestService.rejectFreightRequest(actor.companyId, id, actor);
  }
}
