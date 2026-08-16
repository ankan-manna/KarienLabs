import { ROLES } from '@medcommerce/shared';

import { NotFoundError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { UserModel } from '../auth/models/user.model';
import { CustomerActivityModel } from '../customers/models/customer-activity.model';
import { CustomerAddressModel } from '../customers/models/customer-address.model';
import { CustomerProfileModel } from '../customers/models/customer-profile.model';
import { PrescriptionUploadModel } from '../customers/models/prescription-upload.model';
import { WishlistModel } from '../customers/models/wishlist.model';
import { OrderModel } from '../orders/models/order.model';

/** Admin-facing view of the customer base — distinct from the customer's own `/profile/me` self-service endpoints. */
export async function listCustomers(query: ListQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    ...query.filter,
    role: ROLES.CUSTOMER,
    deletedAt: null,
  };
  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { email: { $regex: query.search, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    UserModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-passwordHash').lean(),
    UserModel.countDocuments(filter),
  ]);

  const userIds = users.map((u) => u._id);
  const orderStats = await OrderModel.aggregate([
    { $match: { customerId: { $in: userIds } } },
    {
      $group: {
        _id: '$customerId',
        orderCount: { $sum: 1 },
        totalSpent: { $sum: '$totals.grandTotal' },
      },
    },
  ]);
  const statsByUser = new Map(orderStats.map((s) => [String(s._id), s]));

  const items = users.map((user) => {
    const stats = statsByUser.get(String(user._id));
    return {
      ...user,
      orderCount: stats?.orderCount ?? 0,
      totalSpent: stats?.totalSpent ?? 0,
    };
  });

  return {
    items,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getCustomerDetail(id: string) {
  const user = await UserModel.findOne({ _id: id, role: ROLES.CUSTOMER, deletedAt: null })
    .select('-passwordHash')
    .lean();
  if (!user) throw new NotFoundError('Customer');

  const [profile, addresses, wishlist, prescriptions, orders, activity] = await Promise.all([
    CustomerProfileModel.findOne({ userId: id }).lean(),
    CustomerAddressModel.find({ userId: id, deletedAt: null }).lean(),
    WishlistModel.findOne({ userId: id }).lean(),
    PrescriptionUploadModel.find({ userId: id }).sort({ createdAt: -1 }).limit(20).lean(),
    OrderModel.find({ customerId: id }).sort({ createdAt: -1 }).limit(20).lean(),
    CustomerActivityModel.find({ userId: id }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);

  const totalSpent = orders
    .filter((o) => o.paymentStatus === 'captured')
    .reduce((sum, o) => sum + (o.totals?.grandTotal ?? 0), 0);

  return {
    user,
    profile,
    addresses,
    wishlistItemCount: wishlist?.items?.length ?? 0,
    prescriptions,
    orders,
    orderCount: orders.length,
    totalSpent,
    activity,
  };
}

export async function setCustomerStatus(id: string, isActive: boolean) {
  const user = await UserModel.findOneAndUpdate(
    { _id: id, role: ROLES.CUSTOMER, deletedAt: null },
    { isActive },
    { new: true },
  )
    .select('-passwordHash')
    .lean();
  if (!user) throw new NotFoundError('Customer');
  return user;
}
