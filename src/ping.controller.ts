// src/ping.controller.ts
import { Controller, Get, Redirect } from '@nestjs/common';

@Controller()
export class PingController {
  // GET /  -> redirects to /api/ping (global prefix adds /api)
  @Get()
  @Redirect('ping', 302)
  root() {}

  // GET /api/ping
  @Get('ping')
  ping() {
    return { ok: true, time: new Date().toISOString() };
  }
}
