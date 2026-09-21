import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';

import { Company } from '@entities/company.entity';
import { Freight } from '@entities/freight.entity';
import { companyUpdateDto } from './dto/Company.dto';
import { AwsService } from '@components/aws/aws.service';
import { ConfigService } from '@nestjs/config';

/**
 * Canal Postgres (LISTEN/NOTIFY) escutado pelo backend do motorista, que
 * repassa a atualização ao app via Socket.IO para as listas não ficarem
 * com o nome/logo antigos da transportadora.
 */
const COMPANY_UPDATED_CHANNEL = 'company_updated';

/** Campos exibidos no app do motorista: mudar qualquer um deles gera o evento. */
const PUBLIC_FIELDS = ['nameFantasy', 'photoUrl', 'city', 'state'] as const;

const EDITABLE_FIELDS = [
  'nameFantasy',
  'phoneNumber',
  'state',
  'city',
  'street',
  'zipcode',
] as const;

export interface CompanyUpdateResponse {
  message: string;
  company: Pick<
    Company,
    | 'id'
    | 'name'
    | 'nameFantasy'
    | 'photoUrl'
    | 'userPhotoURL'
    | 'city'
    | 'state'
    | 'street'
    | 'zipcode'
    | 'phoneNumber'
  >;
}

/** Contato exibido no perfil público: só nome e telefone. */
export interface CompanyProfileContact {
  name: string;
  phoneNumber: string;
}

/** Perfil de uma transportadora visto por outra (busca de fretes). */
export interface CompanyPublicProfile {
  id: string;
  name: string;
  photoUrl: string | null;
  city: string | null;
  state: string | null;
  phoneNumber: string | null;
  responsibleName: string | null;
  createdAt: Date;
  activeFreights: number;
  publishedFreights: number;
  contacts: CompanyProfileContact[];
}

