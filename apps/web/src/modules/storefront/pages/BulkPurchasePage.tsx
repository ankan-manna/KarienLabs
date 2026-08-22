import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  createDistributorEnquiry,
  getDistributorEnquiryConfig,
  requestDistributorEnquiryOtp,
  resendDistributorEnquiryOtp,
  verifyDistributorEnquiryOtp,
  type RequestedProductInput,
} from '../../../api/distributor-enquiries.api';
import { listProducts, type PublicProduct } from '../../../api/products-public.api';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { EmptyState } from '../../../components/common/EmptyState';
import { Input } from '../../../components/common/Input';
import { Skeleton } from '../../../components/common/Skeleton';
import { Textarea } from '../../../components/common/Textarea';
import { useDebounce } from '../../../hooks/useDebounce';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { trackDistributorEnquirySubmitted } from '../../../lib/analytics';
import {
  distributorEnquiryFormSchema,
  distributorOtpCodeSchema,
  type DistributorEnquiryFormValues,
  type DistributorOtpCodeFormValues,
} from '../../../validators/distributor-enquiry.validators';

interface SelectedProduct extends RequestedProductInput {
  name: string;
  sku: string;
}

/** Inline, debounced product/SKU search — adds a picked product with a quantity to the running list below. Not a shared component: this page is the only place a distributor picks catalog items by quantity for an enquiry (not a cart). */
function ProductPicker({
  selected,
  onAdd,
}: {
  selected: SelectedProduct[];
  onAdd: (product: PublicProduct) => void;
}) {
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebounce(term, 300);

  const { data, isFetching } = useQuery({
    queryKey: ['bulk-purchase-product-search', debouncedTerm],
    queryFn: () => listProducts({ search: debouncedTerm, limit: 8 }),
    enabled: debouncedTerm.trim().length >= 2,
  });

  const alreadySelected = new Set(selected.map((s) => s.productId));

  return (
    <div className="relative">
      <Input
        label="Search products / SKUs (optional)"
        placeholder="e.g. Paracetamol 500mg"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      {debouncedTerm.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-night-border dark:bg-night-surface">
          {isFetching ? (
            <div className="p-3 text-sm text-gray-500">Searching…</div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">No matching products found.</div>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {data.items.map((product) => (
                <li key={product._id}>
                  <button
                    type="button"
                    disabled={alreadySelected.has(product._id)}
                    onClick={() => {
                      onAdd(product);
                      setTerm('');
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-night-elevated"
                  >
                    <span>
                      {product.name} <span className="text-gray-400">({product.sku})</span>
                    </span>
                    {alreadySelected.has(product._id) && <Badge tone="gray">Added</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function BulkPurchasePage() {
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [step, setStep] = useState<'form' | 'otp' | 'success'>('form');
  const [enquiryNumber, setEnquiryNumber] = useState<string | null>(null);
  const [contactVerificationToken, setContactVerificationToken] = useState<string | null>(null);
  const [otpChallenge, setOtpChallenge] = useState<
    { maskedContact: string; cooldownRemaining: number; devOnlyCode?: string } | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);

  useDocumentMeta({
    title: 'Distributor & Bulk Purchase Enquiry',
    description:
      'Buy medicines and healthcare products in bulk. Submit a distributor or wholesale purchase enquiry and our business team will get in touch with pricing and availability.',
    canonical: '/bulk-purchase',
  });

  const { data: config, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['distributor-enquiry-config'],
    queryFn: getDistributorEnquiryConfig,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<DistributorEnquiryFormValues>({ resolver: zodResolver(distributorEnquiryFormSchema) });

  const {
    register: registerOtp,
    handleSubmit: handleOtpSubmit,
    formState: { errors: otpErrors, isSubmitting: isVerifyingOtp },
  } = useForm<DistributorOtpCodeFormValues>({ resolver: zodResolver(distributorOtpCodeSchema) });

  function addProduct(product: PublicProduct) {
    setSelectedProducts((prev) => [
      ...prev,
      { productId: product._id, name: product.name, sku: product.sku, requestedQuantity: 1 },
    ]);
  }

  function updateQuantity(productId: string, quantity: number) {
    setSelectedProducts((prev) =>
      prev.map((p) => (p.productId === productId ? { ...p, requestedQuantity: quantity } : p)),
    );
  }

  function removeProduct(productId: string) {
    setSelectedProducts((prev) => prev.filter((p) => p.productId !== productId));
  }

  async function submitEnquiry(values: DistributorEnquiryFormValues, token: string | null) {
    setIsSubmitting(true);
    setFormError(null);
    try {
      const result = await createDistributorEnquiry({
        companyName: values.companyName,
        contactPerson: values.contactPerson,
        email: values.email,
        mobile: values.mobile,
        gstin: values.gstin || undefined,
        businessAddress: values.businessAddress,
        city: values.city,
        state: values.state,
        pincode: values.pincode,
        message: values.message || undefined,
        requestedProducts: selectedProducts.map(({ productId, requestedQuantity }) => ({
          productId,
          requestedQuantity,
        })),
        contactVerificationToken: token ?? undefined,
      });
      setEnquiryNumber(result.enquiryNumber);
      setStep('success');
      trackDistributorEnquirySubmitted();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit your enquiry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onSubmit(values: DistributorEnquiryFormValues) {
    setFormError(null);
    if (config?.otpRequired && !contactVerificationToken) {
      setIsRequestingOtp(true);
      try {
        const result = await requestDistributorEnquiryOtp(values.email);
        setOtpChallenge({
          maskedContact: result.maskedContact,
          cooldownRemaining: result.resendCooldownSeconds,
          devOnlyCode: result.devOnlyCode,
        });
        setStep('otp');
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Could not send verification code.');
      } finally {
        setIsRequestingOtp(false);
      }
      return;
    }
    await submitEnquiry(values, null);
  }

  async function onSubmitOtp(otpValues: DistributorOtpCodeFormValues) {
    setFormError(null);
    const email = getValues('email');
    try {
      const { contactVerificationToken: token } = await verifyDistributorEnquiryOtp(email, otpValues.code);
      setContactVerificationToken(token);
      await submitEnquiry(getValues(), token);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'OTP verification failed.');
    }
  }

  async function onResendOtp() {
    setFormError(null);
    try {
      const result = await resendDistributorEnquiryOtp(getValues('email'));
      setOtpChallenge({
        maskedContact: result.maskedContact,
        cooldownRemaining: result.resendCooldownSeconds,
        devOnlyCode: result.devOnlyCode,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not resend code.');
    }
  }

  if (step === 'success' && enquiryNumber) {
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <Badge tone="green">Enquiry received</Badge>
        <h1 className="mt-3 text-lg font-semibold text-gray-900 dark:text-night-text">
          Thank you for your enquiry
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Your reference number is <span className="font-mono font-semibold">{enquiryNumber}</span>. Our
          business team will contact you shortly to discuss availability and pricing.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          This is an enquiry only — no order has been placed and no payment has been taken.
        </p>
      </Card>
    );
  }

  if (isLoadingConfig) {
    return <Skeleton className="mx-auto h-96 w-full max-w-3xl" />;
  }

  if (config && !config.enquiryEnabled) {
    return (
      <EmptyState
        title="Distributor enquiries are currently unavailable"
        description="Please check back later, or reach out via our Contact Us page."
      />
    );
  }

  if (step === 'otp' && otpChallenge) {
    return (
      <form
        onSubmit={handleOtpSubmit(onSubmitOtp)}
        className="mx-auto flex max-w-md flex-col gap-4"
      >
        <h1 className="text-lg font-semibold text-gray-900 dark:text-night-text">Verify your email</h1>
        <p className="text-sm text-gray-500">
          We sent a verification code to <span className="font-medium">{otpChallenge.maskedContact}</span>.
          Enter it below to submit your enquiry.
        </p>

        {formError && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20">{formError}</p>
        )}
        {otpChallenge.devOnlyCode && (
          <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20">
            Dev-mode only — code: <span className="font-mono font-semibold">{otpChallenge.devOnlyCode}</span>
          </p>
        )}

        <Input
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          error={otpErrors.code?.message}
          {...registerOtp('code')}
        />

        <Button variant="gradient" type="submit" isLoading={isVerifyingOtp || isSubmitting} className="w-full">
          Verify &amp; submit enquiry
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button type="button" className="font-medium text-brand-600 hover:underline" onClick={onResendOtp}>
            Resend code
          </button>
          <button
            type="button"
            className="text-gray-500 hover:underline"
            onClick={() => {
              setStep('form');
              setFormError(null);
            }}
          >
            Back to form
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-night-text">
          Distributor &amp; Bulk Purchase Enquiry
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-night-muted">
          Looking to buy medicines or healthcare products in bulk for your pharmacy, clinic, or
          distribution business? Tell us what you need below and our business team will reach out
          with availability, pricing, and next steps. This form is for wholesale/business enquiries
          only — for general questions, please use our{' '}
          <a href="/contact" className="text-brand-600 hover:underline">
            Contact Us
          </a>{' '}
          page instead.
        </p>
      </div>

      <Card className="p-5">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {formError && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Company / Distributor Name"
              error={errors.companyName?.message}
              {...register('companyName')}
            />
            <Input
              label="Contact Person"
              error={errors.contactPerson?.message}
              {...register('contactPerson')}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
            <Input label="Mobile Number" error={errors.mobile?.message} {...register('mobile')} />
          </div>
          <Input
            label="GSTIN (optional)"
            placeholder="15-character GSTIN"
            error={errors.gstin?.message}
            {...register('gstin')}
          />
          <Textarea
            label="Business Address"
            error={errors.businessAddress?.message}
            {...register('businessAddress')}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="City" error={errors.city?.message} {...register('city')} />
            <Input label="State" error={errors.state?.message} {...register('state')} />
            <Input label="Pincode" error={errors.pincode?.message} {...register('pincode')} />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-night-text">
              Products / SKUs of Interest (optional)
            </h2>
            <ProductPicker selected={selectedProducts} onAdd={addProduct} />
            {selectedProducts.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {selectedProducts.map((p) => (
                  <li
                    key={p.productId}
                    className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-2 text-sm dark:border-night-border"
                  >
                    <span className="truncate">
                      {p.name} <span className="text-gray-400">({p.sku})</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={1_000_000}
                        value={p.requestedQuantity}
                        onChange={(e) => updateQuantity(p.productId, Math.max(1, Number(e.target.value) || 1))}
                        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm dark:border-night-border dark:bg-night-elevated"
                        aria-label={`Quantity for ${p.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeProduct(p.productId)}
                        className="text-red-500 hover:underline"
                        aria-label={`Remove ${p.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Textarea
            label="Message / Requirement"
            placeholder="Tell us about your requirement — expected order frequency, delivery location, etc."
            error={errors.message?.message}
            {...register('message')}
          />

          <Button variant="gradient" type="submit" isLoading={isSubmitting || isRequestingOtp} className="w-full">
            Submit Enquiry
          </Button>
          <p className="text-center text-xs text-gray-400">
            This is a business enquiry, not an order — no payment will be taken.
          </p>
        </form>
      </Card>
    </div>
  );
}
