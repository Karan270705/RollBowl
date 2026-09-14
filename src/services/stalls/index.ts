import { supabase } from '@/src/lib/supabase';
import { Stall } from '@/src/types/models';

/**
 * Fetch all active stalls, optionally filtered by collegeId
 */
export async function fetchActiveStalls(collegeId?: string): Promise<Stall[]> {
  let query = supabase
    .from('stalls')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (collegeId) {
    query = query.eq('college_id', collegeId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(mapStallFromDB);
}

/**
 * Fetch single stall by ID
 */
export async function fetchStallById(stallId: string): Promise<Stall | null> {
  const { data, error } = await supabase
    .from('stalls')
    .select('*')
    .eq('id', stallId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapStallFromDB(data);
}

/**
 * Update user's preferred stall
 */
export async function updateUserPreferredStall(
  userId: string,
  stallId: string
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ preferred_stall_id: stallId })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Get user's preferred stall ID
 */
export async function fetchUserPreferredStall(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('preferred_stall_id')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data?.preferred_stall_id || null;
}

/**
 * Get stalls that have a specific meal in their menu for a given date
 */
export async function fetchStallsWithMeal(
  mealId: string,
  serviceDate: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('menu_schedule_items')
    .select('menu_schedule:menu_schedules!inner(stall_id)')
    .eq('meal_id', mealId)
    .eq('menu_schedule.menu_date', serviceDate)
    .eq('menu_schedule.is_published', true);

  if (error) throw error;

  const stallIds = new Set<string>();
  data?.forEach((item: any) => {
    if (item.menu_schedule?.stall_id) {
      stallIds.add(item.menu_schedule.stall_id);
    }
  });

  return Array.from(stallIds);
}

/**
 * Map database stall to Stall model
 */
function mapStallFromDB(data: any): Stall {
  return {
    id: data.id,
    name: data.name,
    collegeId: data.college_id,
    operatorId: data.operator_id,
    description: data.description,
    imageUrl: data.image_url,
    location: data.location,
    isActive: data.is_active,
    rating: parseFloat(data.rating) || 0,
    totalRatings: data.total_ratings || 0,
  };
}
