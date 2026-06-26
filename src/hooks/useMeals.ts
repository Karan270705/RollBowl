import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import {
  fetchMeals,
  fetchMealById,
  fetchFeaturedMeals,
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
 * Fetch meals where is_featured = true.
 *
 * MVP note: all seeded meals have is_featured=false, so this returns [].
 * The Home screen uses pickRandomFeatured() as a temporary stand-in.
 * Future: once business sets is_featured=true, this hook returns the real set.
 */
export function useFeaturedMeals() {
  return useQuery({
    queryKey: queryKeys.meals.featured,
    queryFn: fetchFeaturedMeals,
  });
}
