import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { UsersContactCompanyService } from './users-contact.service';
import { CompanyUsersContactsDto } from './dto/users-contact.dto';
import { ParamsUsersContactCompany } from './interfaces/IUsersContanctCompany';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { GetUserId } from 'src/decorators/get-user-decorator';

/**
 * Rede de motoristas da transportadora ("Meus motoristas"). A empresa vem
 * sempre do token: nenhum endpoint aceita companyId vindo do cliente.
 */
@Controller('users-contact-company')
export class UsersContactCompanyController {
  constructor(
    private readonly usersContactCompanyService: UsersContactCompanyService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('/create')
  async createUsersContactCompany(
    @GetUserId() companyId: string,
    @Body() body: CompanyUsersContactsDto,
  ) {
    return this.usersContactCompanyService.createUsersContactCompany(companyId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('get-all')
  async getCompanyIdParams(
    @GetUserId() companyId: string,
    @Query() params: ParamsUsersContactCompany,
  ) {
    return this.usersContactCompanyService.getContactParamsUsers(companyId, params);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/soft-delete')
  async softDelete(
    @GetUserId() companyId: string,
    @Param('id') id: string,
  ): Promise<string> {
    return this.usersContactCompanyService.softDeleteUsersContactCompany(companyId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':cpf/contact')
  async searchByCpf(@Param('cpf') cpf: string, @GetUserId() companyId: string) {
    return this.usersContactCompanyService.searchUsersByCpf(cpf, companyId);
  }

  /** Viagens do motorista com a empresa do token (histórico no perfil). */
  @UseGuards(JwtAuthGuard)
  @Get('driver/:driverId/trips')
  async listDriverTrips(
    @GetUserId() companyId: string,
    @Param('driverId') driverId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersContactCompanyService.listDriverTripsWithCompany(
      companyId,
      driverId,
      Number(page),
      Number(limit),
    );
  }

  /** Público de propósito: página de convite de membro da equipe. */
  @Get(':id/contact-info')
  async getContactCompanyInfo(@Param('id') id: string) {
    return this.usersContactCompanyService.getContactCompanyInfo(id);
  }

  // ──────────────── DOCUMENTOS DO MOTORISTA ────────────────

  @UseGuards(JwtAuthGuard)
  @Post(':driverId/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/png', 'image/jpeg', 'image/jpg',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Tipo de arquivo não permitido. Use PNG, JPG, PDF ou DOCX.'), false);
        }
      },
    }),
  )
  async uploadDriverDocument(
    @GetUserId() companyId: string,
    @Param('driverId') driverId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('description') description?: string,
  ) {
    return this.usersContactCompanyService.uploadDriverDocument(
      companyId,
      driverId,
      file,
      description,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':driverId/documents')
  async listDriverDocuments(
    @GetUserId() companyId: string,
    @Param('driverId') driverId: string,
  ) {
    return this.usersContactCompanyService.listDriverDocuments(companyId, driverId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('documents/:documentId')
  async deleteDriverDocument(
    @GetUserId() companyId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.usersContactCompanyService.deleteDriverDocument(companyId, documentId);
  }
}
