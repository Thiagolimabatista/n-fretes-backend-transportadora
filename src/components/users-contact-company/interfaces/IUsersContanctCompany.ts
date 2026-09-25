/** Filtros da lista "Meus motoristas" (a empresa vem do token). */
export interface ParamsUsersContactCompany {
  /** Busca por nome, CPF, telefone ou cidade. */
  q?: string;
  /** Nome antigo de `q`. */
  name?: string;
  /** Um grupo (nome antigo) ou vários separados por vírgula em `groupIds`. */
  groupId?: string;
  groupIds?: string;
  page?: string | number;
  limit?: string | number;
  /** Nome antigo de `limit`. */
  take?: string | number;
}
