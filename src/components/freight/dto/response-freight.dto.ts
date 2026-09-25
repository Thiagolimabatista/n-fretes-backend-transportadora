import {
  PaymentMethod,
  SpecieOfLoad,
  Toll,
  TypeOfLoad,
  UnityMetric,
} from 'src/enum/freight';
import { BodyType, VehicleType } from 'src/enum/vehicle';

export class ResponseFreightDto {
  id: string;

  originCity?: string;

  originState?: string;

  dateOrigin?: Date;

  destinyCity?: string;

  destinyState?: string;

  dateReceiver?: Date;

  typeOfLoad?: TypeOfLoad;

  lona?: boolean;

  tracker?: boolean;

  product?: string;

  specieOfLoad?: SpecieOfLoad;

  weightOfLoad?: string;

  unityMetric?: UnityMetric;

  volume?: string;

  security?: boolean;

  vehicleTypes?: VehicleType[];

  bodyTypes?: BodyType[];

  paymentMethod?: PaymentMethod;

  valueFreight?: number;

  calValue?: PaymentMethod;

  Toll?: Toll;

  methodPayment?: string;

  advance?: number;

  observation?: string;

  isActive?: boolean;

  openSolicitations?: boolean;

  companyId?: string;

  contactCompanyId?: string;
}
