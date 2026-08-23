import { getConfiguration } from '../platform/configuration.service';

/**
 * shape of the `address_verification` Configuration namespace
 * (Part 44/45), stored/edited through the EXISTING Configuration Engine
 * (superadmin ConfigurationPage -> PUT /platform/configuration/
 * address_verification) — not a parallel settings surface, mirrors
 * auth-config.service.ts's simple get-plus-defaults shape (no cross-field
 * validation needed for three independent booleans).
 *
 * `pincodeValidationEnabled`/`serviceabilityCheckEnabled` default ON: Part
 * 1's business requirement frames pincode validation and pre-payment
 * delivery-serviceability as urgent correctness/security gaps to close, not
 * optional convenience — same reasoning as `registrationOtpEnabled`'s
 * default (see auth-config.service.ts).
 *
 * `mobileVerificationEnabled` defaults OFF (business correction, see
 * _7_EMAIL_VERIFICATION_CORRECTION_REPORT.md): SMS OTP delivery isn't
 * currently reliable/configured, so gating checkout on a per-address SMS
 * verification was blocking real customers from completing purchases. Each
 * flag stays independently switchable — a super admin can still turn this
 * back on later without code changes once SMS delivery is reliable.
 */
export interface AddressVerificationConfig {
  pincodeValidationEnabled: boolean;
  mobileVerificationEnabled: boolean;
  serviceabilityCheckEnabled: boolean;
}

export const DEFAULT_ADDRESS_VERIFICATION_CONFIG: AddressVerificationConfig = {
  pincodeValidationEnabled: true,
  mobileVerificationEnabled: false,
  serviceabilityCheckEnabled: true,
};

export async function getAddressVerificationConfig(): Promise<AddressVerificationConfig> {
  const raw = (await getConfiguration('address_verification')) as Partial<
    Record<keyof AddressVerificationConfig, unknown>
  >;

  return {
    pincodeValidationEnabled:
      raw.pincodeValidationEnabled === undefined
        ? DEFAULT_ADDRESS_VERIFICATION_CONFIG.pincodeValidationEnabled
        : Boolean(raw.pincodeValidationEnabled),
    mobileVerificationEnabled:
      raw.mobileVerificationEnabled === undefined
        ? DEFAULT_ADDRESS_VERIFICATION_CONFIG.mobileVerificationEnabled
        : Boolean(raw.mobileVerificationEnabled),
    serviceabilityCheckEnabled:
      raw.serviceabilityCheckEnabled === undefined
        ? DEFAULT_ADDRESS_VERIFICATION_CONFIG.serviceabilityCheckEnabled
        : Boolean(raw.serviceabilityCheckEnabled),
  };
}

/** Public, unauthenticated-safe subset — the frontend needs this before/without a session to decide which address-form/checkout UI to render (pincode-check spinner, mobile-OTP step, "we don't deliver here" messaging). No thresholds/secrets, just booleans, same posture as getPublicAuthConfig. */
export async function getPublicAddressVerificationConfig(): Promise<AddressVerificationConfig> {
  return getAddressVerificationConfig();
}
