import { logger } from '../../config/logger';

export interface SendPushInput {
  to: string; // device push token
  title: string;
  body: string;
}

/**
 * Pluggable push transport. No push provider (FCM/APNs) is wired up — ships as
 * a working log-based transport, same rationale as email/sms-transport.ts.
 */
export async function sendPush(input: SendPushInput): Promise<void> {
  logger.info({ to: input.to }, '[push-transport:log-only] No push provider configured — logging instead of sending');
}
