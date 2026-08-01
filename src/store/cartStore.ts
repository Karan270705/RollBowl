import { create } from 'zustand';
import { Alert } from 'react-native';
import { CartItem, Meal } from '@/src/types/models';

export interface AddedMealEvent {
  meal: Meal;
  timestamp: number;
  wasEmpty: boolean;
}

interface CartState {
  items: CartItem[];
  cartPickupDate: string | null;
  lastAddedMeal: AddedMealEvent | null;
  addItem: (meal: Meal, pickupDate?: string, quantity?: number) => boolean;
  removeItem: (mealId: string) => void;
  updateQuantity: (mealId: string, quantity: number) => void;
  clearCart: () => void;
  getItemCount: () => number;
  getSubtotal: () => number;
  clearLastAddedMeal: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  cartPickupDate: null,
  lastAddedMeal: null,
  addItem: (meal, pickupDate, quantity = 1) => {
    let itemAdded = false;
    set((state) => {
      const wasEmpty = state.items.reduce((sum, i) => sum + i.quantity, 0) === 0;

      // When cart already has items, check date match
      if (!wasEmpty) {
        if (
          !state.cartPickupDate || // Legacy cart without date
          (pickupDate && pickupDate !== state.cartPickupDate)
        ) {
          Alert.alert(
            "Different Pickup Date",
            "Your cart contains items for another pickup date. Clear it before adding from this menu."
          );
          return state;
        }
      }

      const existing = state.items.find((i) => i.meal.id === meal.id);
      let newItems: CartItem[];
      if (existing) {
        newItems = state.items.map((i) =>
          i.meal.id === meal.id ? { ...i, quantity: i.quantity + quantity } : i
        );
      } else {
        newItems = [...state.items, { meal, quantity }];
      }

      itemAdded = true;
      const resolvedPickupDate = wasEmpty ? (pickupDate || null) : state.cartPickupDate;

      return {
        items: newItems,
        cartPickupDate: resolvedPickupDate,
        lastAddedMeal: {
          meal,
          timestamp: Date.now(),
          wasEmpty,
        },
      };
    });
    return itemAdded;
  },
  removeItem: (mealId) =>
    set((state) => {
      const newItems = state.items.filter((i) => i.meal.id !== mealId);
      return {
        items: newItems,
        cartPickupDate: newItems.length === 0 ? null : state.cartPickupDate,
      };
    }),
  updateQuantity: (mealId, quantity) =>
    set((state) => {
      const newItems =
        quantity <= 0
          ? state.items.filter((i) => i.meal.id !== mealId)
          : state.items.map((i) => (i.meal.id === mealId ? { ...i, quantity } : i));
      return {
        items: newItems,
        cartPickupDate: newItems.length === 0 ? null : state.cartPickupDate,
      };
    }),
  clearCart: () => set({ items: [], cartPickupDate: null, lastAddedMeal: null }),
  getItemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
  getSubtotal: () => get().items.reduce((sum, i) => sum + i.meal.price * i.quantity, 0),
  clearLastAddedMeal: () => set({ lastAddedMeal: null }),
}));

export const selectTotalCartQuantity = (state: CartState): number =>
  state.items.reduce((sum, i) => sum + i.quantity, 0);

export const useCartItems = () => useCartStore((s) => s.items);
export const useCartItemCount = () => useCartStore(selectTotalCartQuantity);
