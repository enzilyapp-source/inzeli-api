import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../auth/admin.guard';
import { err, ok } from '../common/api';

type BroadcastBody = {
  titleAr?: string;
  messageAr?: string;
  title?: string;
  message?: string;
  data?: Record<string, unknown>;
};

@Controller('admin/notifications')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class AdminUsersNotificationsController {
  private readonly oneSignalAppId = process.env.ONESIGNAL_APP_ID || '';
  private readonly oneSignalRestApiKey =
    process.env.ONESIGNAL_REST_API_KEY || '';

  @Post('broadcast')
  async broadcast(@Body() body: BroadcastBody) {
    const titleAr = (body?.titleAr || '').trim();
    const messageAr = (body?.messageAr || '').trim();
    const titleEn = (body?.title || titleAr || '').trim();
    const messageEn = (body?.message || messageAr || '').trim();

    if (!titleAr || !messageAr) {
      return err('Missing title or message', 'MISSING_FIELDS');
    }

    if (!this.oneSignalAppId || !this.oneSignalRestApiKey) {
      return err('Missing OneSignal env', 'ONESIGNAL_ENV_MISSING');
    }

    const payload = {
      app_id: this.oneSignalAppId,
      included_segments: ['All'],
      channel_for_external_user_ids: 'push',
      headings: {
        ar: titleAr,
        en: titleEn || titleAr,
      },
      contents: {
        ar: messageAr,
        en: messageEn || messageAr,
      },
      data: {
        type: 'admin_broadcast',
        ...(body?.data ?? {}),
      },
      ios_badgeType: 'Increase',
      ios_badgeCount: 1,
    };

    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${this.oneSignalRestApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    let parsed: any = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = raw;
    }

    if (!res.ok) {
      const errorMessage =
        parsed?.errors?.[0] ||
        parsed?.error ||
        parsed?.message ||
        'Push failed';
      return err(String(errorMessage), 'ONESIGNAL_SEND_FAILED');
    }

    return ok('Broadcast sent', parsed ?? payload);
  }
}
