import { getConfiguration } from '../platform/configuration.service';

/**
 * shape of the `distributor_enquiry` Configuration namespace
 * (Part 36), stored/edited through the EXISTING Configuration Engine
 * (superadmin ConfigurationPage -> PUT /platform/configuration/
 * distributor_enquiry), mirroring auth-config.service.ts's simple
 * get-plus-defaults shape.
 */
export interface DistributorEnquiryConfig {
  enquiryEnabled: boolean;
  otpRequired: boolean;
  emailNotificationsEnabled: boolean;
}

export const DEFAULT_DISTRIBUTOR_ENQUIRY_CONFIG: DistributorEnquiryConfig = {
  enquiryEnabled: true,
  // Off by default — Part 12's own guidance ("do not make the form unusable
  // for legitimate distributors") plus the plain rate limiter already on
  // both the enquiry-create and OTP endpoints; a super admin opts into the
  // extra verification step if spam becomes a real problem.
  otpRequired: false,
  emailNotificationsEnabled: true,
};

export async function getDistributorEnquiryConfig(): Promise<DistributorEnquiryConfig> {
  const raw = (await getConfiguration('distributor_enquiry')) as Partial<
    Record<keyof DistributorEnquiryConfig, unknown>
  >;

  return {
    enquiryEnabled:
      raw.enquiryEnabled === undefined
        ? DEFAULT_DISTRIBUTOR_ENQUIRY_CONFIG.enquiryEnabled
        : Boolean(raw.enquiryEnabled),
    otpRequired:
      raw.otpRequired === undefined
        ? DEFAULT_DISTRIBUTOR_ENQUIRY_CONFIG.otpRequired
        : Boolean(raw.otpRequired),
    emailNotificationsEnabled:
      raw.emailNotificationsEnabled === undefined
        ? DEFAULT_DISTRIBUTOR_ENQUIRY_CONFIG.emailNotificationsEnabled
        : Boolean(raw.emailNotificationsEnabled),
  };
}

/** Public, unauthenticated-safe subset — the /bulk-purchase page needs this before/without a session to know whether to render the OTP step, or whether to render the page's CTA at all (Part 36: frontend hides when disabled, but the backend enforcement in distributor-enquiry.service.ts is what actually matters). */
export async function getPublicDistributorEnquiryConfig(): Promise<DistributorEnquiryConfig> {
  return getDistributorEnquiryConfig();
}
