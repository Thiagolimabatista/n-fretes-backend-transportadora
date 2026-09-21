import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import {
  DeepPartial,
  Like,
  MoreThan,
  Not,
  QueryFailedError,
  Repository,
} from 'typeorm';
import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AuthResponseDto,
  AuthResponseRegisterDto,
  CheckCnpjResponseDto,
} from './dto/Auth.dto';
import { LoginDto } from './dto/Login.dto';
import { ChangePasswordDto } from './dto/Password.dto';
import * as jwt from 'jsonwebtoken';
import { PhoneJson } from './interfaces/IAuth';
import { Company } from '@entities/company.entity';
import { RecoveryCode } from '@entities/recovery-codes.entity';
import { WhatsappService } from 'src/external/services/WHATSCODE/whatsapp-code.service';
import { ContactCompany } from '@entities/contact-company.entity';
import {
  ContactCompanyRegisterDto,
  ContactCompanyLoginDto,
} from './dto/ContactCompanyAuth.dto';
import {
  CompanySearchService,
  ReceitaCnpjData,
} from '@components/company-search/company-search.service';
import { RegisterDto } from './dto/Register.dto';
import {
  cnpjLookupVariants,
  formatCnpj,
  isValidCnpj,
} from 'src/utils/cnpj.util';
import {
  RecoveryCodeDto,
  ResetPasswordByRecoveryCodeDto,
} from './dto/Password.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(RecoveryCode)
    private recoverCodeRepository: Repository<RecoveryCode>,
    private configService: ConfigService,
    private whatsappService: WhatsappService,
    @InjectRepository(ContactCompany)
    private contactCompanyRepository: Repository<ContactCompany>,
    private companySearchService: CompanySearchService,
  ) {}

  async generateJwt(payload: any) {
    const secret = this.configService.get<string>('JWT_SECRET');
    return jwt.sign(payload, secret, { expiresIn: '30d' });
  }

  /**
   * Validação do CNPJ para o formulário de cadastro (antes de enviar):
   * dígitos, cadastro existente e situação na Receita Federal.
   */
  async checkCnpj(cnpj: string): Promise<CheckCnpjResponseDto> {
    if (!isValidCnpj(cnpj ?? '')) {
      return { exists: false, status: 'invalid', message: 'CNPJ inválido.' };
    }

    const existing = await this.companyRepository.findOne({
      where: cnpjLookupVariants(cnpj).map((variant) => ({ cnpj: variant })),
    });
    if (existing) {
      return {
        exists: true,
        status: 'registered',
        message: 'Já existe um cadastro com este CNPJ.',
      };
    }

    let receita: ReceitaCnpjData;
    try {
      receita = await this.companySearchService.getCnpjData(cnpj);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return {
          exists: false,
          status: 'not_found',
          message: 'CNPJ não encontrado na Receita Federal.',
        };
      }
      return { exists: false, status: 'unavailable' };
    }

    const ineligible = this.receitaIneligibility(receita);
    if (ineligible) {
      return { exists: false, ...ineligible };
    }

    return {
      exists: false,
      status: 'available',
      razaoSocial: receita.razaoSocial,
      nomeFantasia: receita.nomeFantasia,
    };
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseRegisterDto> {
    const {
      cnpj,
      password,
      name,
      nameFantasy,
      email,
      cpf,
      responsibleName,
      ...userData
    } = registerDto;

    if (!isValidCnpj(cnpj)) {
      throw new HttpException('CNPJ inválido', HttpStatus.BAD_REQUEST);
    }

    const existingCnpj = await this.companyRepository.findOne({
      where: cnpjLookupVariants(cnpj).map((variant) => ({ cnpj: variant })),
    });
    if (existingCnpj) {
      throw new HttpException('CNPJ já cadastrado', HttpStatus.BAD_REQUEST);
    }

    const existingEmail = await this.companyRepository.findOne({
      where: { email },
    });
    if (existingEmail) {
      throw new HttpException('E-mail já cadastrado', HttpStatus.BAD_REQUEST);
    }

    const findByCnpj = await this.companySearchService.getCnpjData(cnpj);

    const ineligible = this.receitaIneligibility(findByCnpj);
    if (ineligible) {
      throw new HttpException(ineligible.message, HttpStatus.BAD_REQUEST);
    }

    const newCompany = this.companyRepository.create({
      ...userData,
      isActive: true,
      isCompleted: true,
      isOn: true,
      cnpj: formatCnpj(cnpj),
      name: this.formatName(name),
      email,
      cpf: cpf || null,
      phoneNumberJson: responsibleName
        ? { number: userData.phoneNumber, contact: responsibleName }
        : undefined,
      nameFantasy: this.formatName(nameFantasy),
      zipcode: findByCnpj.endereco.cep,
      state: findByCnpj.endereco.uf,
      city: findByCnpj.endereco.municipio,
      street: findByCnpj.endereco.logradouro,
      district: findByCnpj.endereco.bairro,
      password: await bcrypt.hash(password, 10),
    } as DeepPartial<Company>);

    let savedCompany: Company;
    try {
      savedCompany = await this.companyRepository.save(newCompany);
    } catch (error) {
      if (error instanceof QueryFailedError && error.driverError?.code === '23505') {
        throw new HttpException(
          'CNPJ ou e-mail já cadastrado',
          HttpStatus.BAD_REQUEST,
        );
      }
      throw new HttpException(
        'Não foi possível concluir o cadastro',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const accessToken = await this.generateJwt({
      username: savedCompany.cnpj,
      sub: savedCompany.id,
    });

    return { message: 'Conta criada com sucesso', access_token: accessToken };
  }

  /** Regras da Receita para aceitar o cadastro: empresa ativa e com 6+ meses. */
  private receitaIneligibility(
    receita: ReceitaCnpjData,
  ): { status: 'inactive' | 'too_new'; message: string } | null {
    const situacao = (receita.situacao ?? '').trim().toUpperCase();
    if (situacao !== 'ATIVA') {
      const label = situacao
        ? situacao.charAt(0) + situacao.slice(1).toLowerCase()
        : 'irregular';
      return {
        status: 'inactive',
        message: `Este CNPJ está com situação "${label}" na Receita Federal. Só é possível cadastrar empresas ativas.`,
      };
    }

    const openingDate = this.parseReceitaDate(receita.dataAbertura);
    if (openingDate) {
      const today = new Date();
      const months =
        (today.getFullYear() - openingDate.getFullYear()) * 12 +
        (today.getMonth() - openingDate.getMonth());
      if (months < 6) {
        return {
          status: 'too_new',
          message:
            'Empresas com menos de 6 meses de abertura ainda não podem se cadastrar.',
        };
      }
    }

    return null;
  }

  async login(
    loginDto: LoginDto,
    ip: string,
  ): Promise<AuthResponseDto & { company: boolean }> {
    void ip;
    const { cnpj, password } = loginDto;

    if (!isValidCnpj(cnpj)) {
      throw new HttpException('Informe um CNPJ válido', HttpStatus.BAD_REQUEST);
    }

    const user = await this.companyRepository.findOne({
      where: cnpjLookupVariants(cnpj).map((variant) => ({ cnpj: variant })),
    });

    const isPasswordValid =
      !!user?.password && (await bcrypt.compare(password, user.password));

    if (!user || !isPasswordValid) {
      throw new HttpException('Credenciais inválidas', HttpStatus.UNAUTHORIZED);
    }

    if (!user.isActive) {
      throw new HttpException(
        'Conta desativada. Entre em contato com o suporte.',
        HttpStatus.FORBIDDEN,
      );
    }

    const token = await this.generateJwt({ username: user.cnpj, sub: user.id });

    return { access_token: token, company: true };
  }

  /** A ReceitaWS devolve datas no formato DD/MM/AAAA. */
  private parseReceitaDate(value?: string | null): Date | null {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((value ?? '').trim());
    if (!match) return null;
    const [, day, month, year] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    try {
      const { oldPassword, newPassword } = changePasswordDto;

      const user = await this.companyRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new HttpException('Usuário não encontrado', HttpStatus.NOT_FOUND);
      }

      const isOldPasswordValid = await bcrypt.compare(
        oldPassword,
        user.password,
      );
      if (!isOldPasswordValid) {
        throw new HttpException(
          'Senha antiga inválida',
          HttpStatus.BAD_REQUEST,
        );
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedNewPassword;
      await this.companyRepository.save(user);
      return {
        message: 'Senha alterada com sucesso',
      };
    } catch (error) {
      throw new HttpException(error, HttpStatus.BAD_REQUEST);
    }
  }

  private formatPhoneNumber(phoneNumber: string): string {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.startsWith('55')) {
      return cleaned;
    }
    return `55${cleaned}`;
  }

  private formatName(name: string): string {
    if (!name) return '';

    return name
      .trim()
      .toLowerCase()
      .split(' ')
      .map((word) => {
        const minusculas = [
          'de',
          'da',
          'do',
          'das',
          'dos',
          'e',
          'a',
          'o',
          'as',
          'os',
        ];
        if (minusculas.includes(word.toLowerCase())) {
          return word.toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

  async generateRecoveryCodeAndSendNumber(
    phone: PhoneJson,
  ): Promise<{ status: boolean; message: string }> {
    try {
      const { phoneNumber } = phone;
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      const phoneNumberVariations = [
        phoneNumber,
        phoneNumber.replace(')', ') '),
      ];

      const user = await this.companyRepository.findOne({
        where: phoneNumberVariations.map((variation) => ({
          phoneNumber: Like(`%${variation}%`),
        })),
      });

      if (!user) {
        return {
          status: true,
          message:
            'Se o telefone estiver cadastrado, enviaremos um código de redefinição.',
        };
      }

      await this.recoverCodeRepository.delete({
        phoneNumber: formattedPhone,
      });

      const code = randomInt(100000, 1000000);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const response = await this.whatsappService.whatsAppCode(
        formattedPhone,
        code,
      );

      if (response.status === 200) {
        await this.recoverCodeRepository.save({
          code,
          phoneNumber: formattedPhone,
          expiresAt,
          used: false,
        });
      } else {
        throw new HttpException(
          'Por favor tente novamente, daqui a pouco',
          HttpStatus.BAD_REQUEST,
        );
      }

      return {
        status: true,
        message:
          'Se o telefone estiver cadastrado, enviaremos um código de redefinição.',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Não conseguimos enviar o código de redefinição',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async sendCodeVerify(
    phone: PhoneJson,
  ): Promise<{ status: boolean; message: string }> {
    try {
      const { phoneNumber } = phone;
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      const code = randomInt(100000, 1000000);

      await this.whatsappService.whatsAppCode(formattedPhone, code);

      return {
        status: true,
        message: 'Código enviado com sucesso',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Não conseguimos enviar o código de verificação',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  async validateRecoveryCode(
    recoveryDto: RecoveryCodeDto,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { phoneNumber, code } = recoveryDto;

      const phoneNumberVariations = [
        phoneNumber,
        phoneNumber.replace(')', ') '),
      ];

      const user = await this.companyRepository.findOne({
        where: phoneNumberVariations.map((variation) => ({
          phoneNumber: Like(`%${variation}%`),
        })),
      });

      if (!user) {
        throw new HttpException(
          'Código expirado ou inválido',
          HttpStatus.BAD_REQUEST,
        );
      }

      const recoveryCode = await this.recoverCodeRepository.findOne({
        where: {
          code,
          used: false,
          expiresAt: MoreThan(new Date()),
        },
      });

      if (!recoveryCode) {
        throw new HttpException(
          'Código expirado ou inválido',
          HttpStatus.BAD_REQUEST,
        );
      }

      function normalizePhoneNumber(phoneNumber: string): string {
        let normalized = phoneNumber.replace(/\D/g, '');
        if (!normalized.startsWith('55') && normalized.length >= 10) {
          normalized = '55' + normalized;
        }

        return normalized;
      }

      const normalizedUserPhone = normalizePhoneNumber(user.phoneNumber);
      const normalizedRecoveryPhone = normalizePhoneNumber(
        recoveryCode.phoneNumber,
      );

      if (normalizedUserPhone !== normalizedRecoveryPhone) {
        throw new HttpException(
          'O código não corresponde ao número do usuário',
          HttpStatus.FORBIDDEN,
        );
      }

      return {
        success: true,
        message: 'Código validado com sucesso',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      console.error('Erro na validação do código:', error);

      throw new HttpException(
        'Ocorreu um erro ao validar o código. Tente novamente',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async changePasswordByRecoveryCode(
    resetPasswordDto: ResetPasswordByRecoveryCodeDto,
  ): Promise<{ message: string }> {
    const { phoneNumber, newPassword, code } = resetPasswordDto;
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    const phoneNumberVariations = [
      phoneNumber,
      phoneNumber.replace(')', ') '),
      formattedPhone,
      `+${formattedPhone}`,
    ];

    await this.companyRepository.manager.transaction(async (manager) => {
      const recoveryCodeRepository = manager.getRepository(RecoveryCode);
      const companyRepository = manager.getRepository(Company);
      const recoveryCode = await recoveryCodeRepository.findOne({
        where: {
          code,
          used: false,
          phoneNumber: formattedPhone,
          expiresAt: MoreThan(new Date()),
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!recoveryCode) {
        throw new HttpException(
          'Código expirado ou inválido',
          HttpStatus.BAD_REQUEST,
        );
      }

      const candidates = await companyRepository.find({
        where: phoneNumberVariations.map((variation) => ({
          phoneNumber: Like(`%${variation}%`),
        })),
      });
      const user = candidates.find(
        (candidate) =>
          this.formatPhoneNumber(candidate.phoneNumber) === formattedPhone,
      );

      if (!user) {
        throw new HttpException(
          'Código expirado ou inválido',
          HttpStatus.BAD_REQUEST,
        );
      }

      user.password = await bcrypt.hash(newPassword, 10);
      recoveryCode.used = true;
      await companyRepository.save(user);
      await recoveryCodeRepository.save(recoveryCode);
    });

    return { message: 'Senha alterada com sucesso' };
  }
  async getUserByToken(token: string): Promise<Company> {
    try {
      const secret = this.configService.get<string>('JWT_SECRET');

      const decoded = jwt.verify(token, secret) as { sub: string };

      const user = await this.companyRepository.findOne({
        where: { id: decoded.sub },
        select: [
          'id',
          'name',
          'email',
          'isActive',
          'cpf',
          'createdAt',
          'cnpj',
          'antt',
          'phoneContact',
          'photoUrl',
          'phoneNumber',
          'userPhotoURL',
          'cpf',
          'city',
          'nameFantasy',
          'state',
          'zipcode',
          'street',
          'number',
          'isOn',
          'onboardingCompletedAt',
        ],
        relations: ['contacts', 'CompanyUsersContacts'],
      });

      if (!user) {
        throw new HttpException('Usuário não encontrado', HttpStatus.NOT_FOUND);
      }

      return user;
    } catch (error) {
      throw new HttpException(error, HttpStatus.UNAUTHORIZED);
    }
  }

  async registerContactCompany(
    dto: ContactCompanyRegisterDto,
    userId: string,
  ): Promise<AuthResponseRegisterDto> {
    const { email, cpf, password, ...rest } = dto;

    const exists = await this.contactCompanyRepository.findOne({
      where: [
        { email, companyId: userId },
        { cpf, companyId: userId },
      ],
    });

    if (exists) {
      throw new HttpException(
        'Contato já cadastrado nesta empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const contact = this.contactCompanyRepository.create({
      ...rest,
      email,
      cpf,
      password: hashedPassword,
      companyId: userId,
      isActive: true,
    });
    await this.contactCompanyRepository.save(contact);

    return { message: 'Contato cadastrado com sucesso' };
  }

  async loginContactCompany(
    dto: ContactCompanyLoginDto,
  ): Promise<AuthResponseDto & { company: boolean }> {
    const { email, password } = dto;
    const contact = await this.contactCompanyRepository.findOne({
      where: { email },
      relations: ['company'],
    });
    if (!contact) {
      throw new HttpException('Contato não encontrado', HttpStatus.BAD_REQUEST);
    }
    if (!contact.isActive) {
      throw new HttpException('Cadastro inativo', HttpStatus.BAD_REQUEST);
    }
    const isPasswordValid = await bcrypt.compare(password, contact.password);
    if (!isPasswordValid) {
      throw new HttpException('Dados inválidos', HttpStatus.BAD_REQUEST);
    }

    const payload = { username: contact.company.cnpj, sub: contact.companyId };
    const token = await this.generateJwt(payload);
    return { access_token: token, company: false };
  }

  async updateCompanyForLogin(updateDto: {
    cpf: string;
    password: string;
    email: string;
    contactId: string;
    cnpj: string;
  }): Promise<{ message: string }> {
    try {
      const { cpf, password, email, contactId, cnpj } = updateDto;

      const contactCompany = await this.contactCompanyRepository.findOne({
        where: { id: contactId },
        relations: ['company'],
      });

      if (!contactCompany) {
        throw new HttpException(
          'Contato da empresa não encontrado',
          HttpStatus.NOT_FOUND,
        );
      }

      if (!contactCompany.company) {
        throw new HttpException(
          'Empresa vinculada ao contato não encontrada',
          HttpStatus.NOT_FOUND,
        );
      }

      const company = contactCompany.company;

      const existingCpf = await this.contactCompanyRepository.findOne({
        where: {
          cpf,
          id: Not(contactCompany.id),
        },
      });

      if (existingCpf) {
        throw new HttpException(
          'CPF já cadastrado em outro contato',
          HttpStatus.BAD_REQUEST,
        );
      }

      const existingEmail = await this.contactCompanyRepository.findOne({
        where: {
          email,
          id: Not(contactCompany.id),
        },
      });

      if (existingEmail) {
        throw new HttpException(
          'Email já cadastrado em outro contato',
          HttpStatus.BAD_REQUEST,
        );
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await this.contactCompanyRepository.update(contactCompany.id, {
        cpf,
        password: hashedPassword,
        email,
        isActive: true,
      });

      await this.companyRepository.update(company.id, {
        cnpj: formatCnpj(cnpj),
      });

      return {
        message: 'sucesso',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      console.error('Erro ao atualizar contato:', error);
      throw new HttpException(
        'Erro interno do servidor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
