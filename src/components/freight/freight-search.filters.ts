import { Brackets, SelectQueryBuilder } from 'typeorm';

import { Freight } from '@entities/freight.entity';

/**
 * Filtros da busca de fretes, compartilhados pela listagem (`GET /freight`)
 * e pelas opções com contagem (`GET /freight/search-options`) — assim a
 * contagem de cada opção é sempre igual ao que a lista devolve.
 */

export type SearchFacet = 'origin' | 'destiny' | 'vehicle' | 'body';

export interface FreightSearchParams {
  search?: string;
  originCity?: string | string[];
  destinyCity?: string | string[];
  vehicleTypes?: string | string[];
  bodyTypes?: string | string[];
}

export interface PlaceFilter {
  city: string;
  state: string;
}

/** Grupos "Todos os leves/médios/pesados" e seus veículos (valores do enum). */
const VEHICLE_GROUPS: Record<string, string[]> = {
  allLight: ['threeFour', 'Three Quarter', 'Fiorino', 'toco', 'Stump', 'VCL'],
  allAverage: ['Bit Truck', 'Truck'],
  allWeight: [
    'Bi Train',
    'Cart',
    'Cart LS',
    'train wheel',
    'Road Train',
    'Vanderleia',
  ],
};

/** Valores legados do enum que significam o mesmo veículo. */
const VEHICLE_ALIASES: Record<string, string> = {
  'Three Quarter': 'threeFour',
  Stump: 'toco',
  'Road Train': 'train wheel',
};

/** Rótulos em português (os mesmos do portal) para a busca por texto. */
const VEHICLE_LABELS: Record<string, string> = {
  allLight: 'Todos os leves',
  threeFour: '3/4',
  'Three Quarter': '3/4',
  Fiorino: 'Fiorino',
  toco: 'Toco',
  Stump: 'Toco',
  VCL: 'VLC',
  allAverage: 'Todos os médios',
  'Bit Truck': 'Bitruck',
  Truck: 'Caminhão truck',
  allWeight: 'Todos os pesados',
  'Bi Train': 'Bitrem',
  Cart: 'Carreta',
  'Cart LS': 'Carreta LS',
  'train wheel': 'Rodotrem',
  'Road Train': 'Rodotrem',
  Vanderleia: 'Vanderléia',
};

const BODY_LABELS: Record<string, string> = {
  Chest: 'Baú',
  'Fridge Chest': 'Baú frigorífico',
  'Refrigerated Chest': 'Baú refrigerado',
  Sider: 'Sider',
  Bucket: 'Caçamba',
  'Low Grille': 'Grade baixa',
  'Bulk Carrier': 'Graneleiro',
  Platform: 'Plataforma',
  Board: 'Prancha',
  'Only Horse': 'Apenas cavalo',
  Container: 'Porta-contêiner',
  Cavaqueira: 'Cavaqueira',
  Cage: 'Gaiola',
  Hopper: 'Hopper',
  Munk: 'Munck',
  Silo: 'Silo',
  Tank: 'Tanque',
  'Bug Container Door': 'Bug porta-contêiner',
  Prattle: 'Pau de arara',
  Blinker: 'Pisca',
};

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE',
  'TO',
]);

/** Palavras que não ajudam a achar frete ("de São Paulo para Goiânia"). */
const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na',
  'para', 'pra', 'com', 'ate', 'por',
]);

const normalizeText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Valores do enum cujo rótulo (ou o próprio valor) contém o termo. */
function matchLabels(
  labels: Record<string, string>,
  token: string,
): string[] {
  const term = normalizeText(token);
  return Object.entries(labels)
    .filter(
      ([value, label]) =>
        normalizeText(label).includes(term) ||
        normalizeText(value).includes(term),
    )
    .map(([value]) => value);
}

/** Termo como início de palavra (regex do Postgres): "sao" não casa "revisao". */
const wordStartPattern = (token: string) =>
  '\\m' + normalizeText(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Termos da busca livre, sem acento/caixa e sem palavras vazias. */
export function searchTokens(search: string | undefined): string[] {
  return (search ?? '')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 2 && !STOPWORDS.has(normalizeText(token)),
    )
    .slice(0, 6);
}

