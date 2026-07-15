import { supabase } from '@/src/lib/supabase';
import { Order, OrderItem } from '@/src/types/models';
import { OrderStatus, OrderType, PaymentStatus } from '@/src/constants/enums';
import { NotificationEvents } from '@/src/services/notifications';
import { resolveOperationalFacts } from '@/src/engine/operationalEngine';

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
  payment_method: string;
  payment_verification_status: string;
  payment_proof_deadline: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  notes: string | null;
  estimated_ready_time: string | null;
  expected_pickup_slot: string | null;
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
    paymentMethod: orderRow.payment_method as import('@/src/constants/enums').PaymentMethod,
    paymentVerificationStatus: orderRow.payment_verification_status as import('@/src/constants/enums').PaymentVerificationStatus,
    paymentProofDeadline: orderRow.payment_proof_deadline ?? undefined,
    subtotal: Number(orderRow.subtotal),
    tax: Number(orderRow.tax),
    discount: Number(orderRow.discount),
    total: Number(orderRow.total),
    notes: orderRow.notes ?? undefined,
    estimatedReadyTime: orderRow.estimated_ready_time ?? undefined,
    expectedPickupSlot: orderRow.expected_pickup_slot ?? undefined,
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
  stallId: string,
  items: import('@/src/utils/subscriptionEngine').ProcessedItem[],
  pickupDate: string,
  expectedPickupSlot: string,
  paymentMethod: import('@/src/constants/enums').PaymentMethod,
  subscriptionId?: string,
  notes?: string,
  inventoryBatchId?: string | null
): Promise<Order> {
  // SERVER-SIDE OPERATIONAL VALIDATION
  const opFacts = await resolveOperationalFacts(stallId, pickupDate);
  
  if (opFacts.status === 'HOLIDAY') {
    throw new Error('Cannot place an order on a Kitchen Holiday.');
  }

  if (opFacts.status !== 'ORDERING_OPEN') {
    throw new Error('Ordering is currently closed.');
  }

  if (opFacts.operationalDate !== pickupDate) {
    throw new Error('Invalid order date. The client clock is out of sync with the kitchen operations.');
  }

  // Use the atomic place_order RPC
  const payload = {
    userId,
    stallId,
    items: items.map(item => ({
      mealId: item.meal.id,
      quantity: item.quantity,
      useSubscription: !!item.subscriptionId
    })),
    pickupDate,
    expectedPickupSlot,
    paymentMethod,
    notes,
    subscriptionId,
    inventoryBatchId,
  };

  const { data: result, error: rpcError } = await supabase.rpc('place_order', {
    p_payload: payload,
  });

  if (rpcError) throw rpcError;

  // The RPC returns { error: '...', message: '...' } on structured failure
  if (result && result.error) {
    const error = new Error(result.message);
    (error as any).code = result.error;
    (error as any).details = result;
    throw error;
  }

  const orderId = result.order_id;
  const orderNumber = result.order_number;

  // Notify listeners
  await NotificationEvents.notifyOrderPlaced(userId, orderNumber, orderId);

  // Return the fetched order to match signature
  return fetchOrderById(orderId);
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, userId: string, orderNumber: string) {
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId);

  if (error) throw error;

  switch (status) {
    case OrderStatus.PREPARING:
      await NotificationEvents.notifyOrderPreparing(userId, orderNumber, orderId);
      break;
    case OrderStatus.READY:
      await NotificationEvents.notifyOrderReady(userId, orderNumber, orderId);
      break;
    case OrderStatus.PICKED_UP:
      await NotificationEvents.notifyOrderCollected(userId, orderNumber, orderId);
      break;
    case OrderStatus.CANCELLED:
      await NotificationEvents.notifyOrderCancelled(userId, orderNumber, orderId);
      break;
    // Note: ORDER_ACCEPTED is not a strict enum state in this app, usually it's transition to PREPARING
    default:
      break;
  }
}
