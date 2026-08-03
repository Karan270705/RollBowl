import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Colors } from '@/src/constants/theme';

interface DividerProps {
  style?: ViewStyle;
  color?: string;
  thickness?: number;
  vertical?: boolean;
}

export const Divider: React.FC<DividerProps> = ({
  style,
  color = Colors.divider,
  thickness = 1,
  vertical = false,
}) => {
  return (
    <View
      style={[
        vertical
          ? { width: thickness, backgroundColor: color }
          : { height: thickness, backgroundColor: color, width: '100%' },
        style,
      ]}
    />
  );
};

export default Divider;
