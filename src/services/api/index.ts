/**
 * API service layer — Customer App.
 * Currently delegates to mock implementations.
 * When Supabase backend is ready, replace mock imports with real calls.
 */

export { signIn as login, signUp as signup } from '../auth';

export {
  mockFetchMeals as fetchMeals,
  mockFetchMealById as fetchMealById,
  mockFetchFeaturedMeals as fetchFeaturedMeals,
  mockFetchOrders as fetchOrders,
  mockFetchOrderById as fetchOrderById,
  mockFetchSubscription as fetchSubscription,
  mockFetchPlans as fetchPlans,
  mockFetchMealHistory as fetchMealHistory,
  mockFetchNotifications as fetchNotifications,
  mockFetchAvailability as fetchAvailability,
  mockFetchReservations as fetchReservations,
  mockReserveMeal as reserveMeal,
  mockFetchAddresses as fetchAddresses,
  mockFetchPayments as fetchPayments,
} from '../mock';
