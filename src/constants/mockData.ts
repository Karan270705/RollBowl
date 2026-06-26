import { MealCategory, MealType, NotificationType, OrderStatus, OrderType, PaymentStatus, SubscriptionStatus, UserRole } from './enums';
import type { City, University, College, Stall, Meal, Order, OrderItem, SubscriptionPlan, Subscription, MealHistory, Notification, InventoryItem, User, Address, PaymentRecord, MealReservation } from '@/src/types/models';

// ─── Geography ───────────────────────────────────────────
export const MOCK_CITIES: City[] = [
  { id: 'city-1', name: 'Pune', state: 'Maharashtra', isActive: true },
  { id: 'city-2', name: 'Mumbai', state: 'Maharashtra', isActive: true },
];

export const MOCK_UNIVERSITIES: University[] = [
  { id: 'uni-1', name: 'Savitribai Phule Pune University', cityId: 'city-1' },
  { id: 'uni-2', name: 'MIT World Peace University', cityId: 'city-1' },
  { id: 'uni-3', name: 'Mumbai University', cityId: 'city-2' },
];

export const MOCK_COLLEGES: College[] = [
  { id: 'col-1', name: 'PICT', universityId: 'uni-1', cityId: 'city-1', address: 'Dhankawadi, Pune', isActive: true },
  { id: 'col-2', name: 'COEP Technological University', universityId: 'uni-1', cityId: 'city-1', address: 'Shivajinagar, Pune', isActive: true },
  { id: 'col-3', name: 'MIT College of Engineering', universityId: 'uni-2', cityId: 'city-1', address: 'Kothrud, Pune', isActive: true },
  { id: 'col-4', name: 'DJ Sanghvi', universityId: 'uni-3', cityId: 'city-2', address: 'Vile Parle, Mumbai', isActive: true },
  { id: 'col-5', name: 'VJTI', universityId: 'uni-3', cityId: 'city-2', address: 'Matunga, Mumbai', isActive: true },
];

export const MOCK_STALLS: Stall[] = [
  { id: 'stall-1', name: 'RollBowl Main Kitchen', collegeId: 'col-1', operatorId: 'user-op-1', description: 'Fresh healthy bowls & rolls', isActive: true, rating: 4.5, totalRatings: 234 },
  { id: 'stall-2', name: 'Campus Bites', collegeId: 'col-2', operatorId: 'user-op-2', description: 'Quick bites & combos', isActive: true, rating: 4.2, totalRatings: 189 },
  { id: 'stall-3', name: 'Green Bowl Express', collegeId: 'col-3', operatorId: 'user-op-3', description: 'Vegan & healthy options', isActive: true, rating: 4.7, totalRatings: 156 },
  { id: 'stall-4', name: 'Chai & More', collegeId: 'col-1', operatorId: 'user-op-4', description: 'Beverages & snacks', isActive: true, rating: 4.3, totalRatings: 312 },
];

// ─── Users ───────────────────────────────────────────────
export const MOCK_CURRENT_USER: User = {
  id: 'user-1', name: 'Rohan Sharma', email: 'rohan@email.com', phone: '+919876543210',
  role: UserRole.CUSTOMER, collegeId: 'col-1', cityId: 'city-1', createdAt: '2025-01-15T10:00:00Z',
};

export const MOCK_ADDRESSES: Address[] = [
  { id: 'addr-1', userId: 'user-1', label: 'Hostel', fullAddress: 'Room 204, Boys Hostel, PICT Campus', isDefault: true },
  { id: 'addr-2', userId: 'user-1', label: 'Department', fullAddress: 'CS Department, Block A, PICT', isDefault: false },
];

