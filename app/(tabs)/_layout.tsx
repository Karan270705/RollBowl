import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography } from '@/src/constants/theme';
import { useUser, useCartStore, selectTotalCartQuantity } from '@/src/store';
import { useNotifications } from '@/src/hooks';
import { CartToast } from '@/src/components/ui';

export default function TabsLayout() {
  const user = useUser();
  const { data: notifications = [] } = useNotifications(user?.id);
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const cartQuantity = useCartStore(selectTotalCartQuantity);

  const cartBadgeValue = cartQuantity > 0 ? (cartQuantity > 9 ? '9+' : cartQuantity) : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textTertiary,
          tabBarLabelStyle: { fontFamily: Typography.family.medium, fontSize: 11, marginBottom: 2 },
          tabBarStyle: {
            backgroundColor: Colors.surface,
            borderTopColor: Colors.borderLight,
            height: 60,
            paddingTop: 4,
          },
        }}
      >
        <Tabs.Screen name="(home)" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }} />
        <Tabs.Screen 
          name="(orders)" 
          options={{ 
            title: 'Orders', 
            tabBarBadge: cartBadgeValue,
            tabBarAccessibilityLabel: cartQuantity > 0 ? `Orders, ${cartQuantity} items in cart` : 'Orders',
            tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} /> 
          }} 
        />
        <Tabs.Screen name="(subscription)" options={{ title: 'Subscribe', tabBarIcon: ({ color, size }) => <Ionicons name="card-outline" size={size} color={color} /> }} />
        <Tabs.Screen 
          name="(notifications)" 
          options={{ 
            title: 'Alerts', 
            tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
            tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} /> 
          }} 
        />
        <Tabs.Screen name="(profile)" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }} />
      </Tabs>
      <CartToast />
    </View>
  );
}

