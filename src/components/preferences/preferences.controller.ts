import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { UpdatePreferencesDto, UserPreferences } from './dto/preferences.dto';
import {
  PreferencesPrincipal,
  PreferencesService,
} from './preferences.service';

interface AuthenticatedRequest {
  user?: { sub?: string; contactId?: string };
}

const principalOf = (request: AuthenticatedRequest): PreferencesPrincipal => ({
  companyId: request.user?.sub ?? '',
  contactId: request.user?.contactId,
});

@Controller('preferences')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get()
  async get(@Req() request: AuthenticatedRequest): Promise<UserPreferences> {
    return this.preferencesService.get(principalOf(request));
  }

  @Patch()
  async update(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdatePreferencesDto,
  ): Promise<UserPreferences> {
    return this.preferencesService.update(principalOf(request), body);
  }
}
