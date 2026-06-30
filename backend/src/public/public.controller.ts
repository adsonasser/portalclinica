import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { PublicService } from './public.service';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Post('register')
  register(@Body() body: any) {
    return this.publicService.register(body);
  }

  @Get('confirm-email')
  confirmEmail(@Query('token') token: string) {
    return this.publicService.confirmEmail(token);
  }

  @Post('resend-confirmation')
  resendConfirmation(@Body() body: { email: string }) {
    return this.publicService.resendConfirmation(body.email);
  }
}
