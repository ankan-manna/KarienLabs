import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { apiBaseUrl } from '../../../api/http-client';

interface InventoryUpdatedEvent {
  type: 'inventory.updated';
  productId: string;
  inStock: boolean;
  updatedAt: string;
}

interface InventoryUpdatedBatch {
  events: InventoryUpdatedEvent[];
}

/**
 * Prompt 3 (inventory lifecycle) — subscribes to the backend's SSE stream
 * (`inventory-events.routes.ts`, itself relayed off the ONE `inventory:updates`
 * Redis channel `order.service.ts` publishes to right after a payment-triggered
 * stock commit). Mounted once at the storefront root (`PublicLayout`) so every
 * product-facing page benefits without each page owning its own connection.
 *
 * Deliberately does NOT do local arithmetic on the received event (no
 * `stock - 1`) — every product-detail cache entry is overwritten with the
 * exact `inStock` value the server just computed (Part 29: "events should
 * represent authoritative state, not UI arithmetic"), and list/search/related
 * queries are simply invalidated so they refetch the authoritative page from
 * the server rather than trying to patch N cached rows locally. Checkout
 * itself never trusts any of this — the backend re-validates stock again at
 * checkout-intent and, atomically, at order finalization (Part 21).
 */
export function useInventoryEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;

    const source = new EventSource(`${apiBaseUrl()}/realtime/inventory-events`);

    source.addEventListener('inventory.updated', (event) => {
      const messageEvent = event as MessageEvent<string>;
      let batch: InventoryUpdatedBatch;
      try {
        batch = JSON.parse(messageEvent.data) as InventoryUpdatedBatch;
      } catch {
        return;
      }

      for (const item of batch.events) {
        queryClient.setQueryData(
          ['products', 'detail', item.productId],
          (previous: { inStock?: boolean } | undefined) =>
            previous ? { ...previous, inStock: item.inStock } : previous,
        );
      }
      // List/search/related/home queries render many rows from one response —
      // cheaper and simpler to let them refetch than to locate+patch each row.
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['products', 'related'] });
      void queryClient.invalidateQueries({ queryKey: ['products', 'home'] });
    });

    // A connection drop (network blip, server restart) is expected and
    // non-fatal — EventSource retries on its own using the `retry:` value
    // the server sends; nothing here needs to force-reconnect. Errors are
    // swallowed rather than surfaced to the customer (Part 28: realtime is a
    // sync mechanism, never something that should visibly fail the page).
    source.onerror = () => undefined;

    return () => source.close();
  }, [queryClient]);
}
