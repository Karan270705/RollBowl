import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Colors, Radii, Spacing, Typography } from '@/src/constants/theme';
import { Button } from '@/src/components/ui';
import { getPaymentQrPublicUrl } from '@/src/services/payments';
import { formatCurrency } from '@/src/utils/formatters';

interface Props {
  amount: number;
  recipientName: string;
  upiId: string;
  qrImagePath?: string;
  children?: React.ReactNode;
}

export function UpiPaymentPanel({ amount, recipientName, upiId, qrImagePath, children }: Props) {
  const handleCopy = async () => {
    await Clipboard.setStringAsync(upiId);
    // Could add a toast here
  };

  const [qrImageFailed, setQrImageFailed] = useState(false);

  const hasImageQr = qrImagePath && qrImagePath.trim().length > 0 && !qrImagePath.startsWith('http');
  const qrUrl = hasImageQr ? getPaymentQrPublicUrl(qrImagePath as string) : null;
  const showImageQr = hasImageQr && !!qrUrl && !qrImageFailed;
  const generatedFallback = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(recipientName)}&am=${amount}&cu=INR`;

  if (__DEV__) {
    console.log('[QR Diagnostics] qrImagePath:', qrImagePath, 'qrUrl:', qrUrl, 'failed:', qrImageFailed);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan to Pay</Text>
      
      <View style={styles.qrContainer}>
        {showImageQr ? (
          <Image 
            source={{ uri: qrUrl as string }} 
            style={styles.qrImage} 
            resizeMode="contain" 
            accessibilityLabel="Payment QR Code"
            onError={() => setQrImageFailed(true)}
          />
        ) : (
          <QRCode 
            value={generatedFallback} 
            size={180} 
            color={Colors.textPrimary}
            backgroundColor={Colors.surface}
          />
        )}
      </View>

      <Text style={styles.amountText}>{formatCurrency(amount)}</Text>
      <Text style={styles.recipientText}>To: {recipientName}</Text>

      <View style={styles.upiRow}>
        <View style={styles.upiIdContainer}>
          <Text style={styles.upiIdLabel}>UPI ID:</Text>
          <Text style={styles.upiIdText}>{upiId}</Text>
        </View>
        <Button 
          title="Copy" 
          variant="outline" 
          size="sm" 
          onPress={handleCopy} 
        />
      </View>

      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsTitle}>Screenshot Instructions</Text>
        <Text style={styles.instructionsText}>
          Upload the complete payment confirmation screenshot. Make sure the screenshot clearly shows the paid amount, recipient, transaction ID and UTR/reference number. Do not crop or edit the image.
        </Text>
      </View>

      <View style={styles.pickerSection}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    width: '100%',
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  title: {
    fontSize: Typography.size.md,
    fontFamily: Typography.family.semiBold,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },
  qrContainer: {
    width: 200,
    height: 200,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: Spacing.md,
  },
  qrImage: {
    width: 180,
    height: 180,
  },
  amountText: {
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  recipientText: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  upiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: Colors.surfaceElevated,
    padding: Spacing.sm,
    borderRadius: Radii.md,
    marginBottom: Spacing.xl,
  },
  upiIdContainer: {
    flex: 1,
  },
  upiIdLabel: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  upiIdText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  instructionsContainer: {
    width: '100%',
    backgroundColor: Colors.primaryBg,
    padding: Spacing.base,
    borderRadius: Radii.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  instructionsTitle: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.semiBold,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  instructionsText: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  pickerSection: {
    width: '100%',
  },
});
