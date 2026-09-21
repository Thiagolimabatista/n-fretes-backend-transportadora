import { SpecieOfLoad, TypeOfLoad } from 'src/enum/freight';
import { BodyType, VehicleType } from 'src/enum/vehicle';

export interface ParamsFreight {
  /** Texto livre: produto, cidades e nome da transportadora. */
  search?: string;
  originCity?: string;
  originState?: string;
  take?: number;
  page?: number;
  isActive?: boolean;
  isExclude?: boolean;
  dateOrigin?: Date;
  destinyCity?: string;
  destinyState?: string;
  dateReceiver?: Date;
  typeOfLoad?: TypeOfLoad[];
  specieOfLoad?: SpecieOfLoad[];
  vehicleTypes?: VehicleType[];
  bodyTypes?: BodyType[];
  openSolicitations?: boolean;
  createdAt?: Date;
  companyId?: string;
  id?: string;
}
