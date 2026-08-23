import { logger } from '../../config/logger';

export interface SendWhatsAppInput {
  to: string;
  body: string;
}

/**
 * Pluggable WhatsApp transport — same log-only-until-a-real-provider-is-wired
 * pattern as sms-transport.ts (no Twilio/Gupshup/WhatsApp Cloud API account
 * configured yet). Added for  10's OTP channel requirement
 * (otpChannel: 'whatsapp'); swapping in a real provider is a one-file change.
 */
export async function sendWhatsApp(input: SendWhatsAppInput): Promise<void> {
  logger.info(
    { to: input.to },
    '[whatsapp-transport:log-only] No WhatsApp provider configured — logging instead of sending',
  );
}
