import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { addHours } from 'date-fns';

export function convertToSaoPauloTime(date: Date): Date {
  const timeZone = 'America/Sao_Paulo';

  const saoPauloTime = toZonedTime(date, timeZone);

  return saoPauloTime;
}

export function addHoursToSaoPauloTime(date: Date, hours: number): Date {
  const saoPauloTime = convertToSaoPauloTime(date);

  return addHours(saoPauloTime, hours);
}

/** Fuso usado nas janelas e nos dias do painel. */
export const SAO_PAULO_TZ = 'America/Sao_Paulo';

/** Dia (yyyy-MM-dd) em São Paulo de um instante. */
export function saoPauloDayKey(date: Date): string {
  return formatInTimeZone(date, SAO_PAULO_TZ, 'yyyy-MM-dd');
}

/** 00:00 do dia `dayKey` (yyyy-MM-dd) em São Paulo, como instante. */
export function startOfSaoPauloDay(dayKey: string): Date {
  return fromZonedTime(`${dayKey}T00:00:00`, SAO_PAULO_TZ);
}

/** Os `days` últimos dias de São Paulo (yyyy-MM-dd), terminando no dia de `now`. */
export function lastSaoPauloDays(days: number, now = new Date()): string[] {
  const [year, month, day] = saoPauloDayKey(now).split('-').map(Number);
  return Array.from({ length: days }, (_, i) =>
    new Date(Date.UTC(year, month - 1, day - (days - 1 - i)))
      .toISOString()
      .slice(0, 10),
  );
}

/** "dd/MM/yyyy" de um instante no fuso de São Paulo. */
export function formatSaoPauloDate(date: Date): string {
  return formatInTimeZone(date, SAO_PAULO_TZ, 'dd/MM/yyyy');
}

/**
 * Expressão SQL com o dia (YYYY-MM-DD) em São Paulo de uma coluna
 * `timestamp without time zone` gravada em UTC.
 */
export function saoPauloDaySql(column: string): string {
  return `TO_CHAR((${column} AT TIME ZONE 'UTC') AT TIME ZONE '${SAO_PAULO_TZ}', 'YYYY-MM-DD')`;
}
