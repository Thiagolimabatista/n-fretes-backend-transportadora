import { IsString, IsNotEmpty } from 'class-validator';

export class GetRouteCacheQueryDto {
  @IsString()
  @IsNotEmpty()
  originCity: string;

  @IsString()
  @IsNotEmpty()
  destinationCity: string;
}