/** Valor canônico (o que a interface oferece) de um veículo gravado. */
export function canonicalVehicle(value: string): string {
  return VEHICLE_ALIASES[value] ?? value;
}

/**
 * Valores gravados que atendem a um veículo escolhido no filtro:
 * "Caminhão truck" também traz os fretes que aceitam "Todos os médios", e
 * "Todos os médios" traz qualquer frete de veículo médio.
 */
export function expandVehicle(value: string): string[] {
  const canonical = canonicalVehicle(value);
  const values = new Set<string>([value, canonical]);
  Object.entries(VEHICLE_ALIASES).forEach(([legacy, current]) => {
    if (current === canonical) values.add(legacy);
  });

  const members = VEHICLE_GROUPS[canonical];
  if (members) {
    members.forEach((member) => values.add(member));
  } else {
    Object.entries(VEHICLE_GROUPS).forEach(([group, groupMembers]) => {
      if (groupMembers.includes(canonical)) values.add(group);
    });
  }
  return Array.from(values);
}

/** Lista vinda da query string: "a,b", ["a","b"] ou "a". */
export function toList(value: string | string[] | undefined): string[] {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * "Cidade|UF" → { city, state }; "*|UF" é o estado inteiro.
 * Formato sem "|" é legado (texto livre).
 */
export function parsePlaces(value: string | string[] | undefined): {
  places: PlaceFilter[];
  states: string[];
  legacy: string[];
} {
  const places: PlaceFilter[] = [];
  const states: string[] = [];
  const legacy: string[] = [];
  toList(value).forEach((item) => {
    const [city, state] = item.split('|').map((part) => part.trim());
    if (city === '*' && state) states.push(state.toUpperCase());
    else if (city && state) places.push({ city, state: state.toUpperCase() });
    else legacy.push(item);
  });
  return { places, states, legacy };
}

/** Só fretes pesquisáveis (usa os índices parciais da migration). */
export function applySearchableBase(
  qb: SelectQueryBuilder<Freight>,
  alias = 'freight',
): void {
  qb.where(`${alias}."isExclude" = false`).andWhere(
    `${alias}."isActive" = true`,
  );
}

function applyPlaceFilter(
  qb: SelectQueryBuilder<Freight>,
  alias: string,
  kind: 'origin' | 'destiny',
  value: string | string[] | undefined,
): void {
  const { places, states, legacy } = parsePlaces(value);
  if (!places.length && !states.length && !legacy.length) return;

  const stateColumn = `${alias}."${kind}State"`;
  const cityNameColumn = `${alias}."${kind}CityName"`;
  const rawCityColumn = `${alias}."${kind}City"`;

  qb.andWhere(
    new Brackets((where) => {
      if (states.length) {
        where.orWhere(`${stateColumn} IN (:...${kind}WholeStates)`, {
          [`${kind}WholeStates`]: states,
        });
      }
      places.forEach((place, index) => {
        where.orWhere(
          `(${stateColumn} = :${kind}State${index} AND lower(${cityNameColumn}) = lower(:${kind}City${index}))`,
          {
            [`${kind}State${index}`]: place.state,
            [`${kind}City${index}`]: place.city,
          },
        );
      });
      legacy.forEach((text, index) => {
        where.orWhere(
          `unaccent(lower(${rawCityColumn})) ILIKE unaccent(lower(:${kind}Legacy${index}))`,
          { [`${kind}Legacy${index}`]: `%${text}%` },
        );
      });
    }),
  );
}

/**
 * Aplica busca textual e filtros. `except` deixa um filtro de fora — é o que
 * faz a contagem de cada grupo de opções considerar só os OUTROS filtros.
 */
export function applyFreightSearchFilters(
  qb: SelectQueryBuilder<Freight>,
  params: FreightSearchParams,
  options: {
    alias?: string;
    except?: SearchFacet;
    companyAlias?: string;
    /** Busca também pelo nome da transportadora (exige join `company`). */
    searchCompany?: boolean;
  } = {},
): void {
  const alias = options.alias ?? 'freight';
  const { except } = options;

  const companyAlias = options.companyAlias ?? 'company';
  const searchCompany = options.searchCompany ?? true;
  searchTokens(params.search).forEach((token, index) => {
    const term = `search${index}`;
    const uf = token.toUpperCase();
    const vehicles = Array.from(
      new Set(matchLabels(VEHICLE_LABELS, token).flatMap(expandVehicle)),
    );
    const bodies = matchLabels(BODY_LABELS, token);

    qb.andWhere(
      new Brackets((where) => {
        if (token.length === 2 && UFS.has(uf)) {
          // "MG", "sp": estado de origem ou destino (evita casar "sp" em "espuma")
          where.where(
            `(${alias}."originState" = :${term}Uf OR ${alias}."destinyState" = :${term}Uf)`,
            { [`${term}Uf`]: uf },
          );
          return;
        }
        where
          .where(`unaccent(lower(${alias}.product)) ~ :${term}`)
          .orWhere(`unaccent(lower(${alias}."originCity")) ~ :${term}`)
          .orWhere(`unaccent(lower(${alias}."destinyCity")) ~ :${term}`);
        if (searchCompany) {
          where
            .orWhere(`unaccent(lower(${companyAlias}."nameFantasy")) ~ :${term}`)
            .orWhere(`unaccent(lower(${companyAlias}.name)) ~ :${term}`);
        }
        if (vehicles.length) {
          where.orWhere(
            `string_to_array(${alias}."vehicleTypes", ',') && ARRAY[:...${term}Vehicles]::text[]`,
            { [`${term}Vehicles`]: vehicles },
          );
        }
        if (bodies.length) {
          where.orWhere(
            `string_to_array(${alias}."bodyTypes", ',') && ARRAY[:...${term}Bodies]::text[]`,
            { [`${term}Bodies`]: bodies },
          );
        }
      }),
      { [term]: wordStartPattern(token) },
    );
  });

  if (except !== 'origin') {
    applyPlaceFilter(qb, alias, 'origin', params.originCity);
  }
  if (except !== 'destiny') {
    applyPlaceFilter(qb, alias, 'destiny', params.destinyCity);
  }

  if (except !== 'vehicle') {
    const vehicles = Array.from(
      new Set(toList(params.vehicleTypes).flatMap(expandVehicle)),
    );
    if (vehicles.length) {
      qb.andWhere(
        `string_to_array(${alias}."vehicleTypes", ',') && ARRAY[:...vehicleFilter]::text[]`,
        { vehicleFilter: vehicles },
      );
    }
  }

  if (except !== 'body') {
    const bodies = toList(params.bodyTypes);
    if (bodies.length) {
      qb.andWhere(
        `string_to_array(${alias}."bodyTypes", ',') && ARRAY[:...bodyFilter]::text[]`,
        { bodyFilter: bodies },
      );
    }
  }
}

/**
 * Conta, para cada valor canônico, quantos fretes ele traria no filtro.
 * Recebe as combinações gravadas ("Truck,allAverage" → 3 fretes) e aplica a
 * mesma expansão do filtro, sem contar o mesmo frete duas vezes.
 */
export function countListOptions(
  combos: Array<{ list: string | null; count: string | number }>,
  kind: 'vehicle' | 'body',
): Array<{ value: string; count: number }> {
  const parsed = combos.map((combo) => ({
    values: new Set(toList(combo.list ?? '')),
    count: Number(combo.count),
  }));

  const candidates = new Set<string>();
  parsed.forEach(({ values }) =>
    values.forEach((value) =>
      candidates.add(kind === 'vehicle' ? canonicalVehicle(value) : value),
    ),
  );
  if (kind === 'vehicle') {
    Object.keys(VEHICLE_GROUPS).forEach((group) => {
      const touchesGroup = parsed.some(({ values }) =>
        expandVehicle(group).some((value) => values.has(value)),
      );
      if (touchesGroup) candidates.add(group);
    });
  }

  return Array.from(candidates)
    .map((value) => {
      const matches = kind === 'vehicle' ? expandVehicle(value) : [value];
      const count = parsed.reduce(
        (total, combo) =>
          matches.some((match) => combo.values.has(match))
            ? total + combo.count
            : total,
        0,
      );
      return { value, count };
    })
    .filter((option) => option.count > 0);
}
