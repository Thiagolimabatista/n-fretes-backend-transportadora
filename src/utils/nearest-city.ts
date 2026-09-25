import { MUNICIPIOS_BR } from './municipios-br.data';

export interface CityPoint {
  name: string;
  state: string;
  latitude: number;
  longitude: number;
}

/** Longe disso da sede mais próxima, o ponto fica "em trânsito" (sem cidade). */
const MAX_CITY_DISTANCE_KM = 25;
/** Grade de 0,5 grau (~55 km): cada busca olha só as células vizinhas. */
const CELL = 0.5;

let grid: Map<string, CityPoint[]> | null = null;

const cellKey = (lat: number, lng: number) => `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;

function buildGrid(): Map<string, CityPoint[]> {
  const map = new Map<string, CityPoint[]>();
  for (const line of MUNICIPIOS_BR.split('\n')) {
    const [name, state, lat, lng] = line.split(';');
    const city: CityPoint = { name, state, latitude: Number(lat), longitude: Number(lng) };
    if (!Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) continue;
    const key = cellKey(city.latitude, city.longitude);
    const bucket = map.get(key);
    if (bucket) bucket.push(city);
    else map.set(key, [city]);
  }
  return map;
}

/** Distância em km entre dois pontos (haversine). */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Sede de município mais próxima do ponto (até 25 km). Base local com os
 * 5.570 municípios: sem custo de API e sem latência.
 */
export function nearestCity(latitude: number, longitude: number): (CityPoint & { distanceKm: number }) | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  grid ??= buildGrid();
  const row = Math.floor(latitude / CELL);
  const col = Math.floor(longitude / CELL);
  let best: CityPoint | null = null;
  let bestKm = Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      for (const city of grid.get(`${row + dr}:${col + dc}`) ?? []) {
        const km = distanceKm({ latitude, longitude }, city);
        if (km < bestKm) {
          bestKm = km;
          best = city;
        }
      }
    }
  }
  return best && bestKm <= MAX_CITY_DISTANCE_KM ? { ...best, distanceKm: bestKm } : null;
}
