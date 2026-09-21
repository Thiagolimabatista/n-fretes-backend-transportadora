import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

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

@ApiTags('preferences')
@Controller('preferences')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get()
  @ApiOperation({
    summary: 'Preferências de interface do usuário logado',
    description:
      'Empresa (login por CNPJ) e membros da equipe (login por e-mail) têm preferências próprias.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        navigationLayout: 'side',
        menuView: 'compact',
        sidebarCollapsed: false,
      },
    },
  })
  async get(@Req() request: AuthenticatedRequest): Promise<UserPreferences> {
    return this.preferencesService.get(principalOf(request));
  }

  @Patch()
  @ApiOperation({
    summary: 'Atualiza preferências de interface (só os campos enviados)',
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdatePreferencesDto,
  ): Promise<UserPreferences> {
    return this.preferencesService.update(principalOf(request), body);
  }
}
