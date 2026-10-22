import { BadRequestException } from '@nestjs/common';

export function normalizeBoardColor(value?: string | null) {
  if (value == null) return undefined;
  const hex = value.trim().replace(/^#|^0x/i, '');
  if (!hex) return null;
  if (!/^(?:[a-f\d]{6}|[a-f\d]{8})$/i.test(hex))
    throw new BadRequestException('INVALID_THEME_COLOR');
  // Admin themes are opaque RGB; old Flutter AARRGGBB values are also accepted.
  return `#${hex.slice(-6).toUpperCase()}`;
}
