import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Company } from '@entities/company.entity';
import { ContactCompany } from '@entities/contact-company.entity';
import {
  DEFAULT_PREFERENCES,
  MENU_VIEWS,
  NAVIGATION_LAYOUTS,
  UpdatePreferencesDto,
  UserPreferences,
} from './dto/preferences.dto';

/** Quem está logado: a empresa (CNPJ) ou um membro da equipe (e-mail). */
export interface PreferencesPrincipal {
  companyId: string;
  contactId?: string;
}

/** Só devolve chaves conhecidas e valores válidos (o JSON pode ter lixo). */
function sanitize(raw: unknown): UserPreferences {
  const stored = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    navigationLayout: NAVIGATION_LAYOUTS.includes(
      stored.navigationLayout as never,
    )
      ? (stored.navigationLayout as UserPreferences['navigationLayout'])
      : DEFAULT_PREFERENCES.navigationLayout,
    menuView: MENU_VIEWS.includes(stored.menuView as never)
      ? (stored.menuView as UserPreferences['menuView'])
      : DEFAULT_PREFERENCES.menuView,
    sidebarCollapsed:
      typeof stored.sidebarCollapsed === 'boolean'
        ? stored.sidebarCollapsed
        : DEFAULT_PREFERENCES.sidebarCollapsed,
  };
}

@Injectable()
export class PreferencesService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(ContactCompany)
    private readonly contactCompanyRepository: Repository<ContactCompany>,
  ) {}

  async get(principal: PreferencesPrincipal): Promise<UserPreferences> {
    return sanitize(await this.load(principal));
  }

  async update(
    principal: PreferencesPrincipal,
    dto: UpdatePreferencesDto,
  ): Promise<UserPreferences> {
    const current = sanitize(await this.load(principal));
    const next: UserPreferences = {
      ...current,
      ...Object.fromEntries(
        Object.entries(dto).filter(([, value]) => value !== undefined),
      ),
    };

    if (principal.contactId) {
      await this.contactCompanyRepository.update(
        { id: principal.contactId, companyId: principal.companyId },
        { preferences: next },
      );
    } else {
      await this.companyRepository.update(
        { id: principal.companyId },
        { preferences: next },
      );
    }
    return next;
  }

  private async load(principal: PreferencesPrincipal): Promise<unknown> {
    if (principal.contactId) {
      const contact = await this.contactCompanyRepository.findOne({
        where: { id: principal.contactId, companyId: principal.companyId },
        select: ['id', 'preferences'],
      });
      if (!contact) {
        throw new HttpException('Usuário não encontrado.', HttpStatus.NOT_FOUND);
      }
      return contact.preferences;
    }
    const company = await this.companyRepository.findOne({
      where: { id: principal.companyId },
      select: ['id', 'preferences'],
    });
    if (!company) {
      throw new HttpException('Empresa não encontrada.', HttpStatus.NOT_FOUND);
    }
    return company.preferences;
  }
}
