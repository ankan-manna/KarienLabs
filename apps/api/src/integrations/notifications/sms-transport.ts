import { logger } from '../../config/logger';

export interface SendSmsInput {
  to: string;
  body: string;
}

/**
 * Pluggable SMS transport. No SMS provider (Twilio/MSG91/etc.) is wired up —
 * this ships as a working log-based transport so the queue/worker/retry
 * pipeline is fully real and testable. Swapping in a real provider is a
 * one-file change: replace the body of `sendSms` with the provider's API call.
 */
export async function sendSms(input: SendSmsInput): Promise<void> {
  logger.info({ to: input.to }, '[sms-transport:log-only] No SMS provider configured — logging instead of sending');
}
