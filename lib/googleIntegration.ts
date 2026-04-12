export type GoogleIntegrationState = {
  connected: boolean;
  email?: string;
  updatedAt?: number;
  hasCalendarScope: boolean;
  hasDriveScope: boolean;
  calendarEnabled: boolean;
  driveEnabled: boolean;
};

export function canUseGoogleCalendar(integration?: GoogleIntegrationState | null) {
  return !!(integration?.connected && integration.hasCalendarScope && integration.calendarEnabled);
}

export function canUseGoogleDrive(integration?: GoogleIntegrationState | null) {
  return !!(integration?.connected && integration.hasDriveScope && integration.driveEnabled);
}
