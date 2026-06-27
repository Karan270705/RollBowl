import { supabase } from '@/src/lib/supabase';
import { Meal, NutritionInfo } from '@/src/types/models';
import { MealCategory } from '@/src/constants/enums';

// ─── DB Row Type ─────────────────────────────────────────────
// Represents the raw shape returned from Supabase (snake_case).

interface MealRow {
  id: string;
  name: string;
  description: string;
  price: number;
  original_price: number | null;
  category: string;
  type: string;
  stall_id: string;
  image_url: string;
  is_available: boolean;
  is_featured: boolean;
  rating: number;
  total_ratings: number;
  preparation_time: number;
  serving_size: string | null;
  nutrition: Record<string, unknown> | null;
  tags: string[];
  created_at: string;
}

// ─── Mapper ──────────────────────────────────────────────────
// Converts a DB row (snake_case) to the app's Meal model (camelCase).
// nutrition is stored as `{}` for seeded meals — treat empty object as undefined.

function mapMeal(row: MealRow): Meal {
  const hasNutrition =
    row.nutrition !== null &&
    typeof row.nutrition === 'object' &&
    Object.keys(row.nutrition).length > 0;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    originalPrice: row.original_price != null ? Number(row.original_price) : undefined,
    category: row.category as MealCategory,
    type: row.type as Meal['type'],
    stallId: row.stall_id,
    imageUrl: row.image_url,
    isAvailable: row.is_available,
    isFeatured: row.is_featured,
    rating: Number(row.rating),
    totalRatings: row.total_ratings,
    preparationTime: row.preparation_time,
    servingSize: row.serving_size ?? undefined,
    nutrition: hasNutrition ? (row.nutrition as unknown as NutritionInfo) : undefined,
    tags: row.tags ?? [],
  };
}

// ─── Service Functions ────────────────────────────────────────

/**
 * Fetch all available meals, optionally filtered by category.
 * RLS policy meals_read USING (true) allows any authenticated user.
 */
export async function fetchMeals(category?: MealCategory): Promise<Meal[]> {
  let query = supabase
    .from('meals')
    .select('*')
    .eq('is_available', true)
    .order('name', { ascending: true });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data as MealRow[]).map(mapMeal);
}

/**
 * Fetch a single meal by ID.
 * Throws if the meal does not exist.
 */
export async function fetchMealById(id: string): Promise<Meal> {
  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Meal not found: ${id}`);

  return mapMeal(data as MealRow);
}

/**
 * Fetch meals where is_featured = true.
 * Returns [] when no meals are featured (MVP: all seeded meals have is_featured=false).
 * Future: business sets is_featured=true on desired meals — no code change needed here.
 */
export async function fetchFeaturedMeals(): Promise<Meal[]> {
  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .eq('is_featured', true)
    .eq('is_available', true)
    .order('name', { ascending: true });

  if (error) throw error;

  return (data as MealRow[]).map(mapMeal);
}
