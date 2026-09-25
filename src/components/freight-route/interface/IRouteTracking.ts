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
  /** Quem fez: pessoa da equipe, motorista ou "Sistema". */
  by?: string | null;
}

/** Cidade por onde o motorista passou (sede de município mais próxima dos pontos). */
export interface TimelineCity {
  name: string;
  state: string;
  /** Primeiro ponto registrado na cidade. */
  arrivedAt: string | null;
  /** Último ponto registrado na cidade. */
  leftAt: string | null;
  /** Onde o motorista está agora (último ponto da viagem). */
  current: boolean;
}

/** Andamento da viagem em curso (estimativas, não rota exata). */
export interface TimelineProgress {
  traveledKm: number;
  /** Linha reta até o destino x 1,2 (fator de estrada). */
  remainingKm: number | null;
  progressPercent: number | null;
  /** Velocidade média da viagem até agora (35 a 75 km/h). */
  avgSpeedKmh: number;
  /** Previsão de chegada ao destino. */
  etaAt: string | null;
  /** Previsão de entrega combinada no frete (fim do dia). */
  dueAt: string | null;
  /** A previsão passa da data de entrega combinada. */
  late: boolean;
  /** Minutos desde o último ponto recebido. */
  lastSeenMinutesAgo: number | null;
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
  /** Cidades por onde passou, na ordem (a última é a atual). */
  cities: TimelineCity[];
  /** Só para viagem em andamento com posição e destino conhecidos. */
  progress: TimelineProgress | null;
  summary: {
    pointsCount: number;
    lastSeenAt: string | null;
    distanceKm: number | null;
  };
}
