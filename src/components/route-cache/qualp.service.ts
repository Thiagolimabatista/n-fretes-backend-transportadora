import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const QUALP_BASE_URL = 'https://api.qualp.com.br/rotas/v4';

const TOLL_UNAVAILABLE_MESSAGE =
  'O cálculo de pedágio está indisponível no momento. Tente novamente mais tarde.';

// ---------- Tipos da resposta bruta da API QUALP ----------

export interface QualpToll {
  nome: string;
  concessionaria: string;
  rodovia: string;
  latitude: number;
  longitude: number;
  km: number;
  tarifa: Record<string, number>;
}

export interface QualpApiResponse {
  distancia: { texto: string; valor: number };
  duracao: { texto: string; valor: number };
  consumo_combustivel: number;
  coordenada_inicio: string;
  coordenada_fim: string;
  pedagios: QualpToll[];
}

// ---------- Parâmetros de entrada ----------

export interface CalculateTollParams {
  /** Lista de locais: pelo menos origem e destino */
  locations: string[];
  /** Quantidade de eixos do veículo (padrão: 2) */
  axis?: number;
  /** Preço do combustível em R$ (padrão: "6.20") */
  fuelPrice?: string;
  /** Consumo km/L (padrão: "10.0") */
  kmPerLiter?: string;
  /** Tipo de rota: "efficient" | "fastest" (padrão: "efficient") */
  routeType?: string;
}

// ---------- Tipos do resultado processado ----------

export interface TollPlace {
  name: string;
  concessionaria: string;
  rodovia: string;
  price: number;
  km: number;
  latitude: number;
  longitude: number;
}

export interface RouteCoordinatesResult {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  tollPoints: Array<{
    name: string;
    latitude: number;
    longitude: number;
    toll_price: number;
  }>;
}

export interface CalculateTollResult {
  success: true;
  tolls: TollPlace[];
  totalToll: number;
  distance: number;
  distanceText: string;
  duration: string;
  fuelConsumption: number;
  coordinates: RouteCoordinatesResult | null;
}

// ---------- Configuração padrão da API QUALP ----------

const DEFAULT_CONFIG = {
  config: {
    route: {
      optimized_route: false,
      optimized_route_destination: 'last',
      calculate_return: false,
      alternative_routes: '0',
      avoid_locations: true,
      avoid_locations_key: '',
      type_route: 'efficient',
    },
    vehicle: {
      type: 'truck',
      axis: 2,
      top_speed: null,
    },
    tolls: { retroactive_date: '' },
    freight_table: { category: 'all', freight_load: 'all', axis: 'all' },
    fuel_consumption: { fuel_price: '6.20', km_fuel: '10.0' },
    private_places: {
      max_distance_from_location_to_route: '1000',
      categories: true,
      areas: true,
      contacts: true,
      products: true,
      services: true,
    },
  },
  show: {
    tolls: true,
    freight_table: true,
    maneuvers: 'false',
    truck_scales: false,
    static_image: false,
    link_to_qualp: false,
    private_places: false,
    polyline: false,
    simplified_polyline: false,
    ufs: false,
    fuel_consumption: true,
    link_to_qualp_report: false,
    segments_information: false,
  },
  format: 'json',
  exception_key: '',
} as const;

// ---------- Service ----------

@Injectable()
export class QualpService {
  private readonly logger = new Logger(QualpService.name);

  constructor(private readonly httpService: HttpService) {}

  async calculateToll(params: CalculateTollParams): Promise<CalculateTollResult> {
    const apiKey = this.getApiKey();
    const axis = params.axis ?? DEFAULT_CONFIG.config.vehicle.axis;

    const jsonConfig = {
      locations: params.locations,
      config: {
        ...DEFAULT_CONFIG.config,
        route: {
          ...DEFAULT_CONFIG.config.route,
          type_route: params.routeType ?? DEFAULT_CONFIG.config.route.type_route,
        },
        vehicle: {
          ...DEFAULT_CONFIG.config.vehicle,
          axis,
        },
        fuel_consumption: {
          fuel_price: params.fuelPrice ?? DEFAULT_CONFIG.config.fuel_consumption.fuel_price,
          km_fuel: params.kmPerLiter ?? DEFAULT_CONFIG.config.fuel_consumption.km_fuel,
        },
      },
      show: DEFAULT_CONFIG.show,
      format: DEFAULT_CONFIG.format,
      exception_key: DEFAULT_CONFIG.exception_key,
    };

    const jsonParam = encodeURIComponent(JSON.stringify(jsonConfig));
    const url = `${QUALP_BASE_URL}?json=${jsonParam}`;

    this.logger.log(`Chamando API QUALP para: ${params.locations.join(' → ')}`);

    let response: { data: QualpApiResponse };
    try {
      response = await firstValueFrom(
        this.httpService.get<QualpApiResponse>(url, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Access-Token': apiKey,
          },
        }),
      );
    } catch (error) {
      const upstream = isAxiosError(error)
        ? `HTTP ${error.response?.status ?? '-'}: ${JSON.stringify(error.response?.data ?? error.message)}`
        : String(error);
      this.logger.error(`QUALP falhou (${params.locations.join(' → ')}): ${upstream}`);
      throw new HttpException(TOLL_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
    }

    const data = response.data;

    if (!data || !Array.isArray(data.pedagios)) {
      this.logger.error(`QUALP sem pedágios na resposta (${params.locations.join(' -> ')})`);
      throw new HttpException(TOLL_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
    }

    const axisStr = axis.toString();

    const tolls: TollPlace[] = data.pedagios.map((toll) => ({
      name: toll.nome,
      concessionaria: toll.concessionaria,
      rodovia: toll.rodovia,
      price: toll.tarifa[axisStr] ?? 0,
      km: toll.km,
      latitude: toll.latitude,
      longitude: toll.longitude,
    }));

    const totalToll = tolls.reduce((sum, t) => sum + t.price, 0);

    let coordinates: RouteCoordinatesResult | null = null;
    if (data.coordenada_inicio && data.coordenada_fim) {
      const [originLat, originLng] = data.coordenada_inicio.split(',').map(Number);
      const [destLat, destLng] = data.coordenada_fim.split(',').map(Number);

      coordinates = {
        origin: { latitude: originLat, longitude: originLng },
        destination: { latitude: destLat, longitude: destLng },
        tollPoints: data.pedagios.map((toll) => ({
          name: toll.nome,
          latitude: toll.latitude,
          longitude: toll.longitude,
          toll_price: toll.tarifa[axisStr] ?? 0,
        })),
      };
    }

    return {
      success: true,
      tolls,
      totalToll: Math.round(totalToll * 100) / 100,
      distance: data.distancia?.valor ?? 0,
      distanceText: data.distancia?.texto ?? '',
      duration: data.duracao?.texto ?? '',
      fuelConsumption: data.consumo_combustivel ?? 0,
      coordinates,
    };
  }

  private getApiKey(): string {
    const key = process.env.QUALP_API_KEY ?? '';
    if (!key) {
      this.logger.error('QUALP_API_KEY não está definida');
      throw new HttpException(TOLL_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return key;
  }
}
