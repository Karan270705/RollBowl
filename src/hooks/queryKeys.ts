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
    featured: ['meals', 'featured'] as const,
  },
} as const;
