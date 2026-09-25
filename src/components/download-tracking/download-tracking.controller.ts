import {
  Controller,
  Post,
  Body,
  HttpStatus,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { DownloadTrackingService } from './download-tracking.service';
import { PlatformType } from '@entities/users-count-dowload.entity';
import { IsEnum, IsNotEmpty } from 'class-validator';

class RegisterDownloadDto {
  @IsEnum(PlatformType, {
    message: 'Platform must be either "ios" or "android"',
  })
  @IsNotEmpty({ message: 'Platform is required' })
  platform: PlatformType;
}

@Controller('download-tracking')
export class DownloadTrackingController {
  constructor(
    private readonly downloadTrackingService: DownloadTrackingService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async registerDownload(@Body() body: RegisterDownloadDto) {
    if (!body.platform) {
      throw new BadRequestException('Platform is required');
    }

    if (!Object.values(PlatformType).includes(body.platform)) {
      throw new BadRequestException(
        `Invalid platform. Must be either "${PlatformType.IOS}" or "${PlatformType.ANDROID}"`,
      );
    }

    const result = await this.downloadTrackingService.registerDownloadClick(
      body.platform,
    );

    return {
      status: 'success',
      message: 'Download click registered',
      data: {
        id: result.id,
        platform: result.platform,
        clickedAt: result.clickedAt,
      },
    };
  }
}
