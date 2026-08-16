import { BaseRepository } from '../../repositories/base.repository';

import { ProductModel, type ProductDocument } from './models/product.model';

export class ProductRepository extends BaseRepository<ProductDocument> {
  constructor() {
    super(ProductModel);
  }

  findBySlug(slug: string) {
    return this.model.findOne({ slug }).lean();
  }

  findBySku(sku: string) {
    return this.model.findOne({ sku: sku.toUpperCase() }).lean();
  }

  findByBarcode(barcode: string) {
    return this.model.findOne({ barcode }).lean();
  }
}

export const productRepository = new ProductRepository();
