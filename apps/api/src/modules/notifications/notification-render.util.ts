import Handlebars from 'handlebars';

import { extractTemplateVariables } from './notification-template-variables.util';

/**
 * Prompt 20 Part 1/20 — the ONE place Handlebars compilation happens,
 * shared by notification.worker.ts (real sends) and the admin template
 * preview endpoint (notification.service.ts's previewTemplate), so
 * "how do we render a template" is defined exactly once (Part 1's "centralize,
 * don't duplicate" rule applied to rendering, not just delivery).
 */
export function renderTemplateString(source: string, data: Record<string, unknown>): string {
  return Handlebars.compile(source)(data);
}

/**
 * Part 20 — safe mock data for template preview. Never real customer/order/
 * payment/prescription data: every placeholder found in the template is
 * filled with a generic, obviously-synthetic `"Sample <name>"` string,
 * discovered generically from the template source itself rather than a
 * hand-maintained per-template mock catalog (works for any template,
 * including ones an admin just created).
 */
export function buildMockDataForTemplate(subject: string, body: string): Record<string, string> {
  const variables = new Set([...extractTemplateVariables(subject), ...extractTemplateVariables(body)]);
  const mock: Record<string, string> = {};
  for (const name of variables) {
    if (name.toLowerCase() === 'code') {
      mock[name] = '123456'; // an obviously-fake sample OTP, never a real one (Part 20/34).
      continue;
    }
    mock[name] = `Sample ${name}`;
  }
  return mock;
}
