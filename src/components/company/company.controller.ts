import {
  Body,
  Controller,
  UseGuards,
  Put,
  Get,
  Patch,
  Param,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';

import {
  CompanyPublicProfile,
  CompanyService,
  CompanyUpdateResponse,
} from './company.service';
import { GetUserId } from 'src/decorators/get-user-decorator';
import { companyUpdateDto } from './dto/Company.dto';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Put('update')
  async updatePlan(
    @GetUserId() userId: string,
    @Body() body: companyUpdateDto,
  ): Promise<CompanyUpdateResponse> {
    return this.companyService.updateUserIdCompany(userId, body);
  }

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Get('is-success')
  async checkIsSucess(
    @GetUserId() userId: string,
  ): Promise<{ isSucess: boolean }> {
    return this.companyService.checkIsSucess(userId);
  }

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Patch('mark-success')
  async updateIsSucess(
    @GetUserId() userId: string,
  ): Promise<{ message: string }> {
    return this.companyService.updateIsSucess(userId);
  }

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Get(':id/profile')
  async getPublicProfile(
    @Param('id') id: string,
  ): Promise<CompanyPublicProfile> {
    return this.companyService.getPublicProfile(id);
  }

  /********************************************************************************** */

  @UseGuards(JwtAuthGuard)
  @Patch('onboarding/complete')
  async completeOnboarding(
    @GetUserId() userId: string,
  ): Promise<{ onboardingCompletedAt: Date }> {
    return this.companyService.completeOnboarding(userId);
  }
}
