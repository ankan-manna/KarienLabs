import { BaseRepository } from '../../repositories/base.repository';

import { ShippingRuleModel, type ShippingRuleDocument } from './models/shipping-rule.model';

export class ShippingRuleRepository extends BaseRepository<ShippingRuleDocument> {
  constructor() {
    super(ShippingRuleModel);
  }
}

export const shippingRuleRepository = new ShippingRuleRepository();
