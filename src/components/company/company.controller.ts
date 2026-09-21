import {
  Body,
  Controller,
  UseGuards,
  Put,
  Get,
  Patch,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';

import {
  CompanyPublicProfile,
  CompanyService,
  CompanyUpdateResponse,
} from './company.service';
import { GetUserId } from 'src/decorators/get-user-decorator';
import { companyUpdateDto } from './dto/Company.dto';
import { companyUpdateDtoSwagger } from 'src/common/company-swagger/company-swagger';

@ApiTags('company')
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Put('update')
  @ApiOperation({
    summary: companyUpdateDtoSwagger.summary,
    description: companyUpdateDtoSwagger.description,
  })
  @ApiBody(companyUpdateDtoSwagger.requestBody)
  @ApiResponse(companyUpdateDtoSwagger.responses[200])
  @ApiResponse(companyUpdateDtoSwagger.responses[400])
  @ApiResponse(companyUpdateDtoSwagger.responses[500])
  async updatePlan(
    @GetUserId() userId: string,
    @Body() body: companyUpdateDto,
  ): Promise<CompanyUpdateResponse> {
    return this.companyService.updateUserIdCompany(userId, body);
  }

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Get('is-success')
  @ApiOperation({
    summary: 'Verificar status de sucesso',
    description: 'Verifica se o campo isSucess está marcado como true ou false',
  })
  @ApiResponse({
    status: 200,
    description: 'Status verificado com sucesso',
    schema: {
      example: { isSucess: true },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Empresa não encontrada',
  })
  async checkIsSucess(
    @GetUserId() userId: string,
  ): Promise<{ isSucess: boolean }> {
    return this.companyService.checkIsSucess(userId);
  }

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Patch('mark-success')
  @ApiOperation({
    summary: 'Marcar como sucesso',
    description: 'Atualiza o campo isSucess para true',
  })
  @ApiResponse({
    status: 200,
    description: 'Status atualizado com sucesso',
    schema: {
      example: { message: 'Status atualizado com sucesso' },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Empresa não encontrada',
  })
  async updateIsSucess(
    @GetUserId() userId: string,
  ): Promise<{ message: string }> {
    return this.companyService.updateIsSucess(userId);
  }

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Get(':id/profile')
  @ApiOperation({
    summary: 'Perfil público da transportadora',
    description:
      'Nome, cidade, data de cadastro, total de fretes ativos/publicados e todos os contatos responsáveis pelos fretes da transportadora.',
  })
  @ApiResponse({ status: 200, description: 'Perfil encontrado' })
  @ApiResponse({ status: 404, description: 'Transportadora não encontrada' })
  async getPublicProfile(
    @Param('id') id: string,
  ): Promise<CompanyPublicProfile> {
    return this.companyService.getPublicProfile(id);
  }

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Patch('onboarding/complete')
  @ApiOperation({
    summary: 'Concluir primeiro acesso',
    description:
      'Registra que a empresa já viu o convite para cadastrar o primeiro frete, para ele não reaparecer.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: { onboardingCompletedAt: '2026-09-21T12:00:00.000Z' },
    },
  })
  async completeOnboarding(
    @GetUserId() userId: string,
  ): Promise<{ onboardingCompletedAt: Date }> {
    return this.companyService.completeOnboarding(userId);
  }
}
