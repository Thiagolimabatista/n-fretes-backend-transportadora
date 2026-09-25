export interface ParamsFreightRequest {
  id?: string;
  take?: number;
  page?: number;
  freightId?: string;
  userDriveId?: string;
  /** Um status ou vários separados por vírgula (ex.: "ACCEPTED,DELIVERY_COMPLETED"). */
  status?: string;
  /** Busca por nome do motorista, CPF ou telefone. */
  name?: string;
  q?: string;
  companyId?: string;
}
