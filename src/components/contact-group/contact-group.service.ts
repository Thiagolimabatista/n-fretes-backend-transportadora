import { Injectable, HttpException, HttpStatus, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ContactGroup } from '@entities/contact-group.entity';
import { CompanyUsersContacts } from '@entities/company-users-contacts.entity';
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

@Injectable()
export class ContactGroupService {
  constructor(
    @InjectRepository(ContactGroup)
    private contactGroupRepository: Repository<ContactGroup>,
    @InjectRepository(CompanyUsersContacts)
    private companyUsersContactsRepository: Repository<CompanyUsersContacts>,
  ) {}

  private get db() {
    return this.contactGroupRepository.manager;
  }

  /**
   * Grupos ativos da empresa com os motoristas ativos de cada um. Devolve só
   * os ids dos contatos: os dados do motorista vêm da lista da rede.
   */
  private async groupsWithMembers(companyId: string, groupId?: string): Promise<ContactGroupResponseDto[]> {
    const values: unknown[] = [companyId];
    if (groupId) values.push(groupId);
    const rows = await this.db.query(
      `SELECT g.id, g.name, g."companyId", g."isActive", g."createdAt", g."updatedAt",
              coalesce(array_agg(c.id ORDER BY c."createdAt") FILTER (WHERE c.id IS NOT NULL), '{}') AS "contactIds"
         FROM "contact-group" g
         LEFT JOIN "contact-group-members" m ON m."groupId" = g.id
         LEFT JOIN "company-users-contacts" c
                ON c.id = m."contactId" AND c."companyId" = g."companyId" AND c."isActive" = true
        WHERE g."companyId" = $1 AND g."isActive" = true ${groupId ? 'AND g.id = $2' : ''}
        GROUP BY g.id
        ORDER BY g."createdAt" DESC`,
      values,
    );
    return rows.map((r: ContactGroupResponseDto) => ({ ...r, memberCount: r.contactIds.length }));
  }

  private async findActiveGroup(groupId: string, companyId: string, withContacts = false) {
    const group = await this.contactGroupRepository.findOne({
      where: { id: groupId, companyId, isActive: true },
      relations: withContacts ? ['contacts'] : [],
    });
    if (!group) throw new NotFoundException('Grupo não encontrado.');
    return group;
  }

  /** Contatos ativos da rede da empresa; recusa ids de fora dela. */
  private async activeContacts(contactIds: string[], companyId: string) {
    const ids = [...new Set(contactIds ?? [])];
    if (!ids.length) return [];
    const contacts = await this.companyUsersContactsRepository.find({
      where: { id: In(ids), companyId, isActive: true },
    });
    if (contacts.length !== ids.length) {
      throw new BadRequestException('Alguns motoristas não foram encontrados na sua rede.');
    }
    return contacts;
  }

