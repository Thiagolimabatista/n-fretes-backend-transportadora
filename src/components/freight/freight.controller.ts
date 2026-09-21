import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { FreightService } from './freight.service';
import { CreateFreightDto, UpdateFreightDto } from './dto/freight.dto';
import { ParamsFreight } from './interface/IFreight';
import { GetUserId } from 'src/decorators/get-user-decorator';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { Freight } from '@entities/freight.entity';

@ApiTags('freight')
@Controller('freight')
export class FreightController {
  constructor(private readonly freightService: FreightService) {}

  @UseGuards(JwtAuthGuard)
  @Post('/create')
  @ApiOperation({
    summary: 'Criação do frete da empresa',
  })
  @ApiResponse({
    status: 500,
    description: 'Erro ao criar a contato da empresa',
  })
  async createFreightCompany(
    @Body() createFreightCompany: CreateFreightDto,
    @GetUserId() userId: string,
  ): Promise<CreateFreightDto> {
    return this.freightService.createFreightCompany(
      createFreightCompany,
      userId,
    );
  }

  /********************************************************************************** */

  /* @Patch(':id')
  @ApiOperation({ summary: 'Atualização de contato da empresa' })
  @ApiParam({
    name: 'id',
    description:
      'Id da contato para verificar se existe cadastrado na base de dados',
    type: String,
  })
  @ApiResponse(UpdateContactSucess)
  @ApiResponse(ContactNotFound)
  @ApiResponse(ContactCompanyErroUpdate)
  async updateContactCompany(
    @Param('id') id: string,
    @Body() updateContactCompany: UpdateContactCompanyDto,
  ) {
    const result = await this.contactCompanyService.updateContactCompany(
      id,
      updateContactCompany,
    );
    return result;
  } */

  /********************************************************************************** */

  /* @Get('contact/:id')
  @ApiOperation({ summary: 'Traz o contato espefico por Id da empresa' })
  @ApiParam({
    name: 'id',
    description:
      'Id da contato para verificar se existe cadastrado na base de dados',
    type: String,
  })
  @ApiResponse(CreateContactCompanySucess)
  @ApiResponse(ContactNotFound)
  @ApiResponse(ContactCompanyErroUpdate)
  async getContactId(@Param('id') id: string) {
    const result = await this.contactCompanyService.getContactId(id);
    return result;
  } */

