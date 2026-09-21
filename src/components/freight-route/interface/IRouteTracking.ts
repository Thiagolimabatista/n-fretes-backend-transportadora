import { RouteStatus } from '@entities/freight-routes.entity';

/** Última posição conhecida do motorista na rota (listagem de rotas). */
export interface LastLocation {
  latitude: number;
  longitude: number;
  city: string | null;
  recordedAt: string | null;
}

export type TimelineEventType =
  | 'PUBLISHED'
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'STARTED'
  | 'DRIVER_CONFIRMED'
  | 'COMPLETED'
  | 'CANCELED';

export interface TimelineEvent {
  type: TimelineEventType;
  label: string;
  at: string;
}

export interface TimelinePoint {
  latitude: number;
  longitude: number;
  /** Hora em que o aparelho registrou o ponto (coluna `timestamp`). */
  recordedAt: string | null;
  speed: number | null;
  city: string | null;
}

/** Resposta de `GET /freight-route/:id/timeline`. */
export interface RouteTimeline {
  route: {
    id: string;
    status: RouteStatus;
    startedAt: string | null;
    completedAt: string | null;
    freightId: string | null;
    originCity: string | null;
    originState: string | null;
    destinyCity: string | null;
    destinyState: string | null;
    driver: { id: string; name: string | null; phone: string | null } | null;
  };
  events: TimelineEvent[];
  points: TimelinePoint[];
  summary: {
    pointsCount: number;
    lastSeenAt: string | null;
    distanceKm: number | null;
  };
}