export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(Freight)
    private freightRepository: Repository<Freight>,
    private readonly awsService: AwsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Perfil público da transportadora: contagem real de fretes (ativos e
   * publicados, sem os excluídos) e todos os contatos responsáveis pelos
   * fretes dela, para quem busca frete conseguir falar com a empresa.
   * Da tabela de contatos só saem nome e telefone (ela guarda e-mail, CPF e
   * senha dos usuários da equipe).
   */
  async getPublicProfile(companyId: string): Promise<CompanyPublicProfile> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: [
        'id',
        'name',
        'nameFantasy',
        'photoUrl',
        'city',
        'state',
        'phoneNumber',
        'phoneNumberJson',
        'createdAt',
      ],
    });

    if (!company) {
      throw new HttpException(
        'Transportadora não encontrada.',
        HttpStatus.NOT_FOUND,
      );
    }

    const counts = await this.freightRepository
      .createQueryBuilder('f')
      .select('COUNT(*) FILTER (WHERE f."isActive" = true)', 'active')
      .addSelect('COUNT(*)', 'published')
      .where('f."companyId" = :companyId', { companyId })
      .andWhere('f."isExclude" = false')
      .andWhere('f."isPublic" = true')
      .getRawOne<{ active: string; published: string }>();

    const contactRows: Array<{ name: string | null; phoneNumber: string | null }> =
      await this.freightRepository.query(
        `SELECT cc.name, cc."phoneNumber"
           FROM "contact-company" cc
          WHERE cc."companyId" = $1
            AND cc."isActive" = true
            AND cc.id IN (
              SELECT f."contactCompanyId"
                FROM freight f
               WHERE f."companyId" = $1
                 AND f."isExclude" = false
                 AND f."contactCompanyId" IS NOT NULL
              UNION
              SELECT btrim(unnest(string_to_array(f."contactCompanyIds", ',')))
                FROM freight f
               WHERE f."companyId" = $1
                 AND f."isExclude" = false
                 AND COALESCE(f."contactCompanyIds", '') <> ''
            )
          ORDER BY cc.name`,
        [companyId],
      );

    const companyPhone =
      company.phoneNumberJson?.number || company.phoneNumber || null;
    const responsibleName = company.phoneNumberJson?.contact?.trim() || null;

    const seen = new Set<string>();
    const contacts: CompanyProfileContact[] = [];
    const addContact = (name: string | null, phone: string | null) => {
      const digits = (phone ?? '').replace(/\D/g, '');
      if (!digits || seen.has(digits.slice(-11))) return;
      seen.add(digits.slice(-11));
      contacts.push({ name: name?.trim() || '', phoneNumber: phone ?? '' });
    };
    addContact(responsibleName, companyPhone);
    for (const row of contactRows) addContact(row.name, row.phoneNumber);

    return {
      id: company.id,
      name: company.nameFantasy?.trim() || company.name,
      photoUrl: company.photoUrl ?? null,
      city: company.city ?? null,
      state: company.state ?? null,
      phoneNumber: companyPhone,
      responsibleName,
      createdAt: company.createdAt,
      activeFreights: Number(counts?.active ?? 0),
      publishedFreights: Number(counts?.published ?? 0),
      contacts,
    };
  }

  async updateUserIdCompany(
    userId: string,
    updateCompany: companyUpdateDto,
  ): Promise<CompanyUpdateResponse> {
    const company = await this.companyRepository.findOne({
      where: { id: userId },
    });

    if (!company) {
      throw new HttpException('Empresa não encontrada', HttpStatus.NOT_FOUND);
    }

    try {
      let photoUrl = company.photoUrl;
      let userPhotoURL = company.userPhotoURL;

      if (updateCompany.userPhotoURL) {
        const bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME');
        const key = `user-avatars/${company.nameFantasy}-user-${userId}.jpg`;

        userPhotoURL = await this.awsService.uploadAvatar(
          bucketName,
          key,
          updateCompany.userPhotoURL,
        );
      }
      if (updateCompany.photoUrl) {
        const bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME');
        const key = `avatars/${company.nameFantasy}-${userId}.jpg`;

        photoUrl = await this.awsService.uploadAvatar(
          bucketName,
          key,
          updateCompany.photoUrl,
        );
      }

      const changes: Partial<Company> = { photoUrl, userPhotoURL };
      for (const field of EDITABLE_FIELDS) {
        const value = updateCompany[field];
        if (value !== undefined) {
          changes[field] = value;
        }
      }

      await this.companyRepository.update({ id: company.id }, changes);

      const updated: Company = { ...company, ...changes };
      const publicChanged = PUBLIC_FIELDS.some(
        (field) => (updated[field] ?? null) !== (company[field] ?? null),
      );
      if (publicChanged) {
        await this.notifyCompanyUpdated(updated);
      }

      return {
        message: 'Empresa atualizada com sucesso',
        company: {
          id: updated.id,
          name: updated.name,
          nameFantasy: updated.nameFantasy,
          photoUrl: updated.photoUrl,
          userPhotoURL: updated.userPhotoURL,
          city: updated.city,
          state: updated.state,
          street: updated.street,
          zipcode: updated.zipcode,
          phoneNumber: updated.phoneNumber,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Não foi possível atualizar a empresa. Tente novamente.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Publica a alteração no canal compartilhado do Postgres. Falhar aqui não
   * desfaz a atualização: o app recarrega os dados no próximo refresh.
   */
  private async notifyCompanyUpdated(company: Company): Promise<void> {
    const payload = {
      companyId: company.id,
      name: company.name,
      nameFantasy: company.nameFantasy,
      photoUrl: company.photoUrl,
      city: company.city,
      state: company.state,
      updatedAt: new Date().toISOString(),
    };
    try {
      await this.companyRepository.query('SELECT pg_notify($1, $2)', [
        COMPANY_UPDATED_CHANNEL,
        JSON.stringify(payload),
      ]);
    } catch (error) {
      this.logger.warn(
        `Falha ao publicar ${COMPANY_UPDATED_CHANNEL} para ${company.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async checkIsSucess(userId: string): Promise<{ isSucess: boolean }> {
    try {
      const company = await this.companyRepository.findOne({
        where: { id: userId },
        select: ['isSucess'],
      });

      if (!company) {
        throw new HttpException('Empresa não encontrada', HttpStatus.NOT_FOUND);
      }

      return { isSucess: company.isSucess };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao verificar status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateIsSucess(userId: string): Promise<{ message: string }> {
    try {
      const company = await this.companyRepository.findOne({
        where: { id: userId },
      });

      if (!company) {
        throw new HttpException('Empresa não encontrada', HttpStatus.NOT_FOUND);
      }

      await this.companyRepository.update({ id: userId }, { isSucess: true });

      return {
        message: 'Status atualizado com sucesso',
      };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao atualizar status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Marca o convite de primeiro frete como concluído/dispensado.
   * Idempotente: preserva a primeira data registrada.
   */
  async completeOnboarding(
    userId: string,
  ): Promise<{ onboardingCompletedAt: Date }> {
    const company = await this.companyRepository.findOne({
      where: { id: userId },
      select: ['id', 'onboardingCompletedAt'],
    });

    if (!company) {
      throw new HttpException('Empresa não encontrada', HttpStatus.NOT_FOUND);
    }

    if (company.onboardingCompletedAt) {
      return { onboardingCompletedAt: company.onboardingCompletedAt };
    }

    const onboardingCompletedAt = new Date();
    await this.companyRepository.update(
      { id: userId },
      { onboardingCompletedAt },
    );
    return { onboardingCompletedAt };
  }
}
