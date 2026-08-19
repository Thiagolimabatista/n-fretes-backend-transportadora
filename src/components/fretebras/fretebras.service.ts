import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, In } from 'typeorm';
import { Client } from 'pg';
import { firstValueFrom } from 'rxjs';
import { UsersDrive } from '../../entities/users-drive.entity';
import {
  NFRETES_GROUP_ID_NORTE,
  NFRETES_GROUP_ID_CENTRO_OESTE,
  NFRETES_GROUP_ID_NORDESTE,
  NFRETES_GROUP_ID_SUDESTE,
  NFRETES_GROUP_ID_SUL,
} from './group';

export interface ZApiGroup {
  phone: string;
  name: string;
  participants: string[];
  admins: string[];
  imageUrl?: string;
}

export interface ZApiGroupsResponse {
  groups: ZApiGroup[];
}

export interface AddParticipantDto {
  groupPhone: string;
  phone: string[];
}

export interface ZApiAddParticipantResponse {
  value: boolean;
  message?: string;
}

export interface AddUsersToGroupsResponse {
  total: number;
  norte: { count: number; groupId: string };
  centroOeste: { count: number; groupId: string };
  nordeste: { count: number; groupId: string };
  sudeste: { count: number; groupId: string };
  sul: { count: number; groupId: string };
  errors: string[];
}

export interface SendTextMessageDto {
  phone: string;
  message: string;
}

export interface ZApiSendTextResponse {
  value: boolean;
  messageId?: string;
  message?: string;
}

@Injectable()
export class FretebrasService {
  private readonly logger = new Logger(FretebrasService.name);
  private readonly baseUrl =
    process.env.Z_API_BASE_URL ?? 'https://api.z-api.io';
  private readonly instanceId = process.env.Z_API_INSTANCE_ID ?? '';
  private readonly instanceToken = process.env.Z_API_INSTANCE_TOKEN ?? '';
  private readonly clientToken = process.env.Z_API_CLIENT_TOKEN ?? '';

  private ensureZApiConfigured(): void {
    if (!this.instanceId || !this.instanceToken || !this.clientToken) {
      throw new Error('Integração de mensagens temporariamente indisponível');
    }
  }

  private readonly BATCH_SIZE = 50;
  private readonly DELAY_BETWEEN_BATCHES = 2000;