// ─── Meals ───────────────────────────────────────────────
export const MOCK_MEALS: Meal[] = [
  { id: 'meal-1', name: 'Paneer Tikka Bowl', description: 'Grilled paneer with quinoa, fresh veggies, and mint chutney.', price: 149, originalPrice: 199, category: MealCategory.LUNCH, type: MealType.VEG, stallId: 'stall-1', imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400', isAvailable: true, isFeatured: true, rating: 4.6, totalRatings: 89, preparationTime: 15, nutrition: { calories: 420, protein: '22g', carbs: '45g', fat: '12g' }, tags: ['Bestseller', 'Healthy'] },
  { id: 'meal-2', name: 'Chicken Shawarma Roll', description: 'Tender chicken wrapped in rumali roti with garlic sauce.', price: 129, category: MealCategory.LUNCH, type: MealType.NON_VEG, stallId: 'stall-1', imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400', isAvailable: true, isFeatured: true, rating: 4.8, totalRatings: 156, preparationTime: 12, nutrition: { calories: 380, protein: '28g', carbs: '35g', fat: '14g' }, tags: ['Popular'] },
  { id: 'meal-3', name: 'Masala Dosa', description: 'Crispy dosa with potato filling, sambar & chutneys.', price: 89, category: MealCategory.BREAKFAST, type: MealType.VEG, stallId: 'stall-2', imageUrl: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400', isAvailable: true, isFeatured: false, rating: 4.4, totalRatings: 201, preparationTime: 10, tags: ['Classic'] },
  { id: 'meal-4', name: 'Vegan Buddha Bowl', description: 'Brown rice, roasted chickpeas, avocado, and tahini dressing.', price: 169, category: MealCategory.LUNCH, type: MealType.VEGAN, stallId: 'stall-3', imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400', isAvailable: true, isFeatured: true, rating: 4.7, totalRatings: 67, preparationTime: 15, nutrition: { calories: 350, protein: '14g', carbs: '48g', fat: '10g' }, tags: ['Vegan', 'Healthy'] },
  { id: 'meal-5', name: 'Egg Bhurji Pav', description: 'Spicy scrambled eggs with buttered pav.', price: 79, category: MealCategory.BREAKFAST, type: MealType.NON_VEG, stallId: 'stall-2', imageUrl: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400', isAvailable: true, isFeatured: false, rating: 4.3, totalRatings: 145, preparationTime: 8, tags: ['Quick'] },
  { id: 'meal-6', name: 'Rajma Chawal Combo', description: 'North Indian rajma with steamed rice and salad.', price: 109, category: MealCategory.LUNCH, type: MealType.VEG, stallId: 'stall-1', imageUrl: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400', isAvailable: true, isFeatured: false, rating: 4.5, totalRatings: 178, preparationTime: 12, tags: ['Comfort Food'] },
  { id: 'meal-7', name: 'Cold Coffee', description: 'Creamy cold coffee with ice cream.', price: 69, category: MealCategory.BEVERAGES, type: MealType.VEG, stallId: 'stall-4', imageUrl: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400', isAvailable: true, isFeatured: false, rating: 4.1, totalRatings: 234, preparationTime: 5, tags: ['Refreshing'] },
  { id: 'meal-8', name: 'Chole Bhature', description: 'Fluffy bhature with spicy chole and onion pickle.', price: 99, category: MealCategory.LUNCH, type: MealType.VEG, stallId: 'stall-2', imageUrl: 'https://images.unsplash.com/photo-1606491956689-2ea866880049?w=400', isAvailable: true, isFeatured: false, rating: 4.6, totalRatings: 198, preparationTime: 14, tags: ['Classic'] },
  { id: 'meal-9', name: 'Grilled Chicken Salad', description: 'Fresh greens, grilled chicken, cherry tomatoes, and balsamic.', price: 179, category: MealCategory.DINNER, type: MealType.NON_VEG, stallId: 'stall-3', imageUrl: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400', isAvailable: true, isFeatured: true, rating: 4.5, totalRatings: 56, preparationTime: 15, tags: ['Healthy', 'High Protein'] },
  { id: 'meal-10', name: 'Samosa (2 pcs)', description: 'Crispy samosas with mint and tamarind chutney.', price: 39, category: MealCategory.SNACKS, type: MealType.VEG, stallId: 'stall-4', imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400', isAvailable: true, isFeatured: false, rating: 4.2, totalRatings: 320, preparationTime: 5, tags: ['Quick', 'Classic'] },
  { id: 'meal-11', name: 'Thali Meal', description: 'Complete Indian thali with roti, dal, sabzi, rice, and dessert.', price: 159, category: MealCategory.DINNER, type: MealType.VEG, stallId: 'stall-1', imageUrl: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=400', isAvailable: true, isFeatured: true, rating: 4.8, totalRatings: 267, preparationTime: 20, tags: ['Bestseller', 'Value'] },
  { id: 'meal-12', name: 'Masala Chai', description: 'Authentic Indian masala chai brewed with spices.', price: 29, category: MealCategory.BEVERAGES, type: MealType.VEG, stallId: 'stall-4', imageUrl: 'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=400', isAvailable: true, isFeatured: false, rating: 4.4, totalRatings: 456, preparationTime: 5, tags: ['Classic'] },
  { id: 'meal-13', name: 'Veg Combo Meal', description: 'Roti, paneer curry, dal, rice, and gulab jamun.', price: 139, originalPrice: 169, category: MealCategory.COMBOS, type: MealType.VEG, stallId: 'stall-1', imageUrl: 'https://images.unsplash.com/photo-1567337710282-00832b415979?w=400', isAvailable: true, isFeatured: false, rating: 4.5, totalRatings: 134, preparationTime: 18, tags: ['Value', 'Combo'] },
  { id: 'meal-14', name: 'Tandoori Chicken', description: 'Juicy tandoori chicken with mint dip and onion rings.', price: 199, category: MealCategory.DINNER, type: MealType.NON_VEG, stallId: 'stall-2', imageUrl: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400', isAvailable: false, isFeatured: false, rating: 4.7, totalRatings: 89, preparationTime: 25, tags: ['Premium'] },
  { id: 'meal-15', name: 'Fresh Fruit Smoothie', description: 'Blend of seasonal fruits with yogurt and honey.', price: 89, category: MealCategory.BEVERAGES, type: MealType.VEG, stallId: 'stall-3', imageUrl: 'https://images.unsplash.com/photo-1505252585461-04db1eb84625?w=400', isAvailable: true, isFeatured: false, rating: 4.3, totalRatings: 98, preparationTime: 5, tags: ['Healthy', 'Refreshing'] },
];

// ─── Orders ──────────────────────────────────────────────
const makeItem = (id: string, mealId: string, name: string, qty: number, price: number): OrderItem => ({
  id, mealId, mealName: name, quantity: qty, unitPrice: price, totalPrice: price * qty,
});

export const MOCK_ORDERS: Order[] = [
  { id: 'ord-1', orderNumber: 'RB-1001', userId: 'user-1', customerName: 'Rohan Sharma', stallId: 'stall-1', stallName: 'RollBowl Main Kitchen', items: [makeItem('oi-1','meal-1','Paneer Tikka Bowl',1,149), makeItem('oi-2','meal-7','Cold Coffee',2,69)], status: OrderStatus.PREPARING, orderType: OrderType.PRE_ORDER, paymentStatus: PaymentStatus.PAID, subtotal: 287, tax: 14, discount: 0, total: 301, createdAt: '2026-05-14T09:30:00Z', updatedAt: '2026-05-14T09:35:00Z', estimatedReadyTime: '2026-05-14T09:50:00Z' },
  { id: 'ord-2', orderNumber: 'RB-1002', userId: 'user-2', customerName: 'Priya Patel', stallId: 'stall-1', stallName: 'RollBowl Main Kitchen', items: [makeItem('oi-3','meal-11','Thali Meal',2,159)], status: OrderStatus.PENDING, orderType: OrderType.ON_STALL, paymentStatus: PaymentStatus.PENDING, subtotal: 318, tax: 16, discount: 20, total: 314, createdAt: '2026-05-14T09:40:00Z', updatedAt: '2026-05-14T09:40:00Z' },
  { id: 'ord-3', orderNumber: 'RB-1003', userId: 'user-3', customerName: 'Amit Kumar', stallId: 'stall-2', stallName: 'Campus Bites', items: [makeItem('oi-4','meal-3','Masala Dosa',1,89), makeItem('oi-5','meal-5','Egg Bhurji Pav',1,79)], status: OrderStatus.READY, orderType: OrderType.PRE_ORDER, paymentStatus: PaymentStatus.PAID, subtotal: 168, tax: 8, discount: 0, total: 176, createdAt: '2026-05-14T08:15:00Z', updatedAt: '2026-05-14T08:40:00Z' },
  { id: 'ord-4', orderNumber: 'RB-1004', userId: 'user-4', customerName: 'Sneha Desai', stallId: 'stall-1', stallName: 'RollBowl Main Kitchen', items: [makeItem('oi-6','meal-2','Chicken Shawarma Roll',2,129), makeItem('oi-7','meal-12','Masala Chai',2,29)], status: OrderStatus.CONFIRMED, orderType: OrderType.SUBSCRIPTION, paymentStatus: PaymentStatus.PAID, subtotal: 316, tax: 16, discount: 50, total: 282, createdAt: '2026-05-14T10:00:00Z', updatedAt: '2026-05-14T10:02:00Z' },
  { id: 'ord-5', orderNumber: 'RB-1005', userId: 'user-1', customerName: 'Rohan Sharma', stallId: 'stall-3', stallName: 'Green Bowl Express', items: [makeItem('oi-8','meal-4','Vegan Buddha Bowl',1,169)], status: OrderStatus.DELIVERED, orderType: OrderType.PRE_ORDER, paymentStatus: PaymentStatus.PAID, subtotal: 169, tax: 8, discount: 0, total: 177, createdAt: '2026-05-13T12:00:00Z', updatedAt: '2026-05-13T12:30:00Z' },
  { id: 'ord-6', orderNumber: 'RB-1006', userId: 'user-5', customerName: 'Karan Mehta', stallId: 'stall-4', stallName: 'Chai & More', items: [makeItem('oi-9','meal-10','Samosa (2 pcs)',3,39), makeItem('oi-10','meal-12','Masala Chai',3,29)], status: OrderStatus.PICKED_UP, orderType: OrderType.ON_STALL, paymentStatus: PaymentStatus.PAID, subtotal: 204, tax: 10, discount: 0, total: 214, createdAt: '2026-05-14T07:30:00Z', updatedAt: '2026-05-14T07:50:00Z' },
  { id: 'ord-7', orderNumber: 'RB-1007', userId: 'user-6', customerName: 'Ananya Singh', stallId: 'stall-1', stallName: 'RollBowl Main Kitchen', items: [makeItem('oi-11','meal-13','Veg Combo Meal',1,139)], status: OrderStatus.PENDING, orderType: OrderType.PRE_ORDER, paymentStatus: PaymentStatus.PENDING, subtotal: 139, tax: 7, discount: 0, total: 146, createdAt: '2026-05-14T10:10:00Z', updatedAt: '2026-05-14T10:10:00Z' },
];

// ─── Subscriptions ───────────────────────────────────────
export const MOCK_PLANS: SubscriptionPlan[] = [
  { id: 'plan-1', name: 'Basic', description: 'Perfect for light eaters', price: 1499, durationDays: 30, mealsPerDay: 1, totalMeals: 30, features: ['1 meal per day', 'Lunch only', 'Weekdays only', 'Basic support'], isPopular: false },
  { id: 'plan-2', name: 'Standard', description: 'Most popular choice', price: 2999, durationDays: 30, mealsPerDay: 2, totalMeals: 60, features: ['2 meals per day', 'Lunch & Dinner', 'All 7 days', 'Priority support', '5% discount on extras'], isPopular: true, badge: 'Most Popular' },
  { id: 'plan-3', name: 'Premium', description: 'All-inclusive meal plan', price: 4499, durationDays: 30, mealsPerDay: 3, totalMeals: 90, features: ['3 meals per day', 'All meals', 'All 7 days', 'Premium support', '10% discount on extras', 'Free beverages'], isPopular: false, badge: 'Best Value' },
];

export const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub-1', userId: 'user-1', planId: 'plan-2', planName: 'Standard',
  status: SubscriptionStatus.ACTIVE, startDate: '2026-05-01', endDate: '2026-05-31',
  totalMeals: 60, consumedMeals: 28, remainingMeals: 32, mealsPerDay: 2,
};

export const MOCK_MEAL_HISTORY: MealHistory[] = [
  { id: 'mh-1', subscriptionId: 'sub-1', mealName: 'Paneer Tikka Bowl', date: '2026-05-14', time: '12:30 PM', category: MealCategory.LUNCH },
  { id: 'mh-2', subscriptionId: 'sub-1', mealName: 'Thali Meal', date: '2026-05-14', time: '7:30 PM', category: MealCategory.DINNER },
  { id: 'mh-3', subscriptionId: 'sub-1', mealName: 'Masala Dosa', date: '2026-05-13', time: '8:30 AM', category: MealCategory.BREAKFAST },
  { id: 'mh-4', subscriptionId: 'sub-1', mealName: 'Rajma Chawal Combo', date: '2026-05-13', time: '1:00 PM', category: MealCategory.LUNCH },
  { id: 'mh-5', subscriptionId: 'sub-1', mealName: 'Veg Combo Meal', date: '2026-05-12', time: '12:45 PM', category: MealCategory.LUNCH },
];

// ─── Notifications ───────────────────────────────────────
export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'notif-1', title: 'Order Ready! 🎉', body: 'Your Paneer Tikka Bowl is ready for pickup.', type: NotificationType.ORDER_UPDATE, isRead: false, createdAt: '2026-05-14T09:50:00Z' },
  { id: 'notif-2', title: '50% Off Today!', body: 'Get 50% off on all breakfast items before 10 AM.', type: NotificationType.PROMOTION, isRead: false, createdAt: '2026-05-14T07:00:00Z' },
  { id: 'notif-3', title: 'Subscription Reminder', body: 'Your Standard plan renews in 17 days.', type: NotificationType.SUBSCRIPTION, isRead: true, createdAt: '2026-05-13T10:00:00Z' },
  { id: 'notif-4', title: 'Order Delivered ✅', body: 'Your order RB-1005 has been delivered.', type: NotificationType.ORDER_UPDATE, isRead: true, createdAt: '2026-05-13T12:30:00Z' },
  { id: 'notif-5', title: 'New Stall Alert!', body: 'Green Bowl Express is now available on campus.', type: NotificationType.SYSTEM, isRead: true, createdAt: '2026-05-12T09:00:00Z' },
  { id: 'notif-6', title: 'Free Chai Friday ☕', body: 'Get a free masala chai with any meal order today.', type: NotificationType.PROMOTION, isRead: false, createdAt: '2026-05-14T06:00:00Z' },
];

// ─── Inventory ───────────────────────────────────────────
export const MOCK_INVENTORY: InventoryItem[] = [
  { id: 'inv-1', mealId: 'meal-1', mealName: 'Paneer Tikka Bowl', stallId: 'stall-1', category: MealCategory.LUNCH, totalQuantity: 50, soldQuantity: 32, reservedQuantity: 8, availableQuantity: 10, price: 149, isAvailable: true },
  { id: 'inv-2', mealId: 'meal-2', mealName: 'Chicken Shawarma Roll', stallId: 'stall-1', category: MealCategory.LUNCH, totalQuantity: 40, soldQuantity: 28, reservedQuantity: 5, availableQuantity: 7, price: 129, isAvailable: true },
  { id: 'inv-3', mealId: 'meal-6', mealName: 'Rajma Chawal Combo', stallId: 'stall-1', category: MealCategory.LUNCH, totalQuantity: 60, soldQuantity: 45, reservedQuantity: 10, availableQuantity: 5, price: 109, isAvailable: true },
  { id: 'inv-4', mealId: 'meal-11', mealName: 'Thali Meal', stallId: 'stall-1', category: MealCategory.DINNER, totalQuantity: 45, soldQuantity: 40, reservedQuantity: 3, availableQuantity: 2, price: 159, isAvailable: true },
  { id: 'inv-5', mealId: 'meal-13', mealName: 'Veg Combo Meal', stallId: 'stall-1', category: MealCategory.COMBOS, totalQuantity: 30, soldQuantity: 30, reservedQuantity: 0, availableQuantity: 0, price: 139, isAvailable: false },
  { id: 'inv-6', mealId: 'meal-7', mealName: 'Cold Coffee', stallId: 'stall-4', category: MealCategory.BEVERAGES, totalQuantity: 100, soldQuantity: 55, reservedQuantity: 0, availableQuantity: 45, price: 69, isAvailable: true },
];

// ─── Extra Meal Reservations (Customer-facing) ──────────
export const MOCK_RESERVATIONS: MealReservation[] = [
  { id: 'res-1', userId: 'user-1', inventoryItemId: 'inv-1', mealName: 'Paneer Tikka Bowl', stallName: 'RollBowl Main Kitchen', quantity: 1, pickupTime: '2026-05-14T13:00:00Z', status: 'confirmed', createdAt: '2026-05-14T09:00:00Z' },
  { id: 'res-2', userId: 'user-1', inventoryItemId: 'inv-2', mealName: 'Chicken Shawarma Roll', stallName: 'RollBowl Main Kitchen', quantity: 2, pickupTime: '2026-05-14T13:30:00Z', status: 'pending', createdAt: '2026-05-14T10:00:00Z' },
];

export const MOCK_PAYMENTS: PaymentRecord[] = [
  { id: 'pay-1', orderId: 'ord-1', amount: 301, status: PaymentStatus.PAID, method: 'UPI', transactionId: 'TXN001', createdAt: '2026-05-14T09:30:00Z' },
  { id: 'pay-2', subscriptionId: 'sub-1', amount: 2999, status: PaymentStatus.PAID, method: 'Card', transactionId: 'TXN002', createdAt: '2026-05-01T10:00:00Z' },
  { id: 'pay-3', orderId: 'ord-5', amount: 177, status: PaymentStatus.PAID, method: 'UPI', transactionId: 'TXN003', createdAt: '2026-05-13T12:00:00Z' },
];
