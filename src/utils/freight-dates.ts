/** Fretes seguem o dia civil de Brasília. */
export const FREIGHT_TIME_ZONE = 'America/Sao_Paulo';

/** Dia civil em Brasília ("2026-09-21"), para comparar datas sem hora. */
export function toDayKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return null;
  // Data sem hora ("2026-09-30" chega como 00:00 UTC): vale o dia informado,
  // não o dia anterior de Brasília. O portal manda meio-dia local.
  if (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  ) {
    return date.toISOString().slice(0, 10);
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FREIGHT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Até quando o frete fica publicado: fim do dia da coleta (Brasília). Sem data
 * de coleta, 30 dias a partir de `from`. Depois disso o cron fecha o frete.
 */
export function freightExpiry(dateOrigin: Date | string | null | undefined, from = new Date()): Date {
  const day = toDayKey(dateOrigin);
  if (day) return new Date(`${day}T23:59:59.999-03:00`);
  return new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
}

/** A coleta já passou (dia anterior a hoje em Brasília)? Sem data: não. */
export function isPickupPast(dateOrigin: Date | string | null | undefined, now = new Date()): boolean {
  const day = toDayKey(dateOrigin);
  return !!day && day < (toDayKey(now) as string);
}
