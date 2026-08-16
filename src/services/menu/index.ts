import { supabase } from '@/src/lib/supabase';
import { Meal } from '@/src/types/models';
import { NotificationEvents } from '@/src/services/notifications';

export interface MenuSchedule {
  id: string;
  stall_id: string;
  menu_date: string;
  visible_from: string;
  order_cutoff: string;
  delivery_start_at: string;
  delivery_end_at: string;
  is_published: boolean;
  stall_name?: string;
}

/**
 * Fetches the active published menu schedule for a given date.
 */
export async function fetchActiveMenuSchedule(targetDate: string): Promise<MenuSchedule | null> {
  console.log('[INSTRUMENTATION: fetchActiveMenuSchedule - QUERY]', JSON.stringify({
    table: 'menu_schedules',
    targetDate,
    filter_is_published: true,
  }, null, 2));

  const { data, error } = await supabase
    .from('menu_schedules')
    .select('*')
    .eq('menu_date', targetDate)
    .eq('is_published', true)
    .maybeSingle();

  console.log('[INSTRUMENTATION: fetchActiveMenuSchedule - RESULT]', JSON.stringify({
    targetDate,
    foundSchedule: data || null,
    error: error || null,
  }, null, 2));

  if (error) {
    console.error('Error fetching active menu schedule:', error);
    throw error;
  }

  return data;
}

/**
 * Fetches the meals associated with a specific menu schedule.
 */
export async function fetchScheduledMeals(scheduleId: string): Promise<Meal[]> {
  console.log('[INSTRUMENTATION: fetchScheduledMeals - QUERY]', JSON.stringify({
    table: 'menu_schedule_items',
    scheduleId,
  }, null, 2));

  const { data, error } = await supabase
    .from('menu_schedule_items')
    .select(`
      meal_id,
      meals:meal_id (*)
    `)
    .eq('menu_schedule_id', scheduleId);

  console.log('[INSTRUMENTATION: fetchScheduledMeals - RESULT]', JSON.stringify({
    scheduleId,
    itemCount: data?.length || 0,
    error: error || null,
  }, null, 2));

  if (error) {
    console.error('Error fetching scheduled meals:', error);
    throw error;
  }

  if (!data) return [];

  // Map the nested meals data
  return data
    .map((item: any) => {
      const row = item.meals;
      if (!row) return null;

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
        category: row.category,
        type: row.type,
        stallId: row.stall_id,
        imageUrl: row.image_url,
        isAvailable: row.is_available, // This is the base availability, schedule overrides it
        isFeatured: row.is_featured,
        rating: Number(row.rating),
        totalRatings: row.total_ratings,
        preparationTime: row.preparation_time,
        servingSize: row.serving_size ?? undefined,
        nutrition: hasNutrition ? row.nutrition : undefined,
        tags: row.tags ?? [],
      } as Meal;
    })
    .filter(Boolean) as Meal[];
}

export async function publishMenu(scheduleId: string, date: string, notifyUsers: string[]) {
  const { error } = await supabase
    .from('menu_schedules')
    .update({ is_published: true })
    .eq('id', scheduleId);

  if (error) throw error;

  // Notify all provided users (typically fetched from users table who are active/subscribed)
  for (const userId of notifyUsers) {
    await NotificationEvents.notifyMenuPublished(userId, date);
  }
}
