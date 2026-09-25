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
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { FreightService } from './freight.service';
import { CreateFreightDto, UpdateFreightDto } from './dto/freight.dto';
import { ParamsFreight } from './interface/IFreight';
import { GetUserId } from 'src/decorators/get-user-decorator';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { Freight } from '@entities/freight.entity';

@Controller('freight')
export class FreightController {
  constructor(private readonly freightService: FreightService) {}

  @UseGuards(JwtAuthGuard)
  @Post('/create')
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

  @Get()
  @UseGuards(JwtAuthGuard)
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
  async getSuggestedDrivers(@Query() params: ParamsFreight) {
    const result = await this.freightService.getSuggestedDrivers(params);
    return result;
  }

  /********************************************************************************** */
  @UseGuards(JwtAuthGuard)
  @Delete(':id/soft-delete')
  async softDelete(
    @Param('id') id: string,
    @GetUserId() userId: string,
  ): Promise<string> {
    return this.freightService.softDeleteFreight(id, userId);
  }

  /********************************************************************************** */
  @UseGuards(JwtAuthGuard)
  @Patch(':id/active-freight')
  async activeFreight(
    @Param('id') id: string,
    @GetUserId() userId: string,
  ): Promise<string> {
    return this.freightService.activateFreight(id, userId);
  }

  /********************************************************************************** */
  @UseGuards(JwtAuthGuard)
  @Delete(':id/exclude')
  async excludeFreight(
    @Param('id') id: string,
    @GetUserId() userId: string,
  ): Promise<string> {
    return this.freightService.excludeFreight(id, userId);
  }

  /********************************************************************************** */

  @Get('search-options')
  @UseGuards(JwtAuthGuard)
  async getSearchOptions(
    @Query() params: ParamsFreight & { scope?: string },
    @GetUserId() userId: string,
  ) {
    return this.freightService.getSearchOptions(params, userId);
  }

  @Get('filtersCityOrDestiny')
  @UseGuards(JwtAuthGuard)
  async getFiltersDestinyOrCity(@GetUserId() userId: string) {
    const result = await this.freightService.classifyRegionByState(userId);
    return result;
  }

  @Get('all-regions-mapping')
  async getAllFreightsRegionsMapping() {
    return this.freightService.getAllFreightsRegionsMapping();
  }

  @Get('company-regions-mapping')
  @UseGuards(JwtAuthGuard)
  async getAllFreightsRegionsMappingByCompany(@GetUserId() userId: string) {
    return this.freightService.getAllFreightsRegionsMappingByCompany(userId);
  }

  /********************************************************************************** */

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

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getFreightID(@Param('id') id: string): Promise<Freight> {
    return this.freightService.getFreightById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':userId/countFreight')
  async freightCountCompany(@Param('userId') userId: string) {
    return this.freightService.freightCountCompany(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':freightId/documents')
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
  async listFreightDocuments(
    @GetUserId() companyId: string,
    @Param('freightId') freightId: string,
  ) {
    return this.freightService.listFreightDocuments(companyId, freightId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('documents/:documentId')
  async deleteFreightDocument(
    @GetUserId() companyId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.freightService.deleteFreightDocument(companyId, documentId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':freightId/tags')
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
  async removeFreightTag(
    @GetUserId() companyId: string,
    @Param('freightId') freightId: string,
    @Param('tag') tag: string,
  ) {
    return this.freightService.removeFreightTag(companyId, freightId, tag);
  }
}
