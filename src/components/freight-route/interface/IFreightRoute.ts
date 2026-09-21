import { RouteStatus } from '@entities/freight-routes.entity';

export interface ParamsFreightRoute {
  id?: string;
  take?: number;
  page?: number;
  freightId?: string;
  userDriveId?: string;
  status?: RouteStatus;
  companyId?: string;
  name?: string;
  isActive?: boolean;
  avalationUserDrive?: boolean;
  /** ISO: só rotas com `completedAt` a partir desta data (kanban "Entrega confirmada"). */
  completedSince?: string;
}
