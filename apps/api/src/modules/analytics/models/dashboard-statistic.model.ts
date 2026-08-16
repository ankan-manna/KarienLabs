import { Schema, model, type InferSchemaType } from 'mongoose';

/** Cached snapshot of expensive cross-collection aggregates (today's revenue, low-stock count, ...) refreshed on a short interval so the admin dashboard never runs a live aggregation on page load. */
const dashboardStatisticSchema = new Schema({
  key: { type: String, required: true, unique: true }, // 'todays_revenue', 'low_stock_count', ...
  value: { type: Schema.Types.Mixed, required: true },
  computedAt: { type: Date, default: Date.now },
});

export type DashboardStatisticDocument = InferSchemaType<typeof dashboardStatisticSchema>;
export const DashboardStatisticModel = model('DashboardStatistic', dashboardStatisticSchema);
