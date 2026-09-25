import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ContactGroupService } from './contact-group.service';
import {
  CreateContactGroupDto,
  UpdateContactGroupDto,
  AddContactsToGroupDto,
  RemoveContactsFromGroupDto,
  MoveContactsToGroupDto,
} from './dto/contact-group.dto';
import {
  ContactGroupResponseDto,
  ContactGroupUpdateResponseDto,
  GetContactGroupsResponseDto,
} from './dto/response-contact-group.dto';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { GetUserId } from 'src/decorators/get-user-decorator';

@Controller('contact-group')
@UseGuards(JwtAuthGuard)
export class ContactGroupController {
  constructor(private readonly contactGroupService: ContactGroupService) {}

  @Post()
  async createGroup(
    @Body() dto: CreateContactGroupDto,
    @GetUserId() companyId: string,
  ): Promise<ContactGroupResponseDto> {
    return this.contactGroupService.createGroup(dto, companyId);
  }

  @Get()
  async getGroups(
    @GetUserId() companyId: string,
  ): Promise<GetContactGroupsResponseDto> {
    return this.contactGroupService.getGroupsByCompany(companyId);
  }

  @Get(':id')
  async getGroupById(
    @Param('id') groupId: string,
    @GetUserId() companyId: string,
  ): Promise<ContactGroupResponseDto> {
    return this.contactGroupService.getGroupById(groupId, companyId);
  }

  @Patch(':id')
  async updateGroup(
    @Param('id') groupId: string,
    @Body() dto: UpdateContactGroupDto,
    @GetUserId() companyId: string,
  ): Promise<ContactGroupUpdateResponseDto> {
    return this.contactGroupService.updateGroup(groupId, dto, companyId);
  }

  @Delete(':id')
  async deleteGroup(
    @Param('id') groupId: string,
    @GetUserId() companyId: string,
  ): Promise<ContactGroupUpdateResponseDto> {
    return this.contactGroupService.deleteGroup(groupId, companyId);
  }

  @Post(':id/contacts')
  async addContacts(
    @Param('id') groupId: string,
    @Body() dto: AddContactsToGroupDto,
    @GetUserId() companyId: string,
  ): Promise<ContactGroupUpdateResponseDto> {
    return this.contactGroupService.addContactsToGroup(groupId, dto, companyId);
  }

  @Delete(':id/contacts')
  async removeContacts(
    @Param('id') groupId: string,
    @Body() dto: RemoveContactsFromGroupDto,
    @GetUserId() companyId: string,
  ): Promise<ContactGroupUpdateResponseDto> {
    return this.contactGroupService.removeContactsFromGroup(
      groupId,
      dto,
      companyId,
    );
  }

  @Post(':id/move-contacts')
  async moveContacts(
    @Param('id') sourceGroupId: string,
    @Body() dto: MoveContactsToGroupDto,
    @GetUserId() companyId: string,
  ): Promise<ContactGroupUpdateResponseDto> {
    return this.contactGroupService.moveContactsToGroup(
      sourceGroupId,
      dto,
      companyId,
    );
  }
}
