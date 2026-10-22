import { BadRequestException } from '@nestjs/common';

/** Validate admin input before persisting a venue geofence. */
export function validateLocationConfig(data: {
  anchorLat?: number | null;
  anchorLng?: number | null;
  radiusMeters?: number | null;
}) {
  const { anchorLat: lat, anchorLng: lng, radiusMeters: radius } = data;
  if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90))
    throw new BadRequestException('INVALID_LATITUDE');
  if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180))
    throw new BadRequestException('INVALID_LONGITUDE');
  if (
    radius != null &&
    (!Number.isFinite(radius) || radius < 1 || radius > 100000)
  )
    throw new BadRequestException('النطاق يجب أن يكون بين ١ و١٠٠٠٠٠ متر');
}
