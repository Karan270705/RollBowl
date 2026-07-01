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
  }
} as const;
