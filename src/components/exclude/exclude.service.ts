import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Exclude } from 'src/entities/exclude.entity';
import { CreateExcludeDto } from './dto/create-exclude.dto';
import { Company } from 'src/entities/company.entity';
import { UsersDrive } from 'src/entities/users-drive.entity';

@Injectable()
export class ExcludeService {
  constructor(
    @InjectRepository(Exclude)
    private readonly excludeRepository: Repository<Exclude>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(UsersDrive)
    private readonly usersDriveRepository: Repository<UsersDrive>,
  ) {}

  async createExcludeRequest(
    dto: CreateExcludeDto,
  ): Promise<{ success: boolean; message: string }> {
    if (!dto.cpf && !dto.cnpj) {
      throw new BadRequestException('CPF ou CNPJ deve ser informado');
    }

    if (!dto.reason) {
      throw new BadRequestException('Motivo é obrigatório');
    }

    let userExists = false;

    if (dto.cpf) {
      const userByCpf = await this.usersDriveRepository.findOne({
        where: { cpf: dto.cpf },
      });
      const companyByCpf = await this.companyRepository.findOne({
        where: { cpf: dto.cpf },
      });
      userExists = !!(userByCpf || companyByCpf);
    }

    if (dto.cnpj && !userExists) {
      const companyByCnpj = await this.companyRepository.findOne({
        where: { cnpj: dto.cnpj },
      });
      userExists = !!companyByCnpj;
    }

    if (!userExists) {
      throw new NotFoundException(
        'Não localizamos seu cadastro em nossas bases',
      );
    }

    const excludeRequest = this.excludeRepository.create({
      ...dto,
      jaExcluido: false,
    });

    await this.excludeRepository.save(excludeRequest);

    return {
      success: true,
      message: 'Solicitação de exclusão recebida com sucesso',
    };
  }
}
