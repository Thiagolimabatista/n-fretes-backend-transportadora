import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export const NAVIGATION_LAYOUTS = ['side', 'top'] as const;
export const MENU_VIEWS = ['compact', 'full'] as const;

export type NavigationLayout = (typeof NAVIGATION_LAYOUTS)[number];
export type MenuView = (typeof MENU_VIEWS)[number];

/** Preferências de interface do portal, salvas na conta do usuário. */
export type UserPreferences = {
  /** Menu lateral (`side`) ou barra de navegação no topo (`top`). */
  navigationLayout: NavigationLayout;
  /** Menu lateral enxuto ou com todos os atalhos. */
  menuView: MenuView;
  /** Menu lateral recolhido (só ícones). */
  sidebarCollapsed: boolean;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  navigationLayout: 'side',
  menuView: 'compact',
  sidebarCollapsed: false,
};

export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(NAVIGATION_LAYOUTS, {
    message: 'Posição do menu inválida. Use "side" ou "top".',
  })
  navigationLayout?: NavigationLayout;

  @IsOptional()
  @IsIn(MENU_VIEWS, { message: 'Tipo de menu inválido.' })
  menuView?: MenuView;

  @IsOptional()
  @IsBoolean({ message: 'sidebarCollapsed deve ser verdadeiro ou falso.' })
  sidebarCollapsed?: boolean;
}
