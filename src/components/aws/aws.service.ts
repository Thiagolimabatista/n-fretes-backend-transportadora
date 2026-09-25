import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';

@Injectable()
export class AwsService {
  private s3: AWS.S3;
  private rekognition: AWS.Rekognition;

  constructor(private configService: ConfigService) {
    AWS.config.update({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
      accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
    });

    this.s3 = new AWS.S3();
    this.rekognition = new AWS.Rekognition();
  }

  async uploadFile(
    bucketName: string,
    key: string,
    fileContent: Buffer,
  ): Promise<string> {
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: fileContent,
      ContentType: 'image/jpeg',
    };

    const uploadResult = await this.s3.upload(params).promise();
    return uploadResult.Location;
  }

  async uploadDocument(
    bucketName: string,
    key: string,
    fileContent: Buffer,
    mimeType: string,
  ): Promise<string> {
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: fileContent,
      ContentType: mimeType,
    };

    const uploadResult = await this.s3.upload(params).promise();
    return uploadResult.Location;
  }

  /** Apaga arquivos do bucket (até 1000 por chamada; chaves vazias são ignoradas). */
  async deleteObjects(bucketName: string, keys: string[]): Promise<void> {
    const objects = keys.filter(Boolean).map((Key) => ({ Key }));
    if (!bucketName || !objects.length) return;
    await this.s3
      .deleteObjects({ Bucket: bucketName, Delete: { Objects: objects, Quiet: true } })
      .promise();
  }

  async compareFaces(sourceImage: Buffer, targetImage: Buffer) {
    const params = {
      SourceImage: { Bytes: sourceImage },
      TargetImage: { Bytes: targetImage },
      SimilarityThreshold: 70,
    };

    const result = await this.rekognition.compareFaces(params).promise();
    return result.FaceMatches;
  }

  /**
   * Sobe uma imagem em data URL. `keyPrefix` vai sem extensão: o nome ganha
   * data/hora e a extensão do tipo real da imagem, então cada troca gera uma
   * URL nova (sem ficar presa em cache de navegador ou CDN).
   */
  async uploadAvatar(
    bucketName: string,
    keyPrefix: string,
    base64String: string,
  ): Promise<string> {
    const mime = /^data:(image\/[\w.+-]+);base64,/.exec(base64String)?.[1] ?? 'image/jpeg';
    const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime] ?? 'jpg';
    const base64Data = base64String.replace(/^data:image\/[\w.+-]+;base64,/, '');

    const buffer = Buffer.from(base64Data, 'base64');

    const params = {
      Bucket: bucketName,
      Key: `${keyPrefix}-${Date.now()}.${ext}`,
      Body: buffer,
      ContentType: mime,
      CacheControl: 'public, max-age=31536000, immutable',
    };

    const uploadResult = await this.s3.upload(params).promise();
    return uploadResult.Location;
  }
}
