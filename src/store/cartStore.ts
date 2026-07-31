import { create } from 'zustand';
import { CartItem, Meal } from '@/src/types/models';

export interface AddedMealEvent {
  meal: Meal;
  timestamp: number;
  wasEmpty: boolean;
}

interface CartState {
  items: CartItem[];
  lastAddedMeal: AddedMealEvent | null;
  addItem: (meal: Meal, quantity?: number) => void;
  removeItem: (mealId: string) => void;
  updateQuantity: (mealId: string, quantity: number) => void;
  clearCart: () => void;
  getItemCount: () => number;
  getSubtotal: () => number;
  clearLastAddedMeal: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  lastAddedMeal: null,
  addItem: (meal, quantity = 1) => set((state) => {
    const wasEmpty = state.items.reduce((sum, i) => sum + i.quantity, 0) === 0;
    const existing = state.items.find((i) => i.meal.id === meal.id);
    let newItems: CartItem[];
    if (existing) {
      newItems = state.items.map((i) =>
        i.meal.id === meal.id ? { ...i, quantity: i.quantity + quantity } : i
      );
    } else {
      newItems = [...state.items, { meal, quantity }];
    }
    return {
      items: newItems,
      lastAddedMeal: {
        meal,
        timestamp: Date.now(),
        wasEmpty,
      },
    };
  }),
  removeItem: (mealId) => set((state) => ({
    items: state.items.filter((i) => i.meal.id !== mealId),
  })),
  updateQuantity: (mealId, quantity) => set((state) => ({
    items: quantity <= 0
      ? state.items.filter((i) => i.meal.id !== mealId)
      : state.items.map((i) => i.meal.id === mealId ? { ...i, quantity } : i),
  })),
  clearCart: () => set({ items: [], lastAddedMeal: null }),
  getItemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
  getSubtotal: () => get().items.reduce((sum, i) => sum + i.meal.price * i.quantity, 0),
  clearLastAddedMeal: () => set({ lastAddedMeal: null }),
}));

export const selectTotalCartQuantity = (state: CartState): number =>
  state.items.reduce((sum, i) => sum + i.quantity, 0);

export const useCartItems = () => useCartStore((s) => s.items);
export const useCartItemCount = () => useCartStore(selectTotalCartQuantity);

