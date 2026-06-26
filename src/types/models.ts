/**
 * Core data models.
 * These interfaces define the shape of all entities in the RollBowl platform.
 * They are backend-agnostic and map directly to future API response shapes.
 */

import {
  MealCategory,
  MealType,
  NotificationType,
  OrderStatus,
  OrderType,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
} from '@/src/constants/enums';

// ─── Geography ───────────────────────────────────────────────

export interface City {
  id: string;
  name: string;
  state: string;
  isActive: boolean;
}

export interface University {
  id: string;
  name: string;
  cityId: string;
  logoUrl?: string;
}

export interface College {
  id: string;
  name: string;
  universityId: string;
  cityId: string;
  address: string;
  isActive: boolean;
}

// ─── Users ───────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatarUrl?: string;
  collegeId?: string;
  cityId?: string;
  createdAt: string;
}

export interface Address {
  id: string;
  userId: string;
  label: string;   // "Hostel", "Home", etc.
  fullAddress: string;
  landmark?: string;
  isDefault: boolean;
}

// ─── Stalls & Vendors ────────────────────────────────────────

export interface Stall {
  id: string;
  name: string;
  collegeId: string;
  operatorId: string;
  description: string;
  imageUrl?: string;
  isActive: boolean;
  rating: number;
  totalRatings: number;
}

// ─── Meals ───────────────────────────────────────────────────

export interface NutritionInfo {
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
}

export interface Meal {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;  // for showing discounts
  category: MealCategory;
  type: MealType;
  stallId: string;
  imageUrl: string;
  isAvailable: boolean;
  isFeatured: boolean;
  rating: number;
  totalRatings: number;
  preparationTime: number; // minutes
  nutrition?: NutritionInfo;
  tags: string[];
}

// ─── Cart ────────────────────────────────────────────────────

export interface CartItem {
  meal: Meal;
  quantity: number;
  specialInstructions?: string;
}

// ─── Orders ──────────────────────────────────────────────────

export interface OrderItem {
  id: string;
  mealId: string;
  mealName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specialInstructions?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  stallId: string;
  stallName: string;
  items: OrderItem[];
  status: OrderStatus;
  orderType: OrderType;
  paymentStatus: PaymentStatus;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  estimatedReadyTime?: string;
}

// ─── Subscriptions ───────────────────────────────────────────

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  durationDays: number;
  mealsPerDay: number;
  totalMeals: number;
  features: string[];
  isPopular: boolean;
  badge?: string;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  totalMeals: number;
  consumedMeals: number;
  remainingMeals: number;
  mealsPerDay: number;
}

export interface MealHistory {
  id: string;
  subscriptionId: string;
  mealName: string;
  date: string;
  time: string;
  category: MealCategory;
}

// ─── Notifications ───────────────────────────────────────────

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, string>;
}

// ─── Inventory (Stall Operator) ──────────────────────────────

export interface InventoryItem {
  id: string;
  mealId: string;
  mealName: string;
  stallId: string;
  category: MealCategory;
  totalQuantity: number;
  soldQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  price: number;
  isAvailable: boolean;
}

// ─── Analytics ───────────────────────────────────────────────

export interface DailySummary {
  date: string;
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  peakHour: string;
}

export interface StallAnalytics {
  totalItemsSold: number;
  totalRevenue: number;
  popularItems: { mealName: string; count: number }[];
  inventoryTurnover: number;
  averageDaily: number;
}

// ─── Payment ─────────────────────────────────────────────────

export interface PaymentRecord {
  id: string;
  orderId?: string;
  subscriptionId?: string;
  amount: number;
  status: PaymentStatus;
  method: string;
  transactionId?: string;
  createdAt: string;
}

// ─── Extra Meal Reservation ─────────────────────────────────

export interface MealReservation {
  id: string;
  userId: string;
  inventoryItemId: string;
  mealName: string;
  stallName: string;
  quantity: number;
  pickupTime: string;
  status: 'pending' | 'confirmed' | 'collected' | 'cancelled';
  createdAt: string;
}

// ─── Realtime Events (shared schema) ────────────────────────

export interface RealtimeEvent<T = unknown> {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  data: T;
  timestamp: string;
}
