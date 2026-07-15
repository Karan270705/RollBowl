/**
 * Centralized React Query key factory.
 * All query keys live here so cache invalidation is consistent
 * and refactoring key shapes never requires touching hook files.
 */

export const queryKeys = {
  meals: {
    all: ['meals'] as const,
    list: (category?: string) =>
      ['meals', 'list', category ?? 'all'] as const,
    detail: (id: string) => ['meals', 'detail', id] as const,
    catalog: (category?: string) =>
      ['meals', 'catalog', category ?? 'all'] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (userId: string) => ['orders', 'list', userId] as const,
    detail: (id: string) => ['orders', 'detail', id] as const,
  },
  subscriptions: {
    active: (userId: string | undefined) => ['subscriptions', 'active', userId] as const,
    plan: (planId: string | undefined) => ['subscriptions', 'plan', planId] as const,
    plans: () => ['subscriptions', 'plans'] as const,
    history: (subscriptionId: string | undefined) => ['subscriptions', 'history', subscriptionId] as const,
  },
  inventory: {
    stall: (stallId: string, date: string) => ['inventory', stallId, date] as const,
  },
  holidays: {
    all: () => ['holidays', 'all'] as const,
    active: (dateString: string) => ['holidays', 'active', dateString] as const,
  },
  payments: {
    settings: (stallId: string) => ['payments', 'settings', stallId] as const,
    proof: (orderId: string) => ['payments', 'proof', orderId] as const,
  },
  subscriptionRequests: {
    list: (userId: string) => ['subscriptionRequests', 'list', userId] as const,
    detail: (requestId: string) => ['subscriptionRequests', 'detail', requestId] as const,
  }
} as const;
