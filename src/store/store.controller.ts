// src/store/store.controller.ts
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { StoreService } from './store.service';
import { ok, err } from '../common/api';
import { AuthGuard } from '@nestjs/passport';

@Controller('store')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get()
  async list() {
    try {
      return ok('Store items', await this.store.list());
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async myItems(@Req() req: any) {
    try {
      const userId = req.user.userId;
      return ok('My items', await this.store.myItems(userId));
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/buy')
  async buy(@Req() req: any, @Param('id') id: string) {
    try {
      const userId = req.user.userId;
      return ok('Purchased', await this.store.buy(userId, id));
    } catch (e: any) {
      return err(e?.message || 'Purchase failed', e?.message);
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('apply')
  async apply(@Req() req: any, @Body() body: { themeId?: string | null; frameId?: string | null; cardId?: string | null }) {
    try {
      const userId = req.user.userId;
      return ok('Applied', await this.store.apply(userId, body ?? {}));
    } catch (e: any) {
      return err(e?.message || 'Apply failed', e?.message);
    }
  }
}