  /********************************************************************************** */

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Realiza a busca por todos os fretes passando algum parametro de busca ou não',
  })
  async getFreightsAll(
    @Query() params: ParamsFreight,
    @GetUserId() userId: string,
  ) {
    const result = await this.freightService.getFreightsAll(params, userId);
    return result;
  }

  @Get('myfreights')
  @UseGuards(JwtAuthGuard)
  async geyMyFreightsParams(
    @Query() params: ParamsFreight,
    @GetUserId() userId: string,
  ) {
    const result = await this.freightService.getFreightsByUserId(
      params,
      userId,
    );
    return result;
  }

  /********************************************************************************** */
  @Get('/suggested-drivers')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Filtra os motorista por perto',
  })
  async getSuggestedDrivers(@Query() params: ParamsFreight) {
    const result = await this.freightService.getSuggestedDrivers(params);
    return result;
  }

  /********************************************************************************** */
  @ApiOperation({
    summary: 'Desativa o frete da empresa',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do frete da empresa',
    type: String,
  })
  @UseGuards(JwtAuthGuard)
  @Delete(':id/soft-delete')
  async softDelete(
    @Param('id') id: string,
    @GetUserId() userId: string,
  ): Promise<string> {
    return this.freightService.softDeleteFreight(id, userId);
  }

  /********************************************************************************** */
  @ApiOperation({
    summary: 'Ativação do frete da empresa',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do frete da empresa',
    type: String,
  })
  @UseGuards(JwtAuthGuard)
  @Patch(':id/active-freight')
  async activeFreight(
    @Param('id') id: string,
    @GetUserId() userId: string,
  ): Promise<string> {
    return this.freightService.activateFreight(id, userId);
  }

  /********************************************************************************** */
  @ApiOperation({
    summary: 'Exclusão do frete (soft delete)',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do frete a ser excluído',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Frete excluído com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Frete não encontrado',
  })
  @ApiResponse({
    status: 400,
    description: 'Frete já foi excluído',
  })
  @UseGuards(JwtAuthGuard)
  @Delete(':id/exclude')
  async excludeFreight(
    @Param('id') id: string,
    @GetUserId() userId: string,
  ): Promise<string> {
    return this.freightService.excludeFreight(id, userId);
  }

  /********************************************************************************** */

  @ApiOperation({
    summary:
      'Rota que tras cidades do frete baseado em suas região Norte, Sul, Sudeste',
  })
  @ApiParam({
    name: 'useriD',
    description: 'TokenId',
    type: String,
  })
  @Get('filtersCityOrDestiny')
  @UseGuards(JwtAuthGuard)
  async getFiltersDestinyOrCity(@GetUserId() userId: string) {
    const result = await this.freightService.classifyRegionByState(userId);
    return result;
  }

  @ApiOperation({
    summary: 'Mapeamento completo de regiões de todos os fretes ativos',
  })
  @Get('all-regions-mapping')
  async getAllFreightsRegionsMapping() {
    return this.freightService.getAllFreightsRegionsMapping();
  }

  @ApiOperation({
    summary: 'Mapeamento completo de regiões dos fretes ativos da empresa',
  })
  @Get('company-regions-mapping')
  @UseGuards(JwtAuthGuard)
  async getAllFreightsRegionsMappingByCompany(@GetUserId() userId: string) {
    return this.freightService.getAllFreightsRegionsMappingByCompany(userId);
  }

  /********************************************************************************** */

  @ApiOperation({
    summary: 'Edição do frete da empresa',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do frete da empresa',
    type: String,
  })
  @UseGuards(JwtAuthGuard)
  @Put(':id/edit')
  async editFreight(
    @Param('id') id: string,
    @Body() updateFreight: UpdateFreightDto,
    @GetUserId() userId: string,
  ): Promise<UpdateFreightDto> {
    return this.freightService.editFreight(updateFreight, id, userId);
  }

  /************************************* GET FREIGHT ID********************************************* */

  @ApiOperation({
    summary: 'Localizar  frete da por UID empresa',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do frete da empresa',
    type: String,
  })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getFreightID(@Param('id') id: string): Promise<Freight> {
    return this.freightService.getFreightById(id);
  }

  @ApiOperation({
    summary: 'Localizar  frete da por UID empresa',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do frete da empresa',
    type: String,
  })
  @UseGuards(JwtAuthGuard)
  @Get(':userId/countFreight')
  async freightCountCompany(@Param('userId') userId: string) {
    return this.freightService.freightCountCompany(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':freightId/documents')
  @ApiOperation({ summary: 'Upload de documento para um frete' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/png',
          'image/jpeg',
          'image/jpg',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error('Tipo de arquivo não permitido. Use PNG, JPG, PDF ou DOCX.'),
            false,
          );
        }
      },
    }),
  )
  async uploadFreightDocument(
    @GetUserId() companyId: string,
    @Param('freightId') freightId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('description') description?: string,
    @Body('tags') tagsRaw?: string,
  ) {
    const tags =
      typeof tagsRaw === 'string' && tagsRaw.trim().length > 0
        ? tagsRaw
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
        : [];

    return this.freightService.uploadFreightDocument(
      companyId,
      freightId,
      file,
      description,
      tags,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':freightId/documents')
  @ApiOperation({ summary: 'Lista documentos de um frete' })
  async listFreightDocuments(
    @GetUserId() companyId: string,
    @Param('freightId') freightId: string,
  ) {
    return this.freightService.listFreightDocuments(companyId, freightId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('documents/:documentId')
  @ApiOperation({ summary: 'Remove (soft delete) um documento do frete' })
  async deleteFreightDocument(
    @GetUserId() companyId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.freightService.deleteFreightDocument(companyId, documentId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':freightId/tags')
  @ApiOperation({ summary: 'Adiciona tags ao frete' })
  async addFreightTags(
    @GetUserId() companyId: string,
    @Param('freightId') freightId: string,
    @Body('tags') tags: string[],
  ) {
    if (!Array.isArray(tags) || tags.length === 0) {
      throw new HttpException('tags é obrigatório', HttpStatus.BAD_REQUEST);
    }

    return this.freightService.addFreightTags(companyId, freightId, tags);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':freightId/tags/:tag')
  @ApiOperation({ summary: 'Remove uma tag do frete' })
  async removeFreightTag(
    @GetUserId() companyId: string,
    @Param('freightId') freightId: string,
    @Param('tag') tag: string,
  ) {
    return this.freightService.removeFreightTag(companyId, freightId, tag);
  }
}
