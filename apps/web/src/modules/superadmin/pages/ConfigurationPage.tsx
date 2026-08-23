import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getConfiguration, setConfiguration } from '../../../api/super-admin.api';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { Input } from '../../../components/common/Input';
import { Select } from '../../../components/common/Select';
import { Skeleton } from '../../../components/common/Skeleton';
import { Switch } from '../../../components/common/Switch';
import { Textarea } from '../../../components/common/Textarea';
import { toast } from '../../../utils/toast';

type FieldType = 'text' | 'password' | 'number' | 'boolean' | 'textarea' | 'select';

interface Field {
  name: string;
  label: string;
  type: FieldType;
  options?: { label: string; value: string }[];
  placeholder?: string;
  /** Shown when the stored value is unset — must match the backend's own default (e.g. s3.client.ts's envCredentials()) so the toggle displayed here never lies about actual runtime behavior. */
  defaultBoolean?: boolean;
}

const NAMESPACE_FIELDS: Record<string, Field[]> = {
  global: [
    { name: 'applicationName', label: 'Application Name', type: 'text' },
    { name: 'logoUrl', label: 'Logo URL', type: 'text' },
    { name: 'faviconUrl', label: 'Favicon URL', type: 'text' },
    {
      name: 'theme',
      label: 'Theme',
      type: 'select',
      options: [
        { label: 'Light', value: 'light' },
        { label: 'Dark', value: 'dark' },
        { label: 'System', value: 'system' },
      ],
    },
    { name: 'timezone', label: 'Timezone', type: 'text', placeholder: 'Asia/Kolkata' },
    { name: 'currency', label: 'Currency', type: 'text', placeholder: 'INR' },
    { name: 'language', label: 'Language', type: 'text', placeholder: 'en' },
    { name: 'dateFormat', label: 'Date Format', type: 'text', placeholder: 'DD/MM/YYYY' },
    {
      name: 'timeFormat',
      label: 'Time Format',
      type: 'select',
      options: [
        { label: '12-hour', value: '12h' },
        { label: '24-hour', value: '24h' },
      ],
    },
    { name: 'maintenanceMode', label: 'Maintenance Mode', type: 'boolean' },
    { name: 'maintenanceMessage', label: 'Maintenance Message', type: 'textarea' },
  ],
  business: [
    { name: 'businessName', label: 'Business Name', type: 'text' },
    { name: 'gstNumber', label: 'GST Number', type: 'text' },
    { name: 'companyAddress', label: 'Company Address', type: 'textarea' },
    { name: 'supportEmail', label: 'Support Email', type: 'text' },
    { name: 'supportPhone', label: 'Support Phone', type: 'text' },
    { name: 'invoicePrefix', label: 'Invoice Prefix', type: 'text', placeholder: 'INV' },
    { name: 'orderPrefix', label: 'Order Prefix', type: 'text', placeholder: 'ORD' },
  ],
  payment: [
    { name: 'codEnabled', label: 'Cash on Delivery Enabled', type: 'boolean' },
    { name: 'paymentTimeoutMinutes', label: 'Payment Timeout (minutes)', type: 'number' },
    { name: 'refundRules', label: 'Refund Rules', type: 'textarea' },
  ],
  razorpay: [
    { name: 'keyId', label: 'Key ID', type: 'text' },
    { name: 'keySecret', label: 'Key Secret', type: 'password' },
    { name: 'webhookSecret', label: 'Webhook Secret', type: 'password' },
  ],
  cloudinary: [
    { name: 'cloudName', label: 'Cloud Name', type: 'text' },
    { name: 'apiKey', label: 'API Key', type: 'text' },
    { name: 'apiSecret', label: 'API Secret', type: 'password' },
    { name: 'folderPrefix', label: 'Folder Prefix', type: 'text' },
    { name: 'allowedFileTypes', label: 'Allowed File Types', type: 'text', placeholder: 'jpg,png,pdf' },
    { name: 'maxFileSizeMb', label: 'Max File Size (MB)', type: 'number' },
  ],
  gst: [
    { name: 'gstEnabled', label: 'GST Enabled', type: 'boolean' },
    { name: 'defaultGstRate', label: 'Default GST Rate (%)', type: 'number' },
    {
      name: 'taxCalculationMethod',
      label: 'Tax Calculation Method',
      type: 'select',
      options: [
        { label: 'Inclusive', value: 'inclusive' },
        { label: 'Exclusive', value: 'exclusive' },
      ],
    },
  ],
  shipping: [
    { name: 'flatRate', label: 'Flat Shipping Rate', type: 'number' },
    { name: 'freeShippingThreshold', label: 'Free Shipping Threshold', type: 'number' },
    { name: 'minOrderValue', label: 'Minimum Order Value', type: 'number' },
  ],
  email: [
    { name: 'senderName', label: 'Sender Name', type: 'text' },
    { name: 'senderEmail', label: 'Sender Email', type: 'text' },
    { name: 'retryAttempts', label: 'Retry Attempts', type: 'number' },
  ],
  sms: [
    {
      name: 'provider',
      label: 'SMS Provider',
      type: 'select',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Twilio', value: 'twilio' },
        { label: 'MSG91', value: 'msg91' },
      ],
    },
    { name: 'apiKey', label: 'API Key', type: 'password' },
    { name: 'senderId', label: 'Sender ID', type: 'text' },
    { name: 'otpExpiryMinutes', label: 'OTP Expiry (minutes)', type: 'number' },
  ],
  // OTP login/password-reset + admin Google OAuth toggles. See
  // apps/api/src/modules/auth/auth-config.service.ts for defaults/validation;
  // field names match the API's `authentication` namespace verbatim.
  authentication: [
    {
      name: 'registrationOtpEnabled',
      label: 'Require OTP Verification on Customer Registration',
      type: 'boolean',
    },
    { name: 'otpEnabled', label: 'OTP Authentication Enabled', type: 'boolean' },
    { name: 'otpLoginEnabled', label: 'Require OTP on Customer Login', type: 'boolean' },
    { name: 'otpPasswordResetEnabled', label: 'Require OTP for Password Reset', type: 'boolean' },
    {
      name: 'otpChannel',
      label: 'OTP Delivery Channel',
      type: 'select',
      options: [
        { label: 'Email', value: 'email' },
        { label: 'SMS', value: 'sms' },
        { label: 'WhatsApp', value: 'whatsapp' },
      ],
    },
    { name: 'otpLength', label: 'OTP Length (4-8 digits)', type: 'number' },
    { name: 'otpExpirySeconds', label: 'OTP Expiry (seconds)', type: 'number' },
    { name: 'otpMaxAttempts', label: 'OTP Max Verification Attempts', type: 'number' },
    { name: 'otpResendCooldownSeconds', label: 'OTP Resend Cooldown (seconds)', type: 'number' },
    { name: 'otpMaxResends', label: 'OTP Max Resends', type: 'number' },
    {
      name: 'googleAdminLoginEnabled',
      label: 'Admin "Continue with Google" Enabled',
      type: 'boolean',
    },
  ],
  // pincode validation / address mobile-OTP / mandatory
  // pre-payment Shiprocket serviceability gate toggles. See
  // apps/api/src/modules/customers/address-verification-config.service.ts.
  address_verification: [
    { name: 'pincodeValidationEnabled', label: 'Validate Address Pincode (Postal API)', type: 'boolean' },
    { name: 'mobileVerificationEnabled', label: 'Phone Verification Required', type: 'boolean' },
    {
      name: 'serviceabilityCheckEnabled',
      label: 'Require Delivery-Serviceability Check Before Payment',
      type: 'boolean',
    },
  ],
  // Distributor/Bulk Purchase enquiry enable/disable + OTP +
  // email-notification toggles. See
  // apps/api/src/modules/distributor-enquiries/distributor-enquiry-config.service.ts.
  distributor_enquiry: [
    { name: 'enquiryEnabled', label: 'Distributor/Bulk Purchase Enquiry Enabled', type: 'boolean' },
    { name: 'otpRequired', label: 'Require Contact OTP Verification', type: 'boolean' },
    { name: 'emailNotificationsEnabled', label: 'Send Admin/Confirmation Emails', type: 'boolean' },
  ],
  // Product Image Management — Super-Admin-configurable max sub/additional
  // images per product. See apps/api/src/modules/catalog/catalog-config.service.ts.
  catalog: [
    { name: 'maxSubImages', label: 'Maximum Sub Images per Product', type: 'number' },
  ],
  // S3 storage + retention for invoices/shipping labels/logs. Credentials
  // fall back to env vars when left blank here — see
  // apps/api/src/integrations/s3/s3.client.ts. The three "Upload ... to S3"
  // toggles are backend-enforced (document-storage.helper.ts /
  // log-archival.job.ts check them directly), not just UI state.
  s3: [
    { name: 'region', label: 'AWS Region', type: 'text', placeholder: 'us-east-1' },
    { name: 'bucket', label: 'S3 Bucket Name', type: 'text' },
    { name: 'accessKeyId', label: 'Access Key ID', type: 'text' },
    { name: 'secretAccessKey', label: 'Secret Access Key', type: 'password' },
    {
      name: 'endpoint',
      label: 'Custom S3 Endpoint (local dev / MinIO only)',
      type: 'text',
      placeholder: 'http://localhost:4568',
    },
    { name: 'uploadInvoiceToS3', label: 'Upload Invoice to S3', type: 'boolean', defaultBoolean: true },
    { name: 'invoiceRetentionDays', label: 'Invoice S3 Retention (days)', type: 'number' },
    { name: 'uploadLabelToS3', label: 'Upload Shipping Label to S3', type: 'boolean', defaultBoolean: true },
    { name: 'labelRetentionDays', label: 'Shipping Label S3 Retention (days)', type: 'number' },
    { name: 'uploadLogsToS3', label: 'Upload Logs to S3', type: 'boolean', defaultBoolean: true },
    { name: 'logRetentionDays', label: 'Log S3 Retention (days)', type: 'number' },
  ],
};

