import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/entities/company.entity';

export interface ReceitaCnpjData {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  dataAbertura: string;
  naturezaJuridica: string;
  porte: string;
  atividadePrincipal?: { code: string; text: string };
  endereco: {
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
  };
  telefone: string;
  email: string;
  capitalSocial: string;
  socios: { nome: string; qualificacao: string }[];
}

/**
 * A ReceitaWS gratuita aceita poucas consultas por minuto. O cadastro consulta
 * o mesmo CNPJ duas vezes (validação do campo + criação da conta), então o
 * resultado fica em cache por um tempo curto.
 */
const RECEITA_CACHE_TTL_MS = 30 * 60 * 1000;
const RECEITA_CACHE_MAX_ENTRIES = 500;
const RECEITA_UNAVAILABLE_MESSAGE =
  'Não foi possível consultar o CNPJ na Receita Federal agora. Tente novamente em instantes.';

@Injectable()
export class CompanySearchService {
  private readonly receitaCache = new Map<
    string,
    { data: ReceitaCnpjData; expiresAt: number }
  >();

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async getCnpjData(cnpjInput: string): Promise<ReceitaCnpjData> {
    const cnpj = cnpjInput.replace(/\D/g, '');

    if (cnpj.length !== 14) {
      throw new HttpException('CNPJ deve ter 14 dígitos', HttpStatus.BAD_REQUEST);
    }

    const cached = this.receitaCache.get(cnpj);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      const response = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`);

      if (!response.ok) {
        throw new HttpException(
          RECEITA_UNAVAILABLE_MESSAGE,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const data = await response.json();

      if (data.status === 'ERROR') {
        throw new NotFoundException('CNPJ não encontrado na Receita Federal');
      }

      const result: ReceitaCnpjData = {
        cnpj: data.cnpj,
        razaoSocial: data.nome,
        nomeFantasia: data.fantasia,
        situacao: data.situacao,
        dataAbertura: data.abertura,
        naturezaJuridica: data.natureza_juridica,
        porte: data.porte,
        atividadePrincipal: data.atividade_principal?.[0],
        endereco: {
          logradouro: data.logradouro,
          numero: data.numero,
          complemento: data.complemento,
          bairro: data.bairro,
          municipio: data.municipio,
          uf: data.uf,
          cep: data.cep,
        },
        telefone: data.telefone,
        email: data.email,
        capitalSocial: data.capital_social,
        socios:
          data.qsa?.map((socio) => ({
            nome: socio.nome,
            qualificacao: socio.qual,
          })) || [],
      };

      this.remember(cnpj, result);
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        RECEITA_UNAVAILABLE_MESSAGE,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private remember(cnpj: string, data: ReceitaCnpjData) {
    if (this.receitaCache.size >= RECEITA_CACHE_MAX_ENTRIES) {
      const oldest = this.receitaCache.keys().next().value;
      if (oldest) this.receitaCache.delete(oldest);
    }
    this.receitaCache.set(cnpj, {
      data,
      expiresAt: Date.now() + RECEITA_CACHE_TTL_MS,
    });
  }
}
