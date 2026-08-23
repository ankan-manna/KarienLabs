import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCategoryStructuredData,
  buildFaqStructuredData,
  buildProductStructuredData,
  type StructuredDataProductInput,
} from './structured-data.util';

const BASE_PRODUCT: StructuredDataProductInput = {
  name: 'Paracetamol 500mg',
  slug: 'paracetamol-500mg',
  sku: 'PARA500',
  shortDescription: 'Pain relief tablets',
  images: [{ url: 'https://cdn.example.com/para.jpg', isPrimary: true }],
  basePrice: 25.5,
  brandName: 'ACME',
  inStock: true,
};

test('builds valid schema.org Product JSON-LD from real data', () => {
  const data = buildProductStructuredData(BASE_PRODUCT, 'https://example.com');
  assert.equal(data['@type'], 'Product');
  assert.equal(data.name, 'Paracetamol 500mg');
  assert.equal(data.sku, 'PARA500');
  assert.equal(data.offers.price, '25.50');
  assert.equal(data.offers.priceCurrency, 'INR');
  assert.equal(data.offers.availability, 'https://schema.org/InStock');
  assert.equal(data.offers.url, 'https://example.com/products/paracetamol-500mg');
  assert.deepEqual(data.brand, { '@type': 'Brand', name: 'ACME' });
});

test('availability reflects OutOfStock when inStock is false', () => {
  const data = buildProductStructuredData({ ...BASE_PRODUCT, inStock: false }, 'https://example.com');
  assert.equal(data.offers.availability, 'https://schema.org/OutOfStock');
});

test('NEVER includes aggregateRating when ratingCount is 0/undefined (no fake ratings)', () => {
  const data = buildProductStructuredData(BASE_PRODUCT, 'https://example.com');
  assert.equal('aggregateRating' in data, false);

  const dataZero = buildProductStructuredData({ ...BASE_PRODUCT, ratingCount: 0, ratingAvg: 4 }, 'https://example.com');
  assert.equal('aggregateRating' in dataZero, false);
});

test('includes aggregateRating ONLY when real rating data exists', () => {
  const data = buildProductStructuredData({ ...BASE_PRODUCT, ratingCount: 12, ratingAvg: 4.3333 }, 'https://example.com');
  assert.deepEqual(data.aggregateRating, { '@type': 'AggregateRating', ratingValue: '4.3', reviewCount: 12 });
});

test('omits brand when brandName is null/absent', () => {
  const data = buildProductStructuredData({ ...BASE_PRODUCT, brandName: null }, 'https://example.com');
  assert.equal('brand' in data, false);
});

test('omits image array when there are no images', () => {
  const data = buildProductStructuredData({ ...BASE_PRODUCT, images: [] }, 'https://example.com');
  assert.equal('image' in data, false);
});

test('builds category structured data', () => {
  const data = buildCategoryStructuredData({ name: 'Pain Relief', slug: 'pain-relief', description: 'Pain relief medicines' }, 'https://example.com');
  assert.equal(data['@type'], 'CollectionPage');
  assert.equal(data.url, 'https://example.com/categories/pain-relief');
});

test('buildFaqStructuredData returns null for empty FAQ (nothing to mark up)', () => {
  assert.equal(buildFaqStructuredData([]), null);
});

test('buildFaqStructuredData builds FAQPage markup only from real admin-authored entries', () => {
  const data = buildFaqStructuredData([
    { question: 'Is a prescription required?', answer: 'Yes, this is a Schedule H medicine.' },
  ]);
  assert.equal(data?.['@type'], 'FAQPage');
  assert.equal(data?.mainEntity[0].name, 'Is a prescription required?');
  assert.equal(data?.mainEntity[0].acceptedAnswer.text, 'Yes, this is a Schedule H medicine.');
});