const NAMESPACES = Object.keys(NAMESPACE_FIELDS);

function fieldValue(values: Record<string, unknown>, field: Field): string | boolean {
  const raw = values[field.name];
  if (field.type === 'boolean') {
    if (raw == null && field.defaultBoolean != null) return field.defaultBoolean;
    return Boolean(raw);
  }
  return raw == null ? '' : String(raw);
}

export default function ConfigurationPage() {
  const [namespace, setNamespace] = useState('global');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['configuration', namespace],
    queryFn: () => getConfiguration(namespace),
  });

  useEffect(() => {
    setValues(data ?? {});
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => setConfiguration(namespace, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuration', namespace] });
      toast.success('Configuration saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function setField(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  const fields = NAMESPACE_FIELDS[namespace] ?? [];
  const isMaintenanceField = (name: string) => name === 'maintenanceMode' || name === 'maintenanceMessage';

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Configuration</h1>

      <Select
        label="Namespace"
        options={NAMESPACES.map((ns) => ({ label: ns, value: ns }))}
        value={namespace}
        onChange={(e) => setNamespace(e.target.value)}
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {namespace === 'global' && Boolean(values.maintenanceMode) && (
            <Card className="border-l-4 border-l-amber-500 bg-amber-50 p-4 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Maintenance Mode is ON — the storefront is currently blocked for non-admin users.
              </p>
            </Card>
          )}

          <Card className="flex flex-col gap-4 p-4">
            {fields
              .filter((f) => !isMaintenanceField(f.name))
              .map((field) => (
                <ConfigField key={field.name} field={field} values={values} onChange={setField} />
              ))}

            {namespace === 'global' && (
              <div className="mt-2 flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Maintenance Mode
                </h2>
                {fields
                  .filter((f) => isMaintenanceField(f.name))
                  .map((field) => (
                    <ConfigField key={field.name} field={field} values={values} onChange={setField} />
                  ))}
              </div>
            )}
          </Card>
        </>
      )}

      <Button className="w-fit" isLoading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
        Save configuration
      </Button>
    </div>
  );
}

function ConfigField({
  field,
  values,
  onChange,
}: {
  field: Field;
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
}) {
  const value = fieldValue(values, field);

  if (field.type === 'boolean') {
    return (
      <Switch
        label={field.label}
        checked={Boolean(value)}
        onChange={(checked) => onChange(field.name, checked)}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <Select
        label={field.label}
        value={String(value)}
        options={[{ label: 'Not set', value: '' }, ...(field.options ?? [])]}
        onChange={(e) => onChange(field.name, e.target.value)}
      />
    );
  }

  if (field.type === 'textarea') {
    return (
      <Textarea
        label={field.label}
        rows={3}
        value={String(value)}
        onChange={(e) => onChange(field.name, e.target.value)}
      />
    );
  }

  return (
    <Input
      label={field.label}
      type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
      placeholder={field.placeholder}
      value={String(value)}
      onChange={(e) =>
        onChange(field.name, field.type === 'number' ? Number(e.target.value) : e.target.value)
      }
    />
  );
}
