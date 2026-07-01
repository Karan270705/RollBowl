import { supabase } from '@/src/lib/supabase';
import { Order, OrderItem } from '@/src/types/models';
import { OrderStatus, OrderType, PaymentStatus } from '@/src/constants/enums';

// ─── DB Row Types ────────────────────────────────────────────

interface OrderRow {
  id: string;
  order_number: string;
  user_id: string;
  customer_name: string;
  stall_id: string;
  stall_name: string;
  status: string;
  order_type: string;
  payment_status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  notes: string | null;
  estimated_ready_time: string | null;
  pickup_date: string;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  meal_id: string;
  meal_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  special_instructions: string | null;
  subscription_id?: string | null;
  credits_used?: number;
}

// ─── Mappers ──────────────────────────────────────────────────

function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    mealId: row.meal_id,
    mealName: row.meal_name,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    totalPrice: Number(row.total_price),
    specialInstructions: row.special_instructions ?? undefined,
    subscriptionId: row.subscription_id ?? undefined,
    creditsUsed: row.credits_used ?? undefined,
  };
}

function mapOrder(orderRow: OrderRow, itemsRows: OrderItemRow[] = []): Order {
  return {
    id: orderRow.id,
    orderNumber: orderRow.order_number,
    userId: orderRow.user_id,
    customerName: orderRow.customer_name,
    stallId: orderRow.stall_id,
    stallName: orderRow.stall_name,
    status: orderRow.status as OrderStatus,
    orderType: orderRow.order_type as OrderType,
    paymentStatus: orderRow.payment_status as PaymentStatus,
    subtotal: Number(orderRow.subtotal),
    tax: Number(orderRow.tax),
    discount: Number(orderRow.discount),
    total: Number(orderRow.total),
    notes: orderRow.notes ?? undefined,
    estimatedReadyTime: orderRow.estimated_ready_time ?? undefined,
    pickupDate: orderRow.pickup_date,
    createdAt: orderRow.created_at,
    updatedAt: orderRow.updated_at,
    items: itemsRows.map(mapOrderItem),
  };
}

// ─── Service Functions ────────────────────────────────────────

/**
 * Fetch all orders for a specific user, including their line items.
 */
export async function fetchUserOrders(userId: string): Promise<Order[]> {
  // 1. Fetch orders
  const { data: ordersData, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (ordersError) throw ordersError;
  if (!ordersData || ordersData.length === 0) return [];

  // 2. Fetch all items for these orders
  const orderIds = ordersData.map(o => o.id);
  const { data: itemsData, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .in('order_id', orderIds);

  if (itemsError) throw itemsError;

  // 3. Group items by order_id
  const itemsByOrderId = (itemsData as OrderItemRow[]).reduce((acc, item) => {
    if (!acc[item.order_id]) acc[item.order_id] = [];
    acc[item.order_id].push(item);
    return acc;
  }, {} as Record<string, OrderItemRow[]>);

  // 4. Map and assemble
  return (ordersData as OrderRow[]).map(orderRow => 
    mapOrder(orderRow, itemsByOrderId[orderRow.id] ?? [])
  );
}

/**
 * Fetch a single order by ID with its items.
 */
export async function fetchOrderById(id: string): Promise<Order> {
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!orderData) throw new Error(`Order not found: ${id}`);

  const { data: itemsData, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', id);

  if (itemsError) throw itemsError;

  return mapOrder(orderData as OrderRow, itemsData as OrderItemRow[]);
}

/**
 * Place a new order and save to Supabase.
 */
export async function placeOrder(
  userId: string,
  customerName: string,
  stallId: string,
  stallName: string,
  items: import('@/src/utils/subscriptionEngine').ProcessedItem[],
  subtotal: number,
  tax: number,
  total: number,
  pickupDate: string,
  subscriptionUpdates?: { id: string; updates: { lastUsageDate: string; dailyCreditsUsed: number; consumedMeals: number; remainingMeals: number } },
  notes?: string
): Promise<Order> {
  const orderNumber = `RB-${Math.floor(Math.random() * 900000) + 100000}`;
  
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      user_id: userId,
      customer_name: customerName,
      stall_id: stallId,
      stall_name: stallName,
      status: OrderStatus.PENDING,
      order_type: OrderType.ON_STALL,
      payment_status: PaymentStatus.PAID,
      subtotal,
      tax,
      discount: 0,
      total,
      notes,
      pickup_date: pickupDate,
    })
    .select()
    .single();

  if (orderError) throw orderError;

  const orderItemsInsert = items.map((item) => ({
    order_id: orderData.id,
    meal_id: item.meal.id,
    meal_name: item.meal.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_price: item.totalPrice,
    subscription_id: item.subscriptionId,
    credits_used: item.creditsUsed,
  }));

  const { data: itemsData, error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItemsInsert)
    .select();

  if (itemsError) throw itemsError;

  // If there are subscription updates, apply them now
  if (subscriptionUpdates) {
    const { error: subError } = await supabase
      .from('subscriptions')
      .update({
        last_usage_date: subscriptionUpdates.updates.lastUsageDate,
        daily_credits_used: subscriptionUpdates.updates.dailyCreditsUsed,
        consumed_meals: subscriptionUpdates.updates.consumedMeals,
        remaining_meals: subscriptionUpdates.updates.remainingMeals,
      })
      .eq('id', subscriptionUpdates.id);
      
    if (subError) throw subError;
  }

  return mapOrder(orderData as OrderRow, itemsData as OrderItemRow[]);
}
