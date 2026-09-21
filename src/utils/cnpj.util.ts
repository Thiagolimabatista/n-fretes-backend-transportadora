/**
 * Utilitários de CNPJ: normalização, formatação e validação com
 * dígitos verificadores. Aceita entrada com ou sem máscara.
 */

/** Formato aceito na entrada: com ou sem pontuação (00.000.000/0000-00). */
export const CNPJ_INPUT_REGEX = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;

export function cnpjDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function formatCnpj(value: string | null | undefined): string {
  const digits = cnpjDigits(value);
  if (digits.length !== 14) return value ?? '';
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5',
  );
}

function checkDigit(base: string): number {
  const weights =
    base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = base
    .split('')
    .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Valida formato e dígitos verificadores do CNPJ. */
export function isValidCnpj(value: string | null | undefined): boolean {
  const raw = (value ?? '').trim();
  if (!CNPJ_INPUT_REGEX.test(raw)) return false;

  const digits = cnpjDigits(raw);
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const first = checkDigit(digits.slice(0, 12));
  const second = checkDigit(digits.slice(0, 12) + first);
  return digits.endsWith(`${first}${second}`);
}

/**
 * Variações de CNPJ para busca no banco: registros antigos podem ter
 * sido gravados sem máscara, os novos são gravados mascarados.
 */
export function cnpjLookupVariants(value: string): string[] {
  const digits = cnpjDigits(value);
  return Array.from(new Set([formatCnpj(digits), digits]));
}
