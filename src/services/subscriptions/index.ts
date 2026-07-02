import { supabase } from '@/src/lib/supabase';
import { Subscription, SubscriptionPlan } from '@/src/types/models';
import { NotificationEvents } from '@/src/services/notifications';

export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows found
    throw error;
  }
  
  const sub = {
    id: data.id,
    userId: data.user_id,
    planId: data.plan_id,
    planName: data.plan_name,
    status: data.status,
    startDate: data.start_date,
    endDate: data.end_date,
    totalMeals: data.total_meals,
    consumedMeals: data.consumed_meals,
    remainingMeals: data.remaining_meals,
    mealsPerDay: data.meals_per_day,
    lastUsageDate: data.last_usage_date,
    dailyCreditsUsed: data.daily_credits_used,
  } as Subscription;

  // --- Lazy Notification Evaluation for Expiry ---
  const today = new Date();
  const endDate = new Date(sub.endDate);
  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (sub.status === 'active') {
    if (diffDays <= 0) {
      // It's expired today or in the past, but status hasn't been updated yet?
      // Or maybe it just expired. Let's notify.
      await NotificationEvents.notifySubscriptionExpired(sub.userId, sub.id).catch(console.error);
      
      // Optionally update DB status here or rely on cron/user action
      // await supabase.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id);
    } else if (diffDays <= 3) {
      await NotificationEvents.notifySubscriptionExpiring(sub.userId, diffDays, sub.id).catch(console.error);
    }
  }

  return sub;
}

export async function getSubscriptionPlan(planId: string): Promise<SubscriptionPlan | null> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    price: data.price,
    durationDays: data.duration_days,
    mealsPerDay: data.meals_per_day,
    totalMeals: data.total_meals,
    features: data.features,
    isPopular: data.is_popular,
    badge: data.badge,
    categoryCreditCosts: data.category_credit_costs,
  } as SubscriptionPlan;
}

export async function getAllSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) throw error;
  
  return data.map(plan => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    durationDays: plan.duration_days,
    mealsPerDay: plan.meals_per_day,
    totalMeals: plan.total_meals,
    features: plan.features,
    isPopular: plan.is_popular,
    badge: plan.badge,
    categoryCreditCosts: plan.category_credit_costs,
  })) as SubscriptionPlan[];
}

export async function simulatePurchase(userId: string, plan: SubscriptionPlan): Promise<void> {
  // First, check if there is an active subscription to prevent duplicates
  const activeSub = await getActiveSubscription(userId);
  if (activeSub) {
    throw new Error('You already have an active subscription.');
  }

  // Insert a new active subscription for this user
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + plan.durationDays);

  const { error } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      plan_id: plan.id,
      plan_name: plan.name,
      status: 'active',
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      total_meals: plan.totalMeals,
      consumed_meals: 0,
      remaining_meals: plan.totalMeals,
      meals_per_day: plan.mealsPerDay,
      daily_credits_used: 0,
    });

  if (error) throw error;

  await NotificationEvents.notifySubscriptionActivated(userId, plan.name);
}

export interface UsageHistoryEntry {
  id: string;
  orderNumber: string;
  mealName: string;
  creditsUsed: number;
  date: string;
}

export async function getSubscriptionUsageHistory(subscriptionId: string): Promise<UsageHistoryEntry[]> {
  const { data, error } = await supabase
    .from('order_items')
    .select(`
      id,
      meal_name,
      credits_used,
      orders (
        order_number,
        created_at
      )
    `)
    .eq('subscription_id', subscriptionId);

  if (error) throw error;

  const history = data.map((item: any) => ({
    id: item.id,
    mealName: item.meal_name,
    creditsUsed: item.credits_used,
    orderNumber: item.orders?.order_number || 'Unknown',
    date: item.orders?.created_at || new Date().toISOString(),
  }));

  // Sort descending by date
  history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  return history;
}
