export const APP_NOTIFICATION_KIND = 'APP_NOTIFICATION';

export type AppNotificationMeta = {
  notificationType: string;
  titleAr: string;
  messageAr: string;
  titleEn?: string;
  messageEn?: string;
  data?: Record<string, unknown>;
  source?: string;
};
