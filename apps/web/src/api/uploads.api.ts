import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

interface SignaturePayload {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  uploadPreset: string;
}

export type UploadPreset =
  | 'product_thumbnail'
  | 'prescription_secure'
  | 'cms_media'
  | 'profile_picture'
  | 'return_evidence';

async function getUploadSignature(preset: UploadPreset, folder: string): Promise<SignaturePayload> {
  const { data } = await httpClient.post<ApiResponse<SignaturePayload>>('/uploads/signature', {
    preset,
    folder,
  });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export interface UploadedAsset {
  publicId: string;
  url: string;
}

/** Signs with the API, then uploads the file bytes directly to Cloudinary — the API never proxies the file (see Prompt 1's upload architecture). */
export async function uploadImageDirect(
  file: File,
  preset: UploadPreset,
  folder: string,
): Promise<UploadedAsset> {
  const sig = await getUploadSignature(preset, folder);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', sig.apiKey);
  formData.append('timestamp', String(sig.timestamp));
  formData.append('signature', sig.signature);
  formData.append('folder', sig.folder);
  formData.append('upload_preset', sig.uploadPreset);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    // Bugfix (Order/Shiprocket/Invoice/Image) Part 6 — a 200 from
    // /uploads/signature only proves OUR signing math was correct; it says
    // nothing about whether Cloudinary will actually accept the upload
    // (e.g. "Upload preset not found"). Surfacing Cloudinary's own error
    // message here (previously discarded in favor of a generic "Image
    // upload failed") is what made THAT root cause discoverable at all.
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error?.message || 'Image upload failed');
  }
  const result = await response.json();

  // Best-effort bookkeeping only (powers the separate admin file-browser
  // list) — the image itself is already safely uploaded to Cloudinary with
  // a real, working url/publicId at this point. Previously this call's
  // failure (network blip, expired session) threw and made an actually-
  // successful Cloudinary upload look like a total failure to the caller,
  // while silently orphaning the asset (no DB record, no url ever returned
  // to attach to the product).
  await httpClient.post('/files', {
    publicId: result.public_id,
    url: result.secure_url,
    resourceType: 'image',
    folder: sig.folder,
    sizeBytes: result.bytes,
  }).catch(() => undefined);

  return { publicId: result.public_id, url: result.secure_url };
}
