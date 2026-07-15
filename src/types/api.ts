/**
 * API layer types.
 * Generic response wrappers for consistent API handling.
 */

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  success: false;
  message: string;
  code: string;
  statusCode: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  name: string;
  email: string;
  phone: string;
  password: string;
  collegeId?: string;
  cityId?: string;
}

export interface AuthResponse {
  user: import('./models').User;
  token: string;
  refreshToken: string;
}

export interface OtpVerifyRequest {
  phone: string;
  otp: string;
}

export interface CreateOrderRequest {
  stallId: string;
  items: { mealId: string; quantity: number; specialInstructions?: string; useSubscription?: boolean }[];
  orderType: import('@/src/constants/enums').OrderType;
  notes?: string;
}

export interface ReserveMealRequest {
  inventoryItemId: string;
  quantity: number;
  pickupTime: string;
}

export interface AvailabilityResponse {
  items: import('./models').InventoryItem[];
  lastUpdated: string;
}

export interface SubmitPaymentProofRequest {
  orderId: string;
  screenshotPath: string;
  mimeType: string;
  size: number;
}

export interface SubmitSubscriptionPaymentProofRequest {
  requestId: string;
  screenshotPath: string;
  mimeType: string;
  size: number;
}

export interface CreateSubscriptionPurchaseRequest {
  stallId: string;
  planId: string;
}
