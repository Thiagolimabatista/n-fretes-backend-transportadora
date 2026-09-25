import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/Login.dto';
import {
  AuthResponseDto,
  AuthResponseRegisterDto,
  CheckCnpjResponseDto,
} from './dto/Auth.dto';
import {
  ChangePasswordDto,
  PhoneNumberDto,
  RecoveryCodeDto,
  ResetPasswordByRecoveryCodeDto,
} from './dto/Password.dto';
import { RegisterDto } from './dto/Register.dto';
import { Param } from '@nestjs/common';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { Company } from '@entities/company.entity';
import { GetUserId } from 'src/decorators/get-user-decorator';
import {
  ContactCompanyRegisterDto,
  ContactCompanyLoginDto,
} from './dto/ContactCompanyAuth.dto';
import { UpdateCompanyLoginDto } from './dto/UpdateCompanyLogin.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  @Post('register')
  async register(
    @Body() registerDto: RegisterDto,
  ): Promise<AuthResponseRegisterDto> {
    return this.authService.register(registerDto);
  }

  /********************************************************************************** */

  @Get('check-cnpj/:cnpj')
  async checkCnpj(@Param('cnpj') cnpj: string): Promise<CheckCnpjResponseDto> {
    return this.authService.checkCnpj(cnpj);
  }

  @Get('check-email/:email')
  async checkEmail(@Param('email') email: string) {
    const normalized = (email ?? '').trim();
    if (!normalized) {
      return { exists: false };
    }
    const exists = !!(await this.companyRepository.findOne({
      where: { email: ILike(normalized) },
    }));
    return { exists };
  }

  @Get('check-cpf/:cpf')
  async checkCpf(@Param('cpf') cpf: string) {
    const exists = !!(await this.companyRepository.findOne({ where: { cpf } }));
    return { exists };
  }

  /********************************************************************************** */

  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: any,
  ): Promise<AuthResponseDto> {
    return this.authService.login(loginDto, req.ip);
  }

  /********************************************************************************** */
  @Post('password/forgot')
  async sendRecoveryCode(@Body() phoneNumber: PhoneNumberDto) {
    return this.authService.generateRecoveryCodeAndSendNumber(phoneNumber);
  }

  @Post('verify-phone')
  async sendCodeVerify(@Body() phoneNumber: PhoneNumberDto) {
    return this.authService.sendCodeVerify(phoneNumber);
  }

  /********************************************************************************** */

  /********************************************************************************** */

  @Post('password/code')
  async validateRecoveryCode(@Body() recoveryDto: RecoveryCodeDto) {
    return this.authService.validateRecoveryCode(recoveryDto);
  }

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(
    @Headers('authorization') authHeader: string,
  ): Promise<Company> {
    const token = authHeader.replace('Bearer ', '');
    return this.authService.getUserByToken(token);
  }

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Put('/password/reset')
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @GetUserId() userId: string,
  ): Promise<{ message: string }> {
    return this.authService.changePassword(userId, changePasswordDto);
  }

  /********************************************************************************** */

  @Post('password/reset-password')
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordByRecoveryCodeDto,
  ) {
    return this.authService.changePasswordByRecoveryCode(resetPasswordDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('contact-company/register')
  async registerContactCompany(
    @Body() dto: ContactCompanyRegisterDto,
    @GetUserId() userId: string,
  ) {
    return this.authService.registerContactCompany(dto, userId);
  }

  @Post('contact-company/login')
  async loginContactCompany(@Body() dto: ContactCompanyLoginDto) {
    return this.authService.loginContactCompany(dto);
  }

  @Post('update-company-login')
  async updateCompanyLogin(@Body() updateDto: UpdateCompanyLoginDto) {
    return this.authService.updateCompanyForLogin(updateDto);
  }
}
