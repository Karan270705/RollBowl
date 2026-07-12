import { supabase } from '@/src/lib/supabase';
import { KitchenHoliday } from '@/src/types/models';

export async function getHolidays(): Promise<KitchenHoliday[]> {
  const { data, error } = await supabase
    .from('kitchen_holidays')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching holidays:', error);
    throw new Error('Failed to load holidays');
  }

  return data.map(h => ({
    id: h.id,
    stallId: h.stall_id,
    holidayDate: h.holiday_date,
    title: h.title,
    description: h.description,
    isActive: h.is_active,
    createdAt: h.created_at,
  }));
}

export async function getHolidayByDate(dateString: string): Promise<KitchenHoliday | null> {
  const { data, error } = await supabase
    .from('kitchen_holidays')
    .select('*')
    .eq('holiday_date', dateString)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('Error fetching holiday by date:', error);
    throw new Error('Failed to check holiday status');
  }

  if (!data) return null;

  return {
    id: data.id,
    stallId: data.stall_id,
    holidayDate: data.holiday_date,
    title: data.title,
    description: data.description,
    isActive: data.is_active,
    createdAt: data.created_at,
  };
}
