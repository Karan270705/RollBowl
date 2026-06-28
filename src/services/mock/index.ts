import { mockDelay } from './mockDelay';
import { MOCK_MEALS, MOCK_ORDERS, MOCK_SUBSCRIPTION, MOCK_PLANS, MOCK_NOTIFICATIONS, MOCK_INVENTORY, MOCK_MEAL_HISTORY, MOCK_CURRENT_USER, MOCK_ADDRESSES, MOCK_PAYMENTS, MOCK_RESERVATIONS } from '@/src/constants/mockData';
import type { Meal, Order, Subscription, SubscriptionPlan, Notification, InventoryItem, MealHistory, User, Address, PaymentRecord, MealReservation } from '@/src/types/models';
import type { ApiResponse, AuthResponse, LoginRequest, SignupRequest, ReserveMealRequest, AvailabilityResponse } from '@/src/types/api';
import { MealCategory } from '@/src/constants/enums';

// ─── Auth ────────────────────────────────────────────────
export const mockLogin = async (req: LoginRequest): Promise<ApiResponse<AuthResponse>> => {
  await mockDelay();
  return { success: true, data: { user: MOCK_CURRENT_USER, token: 'mock-jwt', refreshToken: 'mock-refresh' } };
};

export const mockSignup = async (req: SignupRequest): Promise<ApiResponse<AuthResponse>> => {
  await mockDelay();
  const user: User = { ...MOCK_CURRENT_USER, ...req, id: `user-${Date.now()}`, createdAt: new Date().toISOString() };
  return { success: true, data: { user, token: 'mock-jwt', refreshToken: 'mock-refresh' } };
};

// ─── Meals ───────────────────────────────────────────────
export const mockFetchMeals = async (category?: MealCategory): Promise<ApiResponse<Meal[]>> => {
  await mockDelay();
  const data = category ? MOCK_MEALS.filter(m => m.category === category) : MOCK_MEALS;
  return { success: true, data };
};

export const mockFetchMealById = async (id: string): Promise<ApiResponse<Meal>> => {
  await mockDelay();
  const meal = MOCK_MEALS.find(m => m.id === id);
  if (!meal) throw new Error('Meal not found');
  return { success: true, data: meal };
};

// ─── Orders ──────────────────────────────────────────────
export const mockFetchOrders = async (userId?: string): Promise<ApiResponse<Order[]>> => {
  await mockDelay();
  const data = userId ? MOCK_ORDERS.filter(o => o.userId === userId) : MOCK_ORDERS;
  return { success: true, data };
};

export const mockFetchOrderById = async (id: string): Promise<ApiResponse<Order>> => {
  await mockDelay();
  const order = MOCK_ORDERS.find(o => o.id === id);
  if (!order) throw new Error('Order not found');
  return { success: true, data: order };
};

// ─── Subscriptions ───────────────────────────────────────
export const mockFetchSubscription = async (): Promise<ApiResponse<Subscription>> => {
  await mockDelay();
  return { success: true, data: MOCK_SUBSCRIPTION };
};

export const mockFetchPlans = async (): Promise<ApiResponse<SubscriptionPlan[]>> => {
  await mockDelay();
  return { success: true, data: MOCK_PLANS };
};

export const mockFetchMealHistory = async (): Promise<ApiResponse<MealHistory[]>> => {
  await mockDelay();
  return { success: true, data: MOCK_MEAL_HISTORY };
};

// ─── Notifications ───────────────────────────────────────
export const mockFetchNotifications = async (): Promise<ApiResponse<Notification[]>> => {
  await mockDelay();
  return { success: true, data: MOCK_NOTIFICATIONS };
};

// ─── Availability & Reservations (Customer-facing) ───────
export const mockFetchAvailability = async (stallId?: string): Promise<ApiResponse<AvailabilityResponse>> => {
  await mockDelay();
  const items = stallId ? MOCK_INVENTORY.filter(i => i.stallId === stallId) : MOCK_INVENTORY;
  return { success: true, data: { items, lastUpdated: new Date().toISOString() } };
};

export const mockFetchReservations = async (): Promise<ApiResponse<MealReservation[]>> => {
  await mockDelay();
  return { success: true, data: MOCK_RESERVATIONS };
};

export const mockReserveMeal = async (req: ReserveMealRequest): Promise<ApiResponse<MealReservation>> => {
  await mockDelay();
  const invItem = MOCK_INVENTORY.find(i => i.id === req.inventoryItemId);
  const reservation: MealReservation = {
    id: `res-${Date.now()}`,
    userId: MOCK_CURRENT_USER.id,
    inventoryItemId: req.inventoryItemId,
    mealName: invItem?.mealName ?? 'Unknown Meal',
    stallName: 'RollBowl Main Kitchen',
    quantity: req.quantity,
    pickupTime: req.pickupTime,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };
  return { success: true, data: reservation };
};

// ─── Profile ─────────────────────────────────────────────
export const mockFetchAddresses = async (): Promise<ApiResponse<Address[]>> => {
  await mockDelay();
  return { success: true, data: MOCK_ADDRESSES };
};

export const mockFetchPayments = async (): Promise<ApiResponse<PaymentRecord[]>> => {
  await mockDelay();
  return { success: true, data: MOCK_PAYMENTS };
};