  /** Mantém o status dos erros esperados; o resto vira 500 com a mensagem de contexto. */
  private fail(error: unknown, message: string): never {
    if (error instanceof HttpException) throw error;
    throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  async createGroup(dto: CreateContactGroupDto, companyId: string): Promise<ContactGroupResponseDto> {
    try {
      const contacts = await this.activeContacts(dto.contactIds, companyId);
      const saved = await this.contactGroupRepository.save(
        this.contactGroupRepository.create({ name: dto.name, companyId, contacts }),
      );
      const [group] = await this.groupsWithMembers(companyId, saved.id);
      return group;
    } catch (error) {
      this.fail(error, 'Erro ao criar grupo');
    }
  }

  async updateGroup(
    groupId: string,
    dto: UpdateContactGroupDto,
    companyId: string,
  ): Promise<ContactGroupUpdateResponseDto> {
    try {
      await this.findActiveGroup(groupId, companyId);
      await this.contactGroupRepository.update({ id: groupId, companyId }, { name: dto.name });
      return { message: 'Grupo atualizado com sucesso' };
    } catch (error) {
      this.fail(error, 'Erro ao atualizar grupo');
    }
  }

  async deleteGroup(groupId: string, companyId: string): Promise<ContactGroupUpdateResponseDto> {
    try {
      await this.findActiveGroup(groupId, companyId);
      await this.contactGroupRepository.update({ id: groupId, companyId }, { isActive: false });
      return { message: 'Grupo excluído com sucesso' };
    } catch (error) {
      this.fail(error, 'Erro ao excluir grupo');
    }
  }

  async addContactsToGroup(
    groupId: string,
    dto: AddContactsToGroupDto,
    companyId: string,
  ): Promise<ContactGroupUpdateResponseDto> {
    try {
      await this.findActiveGroup(groupId, companyId);
      const contacts = await this.activeContacts(dto.contactIds, companyId);
      await this.db.query(
        `INSERT INTO "contact-group-members" ("groupId", "contactId")
         SELECT $1, unnest($2::varchar[])
         ON CONFLICT DO NOTHING`,
        [groupId, contacts.map((c) => c.id)],
      );
      return { message: 'Contatos adicionados ao grupo com sucesso' };
    } catch (error) {
      this.fail(error, 'Erro ao adicionar contatos ao grupo');
    }
  }

  async removeContactsFromGroup(
    groupId: string,
    dto: RemoveContactsFromGroupDto,
    companyId: string,
  ): Promise<ContactGroupUpdateResponseDto> {
    try {
      await this.findActiveGroup(groupId, companyId);
      await this.db.query(
        `DELETE FROM "contact-group-members" WHERE "groupId" = $1 AND "contactId" = ANY($2::varchar[])`,
        [groupId, dto.contactIds ?? []],
      );
      return { message: 'Contatos removidos do grupo com sucesso' };
    } catch (error) {
      this.fail(error, 'Erro ao remover contatos do grupo');
    }
  }

  async moveContactsToGroup(
    sourceGroupId: string,
    dto: MoveContactsToGroupDto,
    companyId: string,
  ): Promise<ContactGroupUpdateResponseDto> {
    try {
      const [source] = await Promise.all([
        this.findActiveGroup(sourceGroupId, companyId, true),
        this.findActiveGroup(dto.targetGroupId, companyId),
      ]);
      const ids = [...new Set(dto.contactIds ?? [])];
      const inSource = new Set(source.contacts.map((c) => c.id));
      if (!ids.length || ids.some((id) => !inSource.has(id))) {
        throw new BadRequestException('Alguns motoristas não estão no grupo de origem.');
      }
      await this.activeContacts(ids, companyId);

      await this.db.transaction(async (manager) => {
        await manager.query(
          `DELETE FROM "contact-group-members" WHERE "groupId" = $1 AND "contactId" = ANY($2::varchar[])`,
          [sourceGroupId, ids],
        );
        await manager.query(
          `INSERT INTO "contact-group-members" ("groupId", "contactId")
           SELECT $1, unnest($2::varchar[])
           ON CONFLICT DO NOTHING`,
          [dto.targetGroupId, ids],
        );
      });
      return { message: 'Contatos movidos para o novo grupo com sucesso' };
    } catch (error) {
      this.fail(error, 'Erro ao mover contatos entre grupos');
    }
  }

  async getGroupsByCompany(companyId: string): Promise<GetContactGroupsResponseDto> {
    try {
      const data = await this.groupsWithMembers(companyId);
      return { data, count: data.length };
    } catch (error) {
      this.fail(error, 'Erro ao buscar grupos');
    }
  }

  async getGroupById(groupId: string, companyId: string): Promise<ContactGroupResponseDto> {
    try {
      const [group] = await this.groupsWithMembers(companyId, groupId);
      if (!group) throw new NotFoundException('Grupo não encontrado.');
      return group;
    } catch (error) {
      this.fail(error, 'Erro ao buscar grupo');
    }
  }
}
