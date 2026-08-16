import { ROLES } from '@medcommerce/shared';

import { logger } from '../../config/logger';
import { resolveAnalyticsDateRange } from '../../modules/admin/analytics-date-range.util';
import { salesReport } from '../../modules/admin/reports.service';
import { UserModel } from '../../modules/auth/models/user.model';
import { enqueueNotification } from '../../modules/notifications/notification.service';

/** Scheduled report generation (spec: "Report Generation" under Automation) — emails a rolling 7-day sales summary to every admin/super_admin, distinct from the on-demand Reports screen. */
export async function runWeeklySalesReportJob(): Promise<number> {
  const rows = await salesReport(resolveAnalyticsDateRange({ preset: 'last7days' }));

  const totalOrders = rows.reduce((sum, r) => sum + r.orders, 0);
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const totalGst = rows.reduce((sum, r) => sum + r.gst, 0);

  const admins = await UserModel.find({
    role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] },
    isActive: true,
    deletedAt: null,
  })
    .select('email name')
    .lean();

  for (const admin of admins) {
    await enqueueNotification({
      channel: 'email',
      templateKey: 'weekly_sales_report',
      recipient: admin.email,
      userId: String(admin._id),
      data: {
        name: admin.name,
        totalOrders,
        totalRevenue: totalRevenue.toFixed(2),
        totalGst: totalGst.toFixed(2),
        daysCovered: rows.length,
      },
    });
  }

  if (admins.length > 0) {
    logger.info({ recipients: admins.length, totalOrders, totalRevenue }, 'Weekly sales report queued');
  }
  return admins.length;
}
