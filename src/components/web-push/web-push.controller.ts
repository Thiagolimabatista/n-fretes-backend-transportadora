import { BadRequestException, Body, Controller, Delete, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { Actor, GetActor } from 'src/decorators/get-actor.decorator';
import { BrowserSubscription, WebPushService } from './web-push.service';

@UseGuards(JwtAuthGuard)
@Controller('web-push')
export class WebPushController {
  constructor(private readonly webPush: WebPushService) {}

  /** Chave pública VAPID para o navegador se inscrever (não é segredo). */
  @Get('config')
  async config(@Query('endpoint') endpoint: string | undefined, @GetActor() actor: Actor) {
    return {
      enabled: this.webPush.isEnabled,
      publicKey: this.webPush.isEnabled ? this.webPush.publicKey : null,
      subscribed: endpoint ? await this.webPush.isSubscribed(actor.companyId, endpoint) : false,
    };
  }

  @Post('subscribe')
  async subscribe(
    @GetActor() actor: Actor,
    @Body() body: BrowserSubscription,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      throw new BadRequestException('Inscrição do navegador inválida.');
    }
    if (!/^https:\/\//.test(body.endpoint)) {
      throw new BadRequestException('Endereço de push inválido.');
    }
    await this.webPush.subscribe(actor.companyId, actor.contactId, body, userAgent);
    return { message: 'Notificações ativadas neste aparelho.' };
  }

  @Delete('subscribe')
  async unsubscribe(@GetActor() actor: Actor, @Body('endpoint') endpoint: string) {
    if (!endpoint) throw new BadRequestException('Informe o endereço da inscrição.');
    await this.webPush.unsubscribe(actor.companyId, endpoint);
    return { message: 'Notificações desativadas neste aparelho.' };
  }
}
