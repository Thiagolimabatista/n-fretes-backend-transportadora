import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { DeepPartial, Like, MoreThan, Not, Repository } from 'typeorm';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthResponseDto, AuthResponseRegisterDto } from './dto/Auth.dto';
import { LoginDto } from './dto/Login.dto';
import { ChangePasswordDto } from './dto/Password.dto';
import * as jwt from 'jsonwebtoken';
import { PhoneJson } from './interfaces/IAuth';
import { Company } from '@entities/company.entity';
import { RecoveryCode } from '@entities/recovery-codes.entity';
import { WhatsappService } from 'src/external/services/WHATSCODE/whatsapp-code.service';
import { SubscriptionCompany } from '@entities/subscription-company.entity';
import { FeatureUsage } from '@entities/feature-usage.entity';
import { FeatureLog } from '@entities/feature-logs.entity';
import { ContactCompany } from '@entities/contact-company.entity';
import {
  ContactCompanyRegisterDto,
  ContactCompanyLoginDto,
} from './dto/ContactCompanyAuth.dto';
import { CompanySearchService } from '@components/company-search/company-search.service';
import { PlansCompany } from '@entities/plans-company.entity';
import { RegisterDto } from './dto/Register.dto';
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
    @InjectRepository(SubscriptionCompany)
    private subscriptionCompanyRepository: Repository<SubscriptionCompany>,
    @InjectRepository(FeatureUsage)
    private featureUsageRepository: Repository<FeatureUsage>,
    @InjectRepository(FeatureLog)
    private featureLogsRepository: Repository<FeatureLog>,
    @InjectRepository(ContactCompany)
    private contactCompanyRepository: Repository<ContactCompany>,
    private companySearchService: CompanySearchService,
  ) {}

  async generateJwt(payload: any) {
    const secret = this.configService.get<string>('JWT_SECRET');
    return jwt.sign(payload, secret, { expiresIn: '30d' });
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseRegisterDto> {
    const queryRunner =
      this.companyRepository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { cnpj, password, name, nameFantasy, email, cpf, ...userData } =
        registerDto;

      const existingUser = await this.companyRepository.findOne({
        where: { cnpj },
      });
      if (existingUser) {
        throw new HttpException('CNPJ já cadastrado', HttpStatus.BAD_REQUEST);
      }

      const existingEmail = await this.companyRepository.findOne({
        where: { email: registerDto.email },
      });
      if (existingEmail) {
        throw new HttpException('E-mail já cadastrado', HttpStatus.BAD_REQUEST);
      }

      const findByCnpj = await this.companySearchService.getCnpjData(cnpj);

      if (!findByCnpj) {
        throw new HttpException(
          'CNPJ inválido ou não encontrado',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (findByCnpj.dataAbertura) {
        const dataAbertura = new Date(findByCnpj.dataAbertura);
        const hoje = new Date();
        const diferencaEmMeses =
          (hoje.getFullYear() - dataAbertura.getFullYear()) * 12 +
          (hoje.getMonth() - dataAbertura.getMonth());

        if (diferencaEmMeses < 6) {
          throw new HttpException(
            'Não é possível registrar empresas com menos de 6 meses de existência. Por favor, tente novamente quando sua empresa atingir este requisito.',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      if (findByCnpj.situacao !== 'ATIVA') {
        throw new HttpException(
          'CNPJ não está ativo na Receita Federal',
          HttpStatus.BAD_REQUEST,
        );
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = this.companyRepository.create({
        ...userData,
        isActive: true,
        isCompleted: true,
        isOn: true,
        cnpj: this.formatCNPJ(cnpj),
        name: this.formatName(name),
        email,
        cpf: cpf || null,
        nameFantasy: this.formatName(nameFantasy),
        zipcode: findByCnpj.endereco.cep,
        state: findByCnpj.endereco.uf,
        city: findByCnpj.endereco.municipio,
        street: findByCnpj.endereco.logradouro,
        district: findByCnpj.endereco.bairro,
        password: hashedPassword,
      } as DeepPartial<Company>);

      const savedUser = await queryRunner.manager.save(newUser);

      const defaultPlanId = this.configService
        .get<string>('DEFAULT_COMPANY_PLAN_ID')
        ?.trim();
      const planRepository = queryRunner.manager.getRepository(PlansCompany);
      const plan = await planRepository.findOne({
        where: defaultPlanId
          ? { id: defaultPlanId, isTrial: false, status: true }
          : { isTrial: false, status: true },
        order: defaultPlanId
          ? undefined
          : {
              value: 'ASC',
              createdAt: 'ASC',
            },
      });

      if (!plan) {
        throw new HttpException(
          'Nenhum plano padrão ativo foi configurado',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const trialEndDate = new Date();
      trialEndDate.setMonth(trialEndDate.getMonth() + 1);

      const subscriptionCompany = this.subscriptionCompanyRepository.create({
        companyId: savedUser.id,
        status: 1,
        planId: plan.id,
        interval: 1,
        isInTrial: false,
        amount: plan.value,
        trialStartDate: new Date(),
        trialEndDate: trialEndDate,
        nextRecurrency: trialEndDate.toISOString(),
        endDate: trialEndDate.toISOString(),
      });

      await queryRunner.manager.save(subscriptionCompany);

      await queryRunner.commitTransaction();

      return { message: 'Cadastro enviado para análise' };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Não foi possível concluir o cadastro',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      await queryRunner.release();
    }
  }

  async login(
    loginDto: LoginDto,
    ip: string,
  ): Promise<AuthResponseDto & { company: boolean }> {
    void ip;
    const { cnpj, password } = loginDto;
    const user = await this.companyRepository.findOne({ where: { cnpj } });

    if (!user) {
      throw new HttpException('Credenciais inválidas', HttpStatus.UNAUTHORIZED);
    }

    if (!user.isActive) {
      throw new HttpException(
        'Cadastro encontra-se em análise',
        HttpStatus.BAD_REQUEST,
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new HttpException('Credenciais inválidas', HttpStatus.UNAUTHORIZED);
    }

    await this.companyRepository.save(user);
    const payload = { username: user.cnpj, sub: user.id };
    const token = await this.generateJwt(payload);

    return { access_token: token, company: true };
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

  private formatCNPJ(cnpj: string): string {
    if (!cnpj) return '';

    const cleaned = cnpj.replace(/\D/g, '');
    if (cleaned.length === 14) {
      return cleaned.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        '$1.$2.$3/$4-$5',
      );
    }

    return cnpj;
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
        ],
        relations: [
          'contacts',
          'CompanyUsersContacts',
          'subscription',
          'subscription.plan',
        ],
      });

      if (!user) {
        throw new HttpException('Usuário não encontrado', HttpStatus.NOT_FOUND);
      }

      return user;
    } catch (error) {
      throw new HttpException(error, HttpStatus.UNAUTHORIZED);
    }
  }

  async getBeneficitsUser(userId: string) {
    try {
      const subscription = await this.subscriptionCompanyRepository.findOne({
        where: { companyId: userId },
        relations: ['plan', 'plan.featureLimits', 'plan.featureLimits.feature'],
      });

      if (!subscription) {
        return [
          {
            name: 'Sem assinatura ativa',
            quantityUsed: 0,
            limit: 0,
            remaining: 0,
            description: 'O usuário ainda não possui uma assinatura ativa',
            isUnlimited: false,
          },
        ];
      }

      const featureUsageUser = await this.featureUsageRepository.find({
        where: { subscriptionId: subscription.id },
        relations: ['feature'],
      });

      const benefits = subscription.plan.featureLimits.map((limit) => {
        const usage = featureUsageUser.find(
          (u) => u.featureId === limit.featureId,
        ) || {
          quantityUsed: 0,
          feature: limit.feature,
        };

        return {
          name: limit.feature.name,
          quantityUsed: usage.quantityUsed,
          limit: limit.monthlyLimit,
          remaining:
            limit.monthlyLimit !== null
              ? Math.max(0, limit.monthlyLimit - usage.quantityUsed)
              : null,
          description: limit.feature.description,
          isUnlimited: limit.monthlyLimit === null,
        };
      });

      return benefits;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Erro ao buscar benefícios',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
        cnpj: this.formatCNPJ(cnpj),
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
