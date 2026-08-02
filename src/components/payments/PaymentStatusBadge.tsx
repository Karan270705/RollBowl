import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '@/src/constants/theme';
import { PaymentVerificationStatus, SubscriptionRequestStatus } from '@/src/constants/enums';

interface Props {
  status: PaymentVerificationStatus | SubscriptionRequestStatus;
  style?: any;
}

export function PaymentStatusBadge({ status, style }: Props) {
  let label = '';
  let bgColor = '';
  let textColor = '';

  switch (status) {
    case PaymentVerificationStatus.NOT_REQUIRED:
      label = 'No Proof Needed';
      bgColor = Colors.surfaceElevated;
      textColor = Colors.textSecondary;
      break;
    case PaymentVerificationStatus.AWAITING_PROOF:
    case SubscriptionRequestStatus.AWAITING_PROOF:
      label = 'Awaiting Screenshot';
      bgColor = Colors.warningLight;
      textColor = Colors.warning;
      break;
    case PaymentVerificationStatus.PENDING:
    case SubscriptionRequestStatus.VERIFICATION_PENDING:
      label = 'Pending Verification';
      bgColor = Colors.infoLight;
      textColor = Colors.info;
      break;
    case PaymentVerificationStatus.VERIFIED:
    case SubscriptionRequestStatus.APPROVED:
      label = 'Approved & Active';
      bgColor = Colors.successLight;
      textColor = Colors.success;
      break;
    case PaymentVerificationStatus.REJECTED:
    case SubscriptionRequestStatus.REJECTED:
      label = 'Rejected';
      bgColor = Colors.errorLight;
      textColor = Colors.error;
      break;
    case PaymentVerificationStatus.EXPIRED:
    case SubscriptionRequestStatus.CANCELLED:
      label = 'Cancelled';
      bgColor = Colors.surfaceElevated;
      textColor = Colors.textSecondary;
      break;
    default:
      label = String(status);
      bgColor = Colors.surfaceElevated;
      textColor = Colors.textSecondary;
  }

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }, style]}>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radii.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.family.semiBold,
  },
});
