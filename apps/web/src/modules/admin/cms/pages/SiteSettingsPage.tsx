import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getConfiguration, setConfiguration } from '../../../../api/super-admin.api';
import { Button } from '../../../../components/common/Button';
import { Card } from '../../../../components/common/Card';
import { Input } from '../../../../components/common/Input';
import { Skeleton } from '../../../../components/common/Skeleton';
import { Textarea } from '../../../../components/common/Textarea';
import { toast } from '../../../../utils/toast';

interface QuickLink {
  label: string;
  path: string;
}

interface SiteSettingsForm {
  companyDescription: string;
  facebook: string;
  twitter: string;
  instagram: string;
  linkedin: string;
  quickLinks: QuickLink[];
  defaultMetaTitle: string;
  defaultMetaDescription: string;
  defaultOgImage: string;
  titleSuffix: string;
}

const EMPTY_FORM: SiteSettingsForm = {
  companyDescription: '',
  facebook: '',
  twitter: '',
  instagram: '',
  linkedin: '',
  quickLinks: [],
  defaultMetaTitle: '',
  defaultMetaDescription: '',
  defaultOgImage: '',
  titleSuffix: '',
};

/** Admin form for the 'cms' Configuration Engine namespace (footer content + global SEO defaults) — the public storefront Footer reads this same namespace via GET /public/cms/site-settings. */
export default function SiteSettingsPage() {
  const [form, setForm] = useState<SiteSettingsForm>(EMPTY_FORM);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['configuration', 'cms'],
    queryFn: () => getConfiguration('cms'),
  });

  useEffect(() => {
    if (!data) return;
    const footer = (data.footer as Record<string, unknown>) ?? {};
    const socialLinks = (footer.socialLinks as Record<string, unknown>) ?? {};
    const seo = (data.seo as Record<string, unknown>) ?? {};
    setForm({
      companyDescription: (footer.companyDescription as string) ?? '',
      facebook: (socialLinks.facebook as string) ?? '',
      twitter: (socialLinks.twitter as string) ?? '',
      instagram: (socialLinks.instagram as string) ?? '',
      linkedin: (socialLinks.linkedin as string) ?? '',
      quickLinks: (footer.quickLinks as QuickLink[]) ?? [],
      defaultMetaTitle: (seo.defaultMetaTitle as string) ?? '',
      defaultMetaDescription: (seo.defaultMetaDescription as string) ?? '',
      defaultOgImage: (seo.defaultOgImage as string) ?? '',
      titleSuffix: (seo.titleSuffix as string) ?? '',
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      setConfiguration('cms', {
        footer: {
          companyDescription: form.companyDescription,
          socialLinks: {
            facebook: form.facebook,
            twitter: form.twitter,
            instagram: form.instagram,
            linkedin: form.linkedin,
          },
          quickLinks: form.quickLinks.filter((l) => l.label.trim() && l.path.trim()),
        },
        seo: {
          defaultMetaTitle: form.defaultMetaTitle,
          defaultMetaDescription: form.defaultMetaDescription,
          defaultOgImage: form.defaultOgImage,
          titleSuffix: form.titleSuffix,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuration', 'cms'] });
      toast.success('Site settings saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function updateQuickLink(index: number, patch: Partial<QuickLink>) {
    setForm((prev) => ({
      ...prev,
      quickLinks: prev.quickLinks.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    }));
  }

  function addQuickLink() {
    setForm((prev) => ({ ...prev, quickLinks: [...prev.quickLinks, { label: '', path: '' }] }));
  }

  function removeQuickLink(index: number) {
    setForm((prev) => ({ ...prev, quickLinks: prev.quickLinks.filter((_, i) => i !== index) }));
  }

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Site Settings</h1>

      <Card className="flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Footer — Company & Social
        </h2>
        <Textarea
          label="Company Description"
          rows={3}
          value={form.companyDescription}
          onChange={(e) => setForm({ ...form, companyDescription: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Facebook URL"
            value={form.facebook}
            onChange={(e) => setForm({ ...form, facebook: e.target.value })}
          />
          <Input
            label="Twitter URL"
            value={form.twitter}
            onChange={(e) => setForm({ ...form, twitter: e.target.value })}
          />
          <Input
            label="Instagram URL"
            value={form.instagram}
            onChange={(e) => setForm({ ...form, instagram: e.target.value })}
          />
          <Input
            label="LinkedIn URL"
            value={form.linkedin}
            onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Footer — Quick Links
          </h2>
          <Button size="sm" variant="outline" onClick={addQuickLink}>
            + Add link
          </Button>
        </div>
        {form.quickLinks.length === 0 && (
          <p className="text-sm text-gray-400">
            No quick links configured — the storefront falls back to its default set.
          </p>
        )}
        {form.quickLinks.map((link, i) => (
          <div key={i} className="flex items-end gap-2">
            <Input
              label="Label"
              value={link.label}
              onChange={(e) => updateQuickLink(i, { label: e.target.value })}
            />
            <Input
              label="Path"
              value={link.path}
              onChange={(e) => updateQuickLink(i, { path: e.target.value })}
            />
            <Button size="sm" variant="danger" onClick={() => removeQuickLink(i)}>
              Remove
            </Button>
          </div>
        ))}
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Global SEO Defaults
        </h2>
        <Input
          label="Default Meta Title"
          value={form.defaultMetaTitle}
          onChange={(e) => setForm({ ...form, defaultMetaTitle: e.target.value })}
        />
        <Textarea
          label="Default Meta Description"
          rows={2}
          value={form.defaultMetaDescription}
          onChange={(e) => setForm({ ...form, defaultMetaDescription: e.target.value })}
        />
        <Input
          label="Default OG Image URL"
          value={form.defaultOgImage}
          onChange={(e) => setForm({ ...form, defaultOgImage: e.target.value })}
        />
        <Input
          label="Title Suffix"
          placeholder="e.g. | KarienLabs"
          value={form.titleSuffix}
          onChange={(e) => setForm({ ...form, titleSuffix: e.target.value })}
        />
      </Card>

      <Button className="w-fit" isLoading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
        Save Site Settings
      </Button>
    </div>
  );
}
