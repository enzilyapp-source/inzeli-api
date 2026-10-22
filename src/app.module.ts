// src/app.module.ts
import { OperationsModule } from './operations/operations.module';
import { Module } from '@nestjs/common';
import { RoomsModule } from './rooms/rooms.module';
import { AuthModule } from './auth/auth.module';
import { MatchesModule } from './matches/matches.module';
import { UsersModule } from './users/users.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { SponsorsModule } from './sponsors/sponsors.module';
import { PingController } from './ping.controller';
import { StoreModule } from './store/store.module';
import { DewanyahModule } from './dewanyah/dewanyah.module';
import { TimelineModule } from './timeline/timeline.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    OperationsModule,
    RoomsModule,
    AuthModule,
    MatchesModule,
    UsersModule,
    SponsorsModule,
    LeaderboardModule,
    StoreModule,
    DewanyahModule,
    TimelineModule,
    NotificationsModule,
  ],
  controllers: [PingController], // ✅ مهم عشان /api/ping
})
export class AppModule {}
