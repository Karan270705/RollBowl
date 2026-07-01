import { MenuSchedule } from '@/src/services/menu';
import { AppConfig } from '@/src/constants/config';

export enum MenuStoreState {
  SCHEDULED = 'SCHEDULED',             // Future menu, ordering not open yet
  ORDERING_OPEN = 'ORDERING_OPEN',     // Ordering is open
  ORDERS_CLOSED = 'ORDERS_CLOSED',     // Ordering closed, prep time
  PICKUP_ACTIVE = 'PICKUP_ACTIVE',     // Pickup window is active
  KITCHEN_CLOSED = 'KITCHEN_CLOSED',   // After pickup, before next menu opens
  NO_MENU = 'NO_MENU',                 // No published menu exists
}

export interface StoreStatus {
  state: MenuStoreState;
  title: string;
  subtitle: string;
  isOrderingOpen: boolean;
}

/**
 * Helper to parse a time string "HH:mm" and set it on a target date.
 */
function setTimeOnDate(date: Date, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const newDate = new Date(date);
  newDate.setHours(hours, minutes, 0, 0);
  return newDate;
}

export function getMenuState(activeMenu: MenuSchedule | null | undefined): StoreStatus {
  if (!activeMenu) {
    return {
      state: MenuStoreState.NO_MENU,
      title: 'Menu Coming Soon',
      subtitle: 'The kitchen has not published tomorrow\'s menu yet.',
      isOrderingOpen: false,
    };
  }

  const now = new Date();
  const visibleFrom = new Date(activeMenu.visible_from);
  const orderCutoff = new Date(activeMenu.order_cutoff);
  
  // Pickup times are typically bound to the target date of the menu (e.g. Tomorrow)
  // For simplicity, we compare based on "today's" pickup window to determine generic state
  const pickupStart = setTimeOnDate(now, AppConfig.BUSINESS.PICKUP_START_TIME);
  const pickupEnd = setTimeOnDate(now, AppConfig.BUSINESS.PICKUP_END_TIME);

  if (now < visibleFrom) {
    return {
      state: MenuStoreState.SCHEDULED,
      title: 'Preview Tomorrow\'s Menu',
      subtitle: `Ordering opens at ${visibleFrom.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
      isOrderingOpen: false,
    };
  }

  if (now >= visibleFrom && now <= orderCutoff) {
    return {
      state: MenuStoreState.ORDERING_OPEN,
      title: 'Tomorrow\'s Menu Available',
      subtitle: `Place your order before ${orderCutoff.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
      isOrderingOpen: true,
    };
  }

  if (now > orderCutoff && now < pickupStart) {
    return {
      state: MenuStoreState.ORDERS_CLOSED,
      title: 'Orders Closed',
      subtitle: 'We are preparing the meals. Pickup starts soon.',
      isOrderingOpen: false,
    };
  }

  if (now >= pickupStart && now <= pickupEnd) {
    return {
      state: MenuStoreState.PICKUP_ACTIVE,
      title: 'Pickup Window Active',
      subtitle: 'Head to the stall to collect your order.',
      isOrderingOpen: false,
    };
  }

  // now > pickupEnd
  return {
    state: MenuStoreState.KITCHEN_CLOSED,
    title: 'Kitchen Closed',
    subtitle: 'Check back later for new menus.',
    isOrderingOpen: false,
  };
}
