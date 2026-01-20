import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { DewanyahService } from './dewanyah.service';
import { ok, err } from '../common/api';
import { AuthGuard } from '@nestjs/passport';

@Controller('admin/dewanyah')
export class AdminDewanyahController {
  constructor(private readonly dewanyah: DewanyahService) {}

  // List all dewanyahs (admin)
  @UseGuards(AuthGuard('jwt'))
  @Get()
  async listAll() {
    try {
      return ok('Dewanyahs', await this.dewanyah.listAllAdmin());
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // List creation requests (pending/approved)
  @UseGuards(AuthGuard('jwt'))
  @Get('requests')
  async listRequests() {
    try {
      return ok('Requests', await this.dewanyah.listRequests());
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // Approve & create dewanyah board
  @UseGuards(AuthGuard('jwt'))
  @Patch('requests/:id/approve')
  async approve(@Req() req: any, @Param('id') id: string) {
    try {
      const adminUserId = req.user?.userId;
      const data = await this.dewanyah.approveRequest(id, adminUserId);
      return ok('Approved', data);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // Add game to existing dewanyah
  @UseGuards(AuthGuard('jwt'))
  @Post(':id/games')
  async addGame(@Param('id') id: string, @Body() body: any) {
    try {
      const gameId = (body?.gameId ?? '').trim();
      if (!gameId) return err('gameId required', 'VALIDATION');
      const data = await this.dewanyah.addGameToDewanyah(id, gameId);
      return ok('Game added', data);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // Create dewanyah directly (admin)
  @UseGuards(AuthGuard('jwt'))
  @Post()
  async createDirect(@Body() body: any) {
    try {
      const name = (body?.name ?? '').trim();
      const gameId = (body?.gameId ?? '').trim();
      if (!name || !gameId) return err('name/gameId required', 'VALIDATION');
      const data = await this.dewanyah.createDewanyahManual({
        name,
        ownerName: body?.owner,
        ownerEmail: body?.ownerEmail,
        ownerUserId: body?.ownerUserId,
        note: body?.note,
        gameId,
        requireApproval: body?.requireApproval,
        locationLock: body?.locationLock,
        radiusMeters: body?.lockRadius ?? body?.radiusMeters,
        imageUrl: body?.imageUrl,
        themePrimary: body?.themePrimary,
        themeAccent: body?.themeAccent,
      });
      return ok('Created dewanyah', data);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // Update dewanyah
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    try {
      const data = {
        name: body?.name,
        ownerName: body?.ownerName,
        ownerEmail: body?.ownerEmail,
        note: body?.note,
        imageUrl: body?.imageUrl,
        themePrimary: body?.themePrimary,
        themeAccent: body?.themeAccent,
      };
      const r = await this.dewanyah.updateDewanyah(id, data);
      return ok('Updated dewanyah', r);
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }

  // Delete dewanyah
  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  async delete(@Param('id') id: string) {
    try {
      await this.dewanyah.deleteDewanyah(id);
      return ok('Deleted dewanyah', { id });
    } catch (e: any) {
      return err(e?.message || 'Failed', e?.message);
    }
  }
}
