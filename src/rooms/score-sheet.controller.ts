import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ok } from '../common/api';
import { ScoreSheetService } from './score-sheet.service';

@Controller('rooms/:code/score-sheet')
@UseGuards(AuthGuard('jwt'))
export class ScoreSheetController {
  constructor(private sheets: ScoreSheetService) {}
  private uid(req: any): string {
    return req.user?.userId || req.user?.id || req.user?.sub || req.user?.uid;
  }
  @Get() async read(@Param('code') code: string, @Req() req: any) {
    return ok('Score sheet', await this.sheets.read(code, this.uid(req)));
  }
  @Get('roster') async roster(@Param('code') code: string, @Req() req: any) {
    return ok('Score roster', {
      players: await this.sheets.roster(code, this.uid(req)),
    });
  }
  @Put() async write(
    @Param('code') code: string,
    @Req() req: any,
    @Body() body: any,
  ) {
    return ok(
      'Score sheet saved',
      await this.sheets.write(code, this.uid(req), body),
    );
  }
}
