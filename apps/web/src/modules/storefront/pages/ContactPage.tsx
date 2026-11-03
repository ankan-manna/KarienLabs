import { useState } from 'react';

import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { Input } from '../../../components/common/Input';
import { Textarea } from '../../../components/common/Textarea';
import { Breadcrumb } from '../../../components/layout/Breadcrumb';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { toast } from '../../../utils/toast';

/**
 * No ticketing/support-inbox backend exists yet (spec marks "Raise Ticket" and
 * "Live Chat" as future-ready) — submission is client-only and shows a success
 * toast rather than silently failing or blocking the page. A real implementation
 * would POST to a `/support/contact` endpoint that creates a ticket or emails
 * the support inbox.
 */
export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  useDocumentMeta({
    title: 'Contact Us',
    description: 'Get in touch with the BRENTIS HEALTHCARE support team.',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error('Please fill in all fields');
      return;
    }
    setSubmitted(true);
    toast.success("Message sent — we'll get back to you within 24 hours.");
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Contact Us' }]} />
      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <h1 className="font-brentis-display text-2xl font-semibold text-ink dark:text-night-text sm:text-3xl">
            Contact Us
          </h1>
          <p className="mb-6 mt-2 text-sm text-gray-600 dark:text-night-muted">
            Have a question about an order, a medicine, or your prescription? Reach out and our
            pharmacist-support team will help.
          </p>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium text-ink dark:text-night-text">Email</dt>
              <dd className="text-gray-500 dark:text-night-muted">support@medcommerce.example</dd>
            </div>
            <div>
              <dt className="font-medium text-ink dark:text-night-text">Phone</dt>
              <dd className="text-gray-500 dark:text-night-muted">+91 1800-000-000 (9am–9pm IST)</dd>
            </div>
            <div>
              <dt className="font-medium text-ink dark:text-night-text">Address</dt>
              {/* Placeholder address — confirmed not a real business address
                  (no street/pincode); see docs/BRENTIS_SEO_GEO_AEO_STRATEGY.md
                  §6/§9. Needs a real address from the business before launch;
                  keeping the brand name consistent with the rest of the site
                  in the meantime rather than leaving the old one showing. */}
              <dd className="text-gray-500 dark:text-night-muted">
                BRENTIS HEALTHCARE HQ, Bengaluru, Karnataka, India
              </dd>
            </div>
          </dl>
        </div>

        <Card className="p-5 sm:p-6">
          {submitted ? (
            <p className="text-sm text-gray-600 dark:text-night-muted">
              Thanks for reaching out — we&apos;ve received your message.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Input
                label="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              <Textarea
                label="Message"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              />
              <Button type="submit" variant="coral">
                Send message
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
