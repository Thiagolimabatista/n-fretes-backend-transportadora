import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateContactCompanyDto,
  UpdateContactCompanyDto,
} from './dto/contact-company.dto';
import { ContactCompanyResponseDto } from './dto/response-contact-company.dto';
import { ContactCompanyService } from './contact-company.service';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { ParamsContactCompany } from './interfaces/IContact';
import { GetUserId } from 'src/decorators/get-user-decorator';
import { ContactCompany } from '@entities/contact-company.entity';

@Controller('contact-company')
export class ContactCompanyController {
  constructor(private readonly contactCompanyService: ContactCompanyService) {}

  @UseGuards(JwtAuthGuard)
  @Post('/create')
  async createContactCompany(
    @Body() createContactCompany: CreateContactCompanyDto,
    @GetUserId() userId: string,
  ): Promise<ContactCompanyResponseDto> {
    return this.contactCompanyService.createContactCompany(
      createContactCompany,
      userId,
    );
  }

  /********************************************************************************** */
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async updateContactCompany(
    @Param('id') id: string,
    @Body() updateContactCompany: UpdateContactCompanyDto,
    @GetUserId() companyId: string,
  ) {
    const result = await this.contactCompanyService.updateContactCompany(
      id,
      updateContactCompany,
      companyId,
    );
    return result;
  }

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Get('contact/:id')
  async getContactId(
    @Param('id') id: string,
    @GetUserId() companyId: string,
  ) {
    const result = await this.contactCompanyService.getContactId(id, companyId);
    return result;
  }

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Get('company/contact')
  async getCompanyIdParams(
    @Query() params: ParamsContactCompany,
    @GetUserId() companyId: string,
  ) {
    const result = await this.contactCompanyService.getCompanyId(params, companyId);
    return result;
  }

  /********************************************************************************** */
  @UseGuards(JwtAuthGuard)
  @Delete(':id/soft-delete')
  async softDelete(
    @Param('id') id: string,
    @GetUserId() companyId: string,
  ): Promise<string> {
    return this.contactCompanyService.softDeleteUsersContactCompany(id, companyId);
  }

  /********************************************************************************** */
  @Get(':id')
  async getContactCompanyById(
    @Param('id') id: string,
  ): Promise<ContactCompany> {
    return this.contactCompanyService.getContactCompanyById(id);
  }

  /********************************************************************************** */
  @UseGuards(JwtAuthGuard)
  @Get(':id/freights')
  async getActiveFreightsByContact(
    @Param('id') contactId: string,
    @GetUserId() companyId: string,
  ) {
    return this.contactCompanyService.getActiveFreightsByContact(
      contactId,
      companyId,
    );
  }
}
