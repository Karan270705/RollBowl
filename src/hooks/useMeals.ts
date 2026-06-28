import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import {
  fetchMeals,
  fetchMealById,
  fetchAllMeals,
} from '@/src/services/meals';
import { MealCategory } from '@/src/constants/enums';

/**
 * Fetch all available meals, optionally filtered by category.
 *
 * @param category - Optional MealCategory to filter by. Omit for all categories.
 */
export function useMeals(category?: MealCategory) {
  return useQuery({
    queryKey: queryKeys.meals.list(category),
    queryFn: () => fetchMeals(category),
  });
}

/**
 * Fetch a single meal by ID.
 * Query is disabled when id is falsy (e.g. during navigation transitions).
 *
 * @param id - The meal UUID.
 */
export function useMeal(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.meals.detail(id ?? ''),
    queryFn: () => fetchMealById(id!),
    enabled: Boolean(id),
  });
}

/**
 * Fetch the full catalog (available + unavailable), optionally filtered by category.
 * Used by the "Browse Catalog" section on the Home screen.
 */
export function useAllMeals(category?: MealCategory) {
  return useQuery({
    queryKey: queryKeys.meals.catalog(category),
    queryFn: () => fetchAllMeals(category),
  });
}
