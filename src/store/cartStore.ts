import { create } from 'zustand';
import { CartItem, Meal } from '@/src/types/models';

interface CartState {
  items: CartItem[];
  addItem: (meal: Meal, quantity?: number) => void;
  removeItem: (mealId: string) => void;
  updateQuantity: (mealId: string, quantity: number) => void;
  clearCart: () => void;
  getItemCount: () => number;
  getSubtotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addItem: (meal, quantity = 1) => set((state) => {
    const existing = state.items.find((i) => i.meal.id === meal.id);
    if (existing) {
      return {
        items: state.items.map((i) =>
          i.meal.id === meal.id ? { ...i, quantity: i.quantity + quantity } : i
        ),
      };
    }
    return { items: [...state.items, { meal, quantity }] };
  }),
  removeItem: (mealId) => set((state) => ({
    items: state.items.filter((i) => i.meal.id !== mealId),
  })),
  updateQuantity: (mealId, quantity) => set((state) => ({
    items: quantity <= 0
      ? state.items.filter((i) => i.meal.id !== mealId)
      : state.items.map((i) => i.meal.id === mealId ? { ...i, quantity } : i),
  })),
  clearCart: () => set({ items: [] }),
  getItemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
  getSubtotal: () => get().items.reduce((sum, i) => sum + i.meal.price * i.quantity, 0),
}));

export const useCartItems = () => useCartStore((s) => s.items);
export const useCartItemCount = () => useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));