  private readonly dddMap = {
    NORTE: ['63', '68', '69', '91', '92', '93', '94', '95', '96', '97'],
    CENTRO_OESTE: ['61', '62', '64', '65', '66', '67'],
    NORDESTE: [
      '71',
      '73',
      '74',
      '75',
      '77',
      '79',
      '81',
      '82',
      '83',
      '84',
      '85',
      '86',
      '87',
      '88',
      '89',
      '98',
      '99',
    ],
    SUDESTE: [
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
      '21',
      '22',
      '24',
      '27',
      '28',
      '31',
      '32',
      '33',
      '34',
      '35',
      '37',
      '38',
    ],
    SUL: [
      '41',
      '42',
      '43',
      '44',
      '45',
      '46',
      '47',
      '48',
      '49',
      '51',
      '53',
      '54',
      '55',
    ],
  };

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(UsersDrive)
    private readonly usersDriveRepository: Repository<UsersDrive>,
  ) {}

  // New: Fretebras DB client for cross-checks
  private fretebrasClient: Client;

  initFretebrasClient(client: Client) {
    this.fretebrasClient = client;
  }

  async getGroups(): Promise<ZApiGroupsResponse> {
    try {
      this.ensureZApiConfigured();
      const url = `${this.baseUrl}/instances/${this.instanceId}/token/${this.instanceToken}/groups?page=1&pageSize=10`;

      this.logger.log(`Buscando grupos do WhatsApp`);

      const response = await firstValueFrom(
        this.httpService.get<ZApiGroupsResponse>(url, {
          headers: {
            'Content-Type': 'application/json',
            'client-token': this.clientToken,
          },
        }),
      );

      this.logger.log(
        `${response.data.groups?.length || 0} grupos encontrados`,
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        'Erro ao buscar grupos:',
        error.response?.data || error.message,
      );
      throw new Error(`Falha ao buscar grupos: ${error.message}`);
    }
  }

  async addParticipantToGroup(
    groupPhone: string,
    phones: string[],
  ): Promise<ZApiAddParticipantResponse> {
    try {
      this.ensureZApiConfigured();
      const url = `${this.baseUrl}/instances/${this.instanceId}/token/${this.instanceToken}/add-participant`;

      this.logger.log(
        `Adicionando ${phones.length} participante(s) ao grupo ${groupPhone}`,
      );

      const payload = {
        autoInvite: true,
        groupId: groupPhone,
        phones: phones,
      };

      this.logger.debug(`Payload: ${JSON.stringify(payload)}`);

      const response = await firstValueFrom(
        this.httpService.post<ZApiAddParticipantResponse>(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'client-token': this.clientToken,
          },
        }),
      );

      this.logger.log(
        `Participantes adicionados com sucesso ao grupo ${groupPhone}`,
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Erro ao adicionar participantes ao grupo ${groupPhone}:`,
        JSON.stringify(error.response?.data) || error.message,
      );
      throw new Error(
        `Falha ao adicionar participantes: ${JSON.stringify(error.response?.data) || error.message}`,
      );
    }
  }

  async getGroupInfo(groupPhone: string): Promise<ZApiGroup | null> {
    try {
      const groups = await this.getGroups();
      return groups.groups.find((group) => group.phone === groupPhone) || null;
    } catch (error) {
      this.logger.error(
        `Erro ao buscar informações do grupo ${groupPhone}:`,
        error.message,
      );
      throw error;
    }
  }

  async sendTextMessage(
    phone: string,
    message: string,
  ): Promise<ZApiSendTextResponse> {
    try {
      this.ensureZApiConfigured();
      const url = `${this.baseUrl}/instances/${this.instanceId}/token/${this.instanceToken}/send-text`;

      this.logger.log(`Enviando mensagem para ${phone}`);

      const payload = {
        phone,
        message,
      };

      const response = await firstValueFrom(
        this.httpService.post<ZApiSendTextResponse>(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'client-token': this.clientToken,
          },
        }),
      );

      this.logger.log(`Mensagem enviada com sucesso para ${phone}`);

      return response.data;
    } catch (error) {
      this.logger.error(
        `Erro ao enviar mensagem para ${phone}:`,
        JSON.stringify(error.response?.data) || error.message,
      );
      throw new Error(
        `Falha ao enviar mensagem: ${JSON.stringify(error.response?.data) || error.message}`,
      );
    }
  }

  getRegionFromFreight(freightData: any): string | null {
    // Primeiro tenta pela UF do estado de origem
    if (freightData.origem_estado) {
      const region = this.getRegionByState(freightData.origem_estado);
      if (region) {
        return region;
      }
    }

    // Se não encontrou, tenta extrair DDD de telefone se disponível
    if (freightData.telefone_origem) {
      const ddd = this.extractDDD(freightData.telefone_origem);
      if (ddd) {
        return this.getRegionByDDD(ddd);
      }
    }

    return null;
  }

  private getRegionByState(state: string): string | null {
    if (!state) return null;

    const stateUpper = state.toUpperCase();

    const stateMap = {
      NORTE: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
      CENTRO_OESTE: ['DF', 'GO', 'MT', 'MS'],
      NORDESTE: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
      SUDESTE: ['ES', 'MG', 'RJ', 'SP'],
      SUL: ['PR', 'RS', 'SC'],
    };

    for (const [region, states] of Object.entries(stateMap)) {
      if (states.includes(stateUpper)) {
        return region;
      }
    }

    return null;
  }

  private extractDDD(phoneNumber: string): string | null {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length >= 10) {
      return cleaned.substring(0, 2);
    }
    return null;
  }

  private formatPhoneNumber(phoneNumber: string): string {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.startsWith('55')) {
      return cleaned;
    }
    return `55${cleaned}`;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private getRegionByDDD(ddd: string): string | null {
    if (!ddd) return null;
    for (const [region, ddds] of Object.entries(this.dddMap)) {
      if (ddds.includes(ddd)) {
        return region;
      }
    }
    return null;
  }

  private getGroupIdByRegion(region: string): string {
    const groupMap = {
      NORTE: NFRETES_GROUP_ID_NORTE,
      CENTRO_OESTE: NFRETES_GROUP_ID_CENTRO_OESTE,
      NORDESTE: NFRETES_GROUP_ID_NORDESTE,
      SUDESTE: NFRETES_GROUP_ID_SUDESTE,
      SUL: NFRETES_GROUP_ID_SUL,
    };
    return groupMap[region];
  }

  async addUsersToGroupsByRegion(): Promise<AddUsersToGroupsResponse> {
    const errors: string[] = [];
    const regionUsers = {
      NORTE: [],
      CENTRO_OESTE: [],
      NORDESTE: [],
      SUDESTE: [],
      SUL: [],
    };

    try {
      const users = await this.usersDriveRepository.find({
        where: { phoneNumber: Not(IsNull()) },
        select: ['id', 'name', 'phoneNumber'],
      });

      this.logger.log(`Total de usuários encontrados: ${users.length}`);

      for (const user of users) {
        if (!user.phoneNumber) continue;

        const ddd = this.extractDDD(user.phoneNumber);
        if (!ddd) {
          errors.push(
            `Usuário ${user.name} (${user.id}): Não foi possível extrair DDD do telefone "${user.phoneNumber}"`,
          );
          continue;
        }

        const region = this.getRegionByDDD(ddd);
        if (!region) {
          errors.push(
            `Usuário ${user.name} (${user.id}): DDD "${ddd}" não mapeado`,
          );
          continue;
        }

        const formattedPhone = this.formatPhoneNumber(user.phoneNumber);
        regionUsers[region].push(formattedPhone);
      }

      const results = {
        norte: { count: 0, groupId: NFRETES_GROUP_ID_NORTE },
        centroOeste: { count: 0, groupId: NFRETES_GROUP_ID_CENTRO_OESTE },
        nordeste: { count: 0, groupId: NFRETES_GROUP_ID_NORDESTE },
        sudeste: { count: 0, groupId: NFRETES_GROUP_ID_SUDESTE },
        sul: { count: 0, groupId: NFRETES_GROUP_ID_SUL },
      };

      for (const [region, phones] of Object.entries(regionUsers)) {
        if (phones.length === 0) continue;

        const groupId = this.getGroupIdByRegion(region);
        const batches = this.chunkArray(phones, this.BATCH_SIZE);

        this.logger.log(
          `Região ${region}: ${phones.length} usuários divididos em ${batches.length} lotes`,
        );

        let successCount = 0;
        let batchNumber = 0;

        for (const batch of batches) {
          batchNumber++;
          try {
            this.logger.log(
              `Processando lote ${batchNumber}/${batches.length} da região ${region} (${batch.length} números)`,
            );
            await this.addParticipantToGroup(groupId, batch);
            successCount += batch.length;
            this.logger.log(
              `Lote ${batchNumber}/${batches.length} da região ${region} adicionado com sucesso`,
            );

            if (batchNumber < batches.length) {
              await this.delay(this.DELAY_BETWEEN_BATCHES);
            }
          } catch (error) {
            errors.push(
              `Erro no lote ${batchNumber} da região ${region}: ${error.message}`,
            );
            this.logger.error(
              `Erro no lote ${batchNumber} da região ${region}:`,
              error.message,
            );
          }
        }

        const regionKey =
          region === 'CENTRO_OESTE' ? 'centroOeste' : region.toLowerCase();
        results[regionKey].count = successCount;
        this.logger.log(
          `Região ${region}: ${successCount}/${phones.length} usuários adicionados com sucesso`,
        );
      }

      return {
        total: users.length,
        ...results,
        errors,
      };
    } catch (error) {
      this.logger.error('Erro ao processar usuários:', error.message);
      throw new Error(
        `Falha ao adicionar usuários aos grupos: ${error.message}`,
      );
    }
  }

  // Fetch all transportadora ids from Fretebras DB and compare with local companies
  async getMissingTransportadoras(companyRepository: Repository<any>): Promise<{
    totalFretebras: number;
    missingCount: number;
    missingIds: string[];
  }> {
    if (!this.fretebrasClient) {
      // lazy init using env vars if not provided
      this.fretebrasClient = new Client({
        host: process.env.DATABASE_HOST_FRETEBRAS,
        port: Number(process.env.DATABASE_PORT_FRETEBRAS) || 15432,
        database: process.env.DATABASE_NAME_FRETEBRAS,
        user: process.env.DATABASE_USERNAME_FRETEBRAS,
        password: process.env.DATABASE_PASSWORD_FRETEBRAS,
      });
      try {
        // best-effort connect
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.fretebrasClient.connect();
      } catch (e) {
        this.logger.error('Erro ao conectar Fretebras DB:', e.message || e);
      }
    }

    const res = await this.fretebrasClient.query(
      'SELECT id FROM public.transportadoras',
    );
    const fretebrasIds: string[] = (res.rows || []).map((r) => String(r.id));

    const total = fretebrasIds.length;

    if (total === 0) {
      return { totalFretebras: 0, missingCount: 0, missingIds: [] };
    }

    // fetch existing local company ids
    const batchSize = 1000;
    const existingIdsSet = new Set<string>();

    for (let i = 0; i < fretebrasIds.length; i += batchSize) {
      const batch = fretebrasIds.slice(i, i + batchSize);
      const existing = await companyRepository.find({
        where: { id: In(batch) },
        select: ['id'],
      });
      for (const e of existing) existingIdsSet.add(String(e.id));
    }

    const missingIds = fretebrasIds.filter((id) => !existingIdsSet.has(id));

    return {
      totalFretebras: total,
      missingCount: missingIds.length,
      missingIds,
    };
  }

  // For each missing transportadora id, fetch full row from Fretebras DB and create company + contacts
  async syncMissingTransportadoras(
    companyRepository: Repository<any>,
    contactRepository: Repository<any>,
    limit?: number,
  ): Promise<{
    processed: number;
    createdCompanies: string[];
    errors: { id: string; error: string }[];
  }> {
    const result = {
      processed: 0,
      createdCompanies: [] as string[],
      errors: [] as { id: string; error: string }[],
    };

    const missingInfo = await this.getMissingTransportadoras(companyRepository);
    const idsToProcess = limit
      ? missingInfo.missingIds.slice(0, limit)
      : missingInfo.missingIds;

    if (!this.fretebrasClient) {
      this.fretebrasClient = new Client({
        host: process.env.DATABASE_HOST_FRETEBRAS,
        port: Number(process.env.DATABASE_PORT_FRETEBRAS) || 15432,
        database: process.env.DATABASE_NAME_FRETEBRAS,
        user: process.env.DATABASE_USERNAME_FRETEBRAS,
        password: process.env.DATABASE_PASSWORD_FRETEBRAS,
      });
      try {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.fretebrasClient.connect();
      } catch (e) {
        this.logger.error('Erro ao conectar Fretebras DB:', e.message || e);
      }
    }

    for (const id of idsToProcess) {
      result.processed++;
      try {
        const res = await this.fretebrasClient.query(
          'SELECT * FROM public.transportadoras WHERE id = $1 LIMIT 1',
          [id],
        );

        if (!res.rows || res.rows.length === 0) {
          result.errors.push({ id, error: 'Não encontrada no Fretebras DB' });
          continue;
        }

        const t = res.rows[0];

        const companyData: any = {
          id: t.id,
          name: t.nome || t.razao_social || null,
          nameFantasy: t.razao_social || t.nome || null,
          phoneNumber: null,
          phoneNumberJson: t.celular_json || t.telefone_json || null,
          transportCategory: 'Transportadora',
          isActive: true,
          photoUrl: t.logo_url || null,
          city: null,
          state: null,
        };

        if (t.bairro_cidade_estado) {
          const parts = (t.bairro_cidade_estado || '').split(',');
          if (parts.length >= 2) {
            companyData.city = parts[0].trim();
            const statePart = parts[1].split('-')[0].trim();
            companyData.state = statePart;
          }
        }

        const createdCompany = await companyRepository.save(companyData);
        result.createdCompanies.push(String(createdCompany.id));

        // create contacts from celular_json
        try {
          const celularJson =
            t.celular_json || t.telefone_json || t.telefone || null;
          let contatos = null;
          if (celularJson) {
            contatos =
              typeof celularJson === 'string'
                ? JSON.parse(celularJson)
                : celularJson;
          }

          if (Array.isArray(contatos) && contatos.length > 0) {
            for (const c of contatos) {
              const phone = Object.keys(c)[0];
              const name = c[phone] || null;

              const exists = await contactRepository.findOne({
                where: { companyId: createdCompany.id, phoneNumber: phone },
              });

              if (!exists) {
                await contactRepository.save({
                  name,
                  phoneNumber: phone,
                  companyId: createdCompany.id,
                });
              }
            }
          }
        } catch (err) {
          this.logger.error('Erro ao criar contatos:', err.message || err);
        }
      } catch (err) {
        result.errors.push({ id, error: err.message || String(err) });
      }
    }

    return result;
  }
}
