import { ProductModel } from '../catalog/models/product.model';

import { ProductTaxMappingModel } from './models/product-tax-mapping.model';

interface CreateMappingInput {
  productId: string;
  hsnCode: string;
  gstRate: number;
  effectiveFrom?: string;
}

/**
 * Time-bound tax-rate history for a product (see model comment). Creating a new
 * mapping closes out whatever mapping was previously open-ended (`effectiveTo: null`)
 * and syncs `Product.gstRate`, the fast-path field checkout math actually reads.
 */
export async function createProductTaxMapping(input: CreateMappingInput) {
  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();

  await ProductTaxMappingModel.updateMany(
    { productId: input.productId, effectiveTo: null },
    { effectiveTo: effectiveFrom },
  );

  const mapping = await ProductTaxMappingModel.create({
    productId: input.productId,
    hsnCode: input.hsnCode,
    gstRate: input.gstRate,
    effectiveFrom,
    effectiveTo: null,
  });

  await ProductModel.updateOne({ _id: input.productId }, { gstRate: input.gstRate });

  return mapping;
}

export function listProductTaxMappings(productId?: string) {
  const filter = productId ? { productId } : {};
  return ProductTaxMappingModel.find(filter).sort({ effectiveFrom: -1 }).lean();
}
