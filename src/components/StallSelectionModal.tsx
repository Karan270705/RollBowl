import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stall } from '@/src/types/models';

interface StallSelectionModalProps {
  visible: boolean;
  stalls: Stall[];
  isLoading: boolean;
  onSelectStall: (stallId: string) => Promise<void>;
  title?: string;
  subtitle?: string;
  isRequired?: boolean; // If true, cannot be dismissed
}

export function StallSelectionModal({
  visible,
  stalls,
  isLoading,
  onSelectStall,
  title = 'Choose Your Stall',
  subtitle = 'Select the food stall you want to order from.',
  isRequired = false,
}: StallSelectionModalProps) {
  const [selectedStallId, setSelectedStallId] = useState<string | null>(
    stalls.length === 1 ? stalls[0].id : null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = async () => {
    if (!selectedStallId) return;

    setIsSubmitting(true);
    try {
      await onSelectStall(selectedStallId);
    } catch (error) {
      console.error('[StallSelectionModal] Error:', error);
      // Error handling done by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={isRequired ? undefined : () => {}} // Prevent dismissal if required
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Loading stalls...</Text>
          </View>
        ) : stalls.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="#666" />
            <Text style={styles.emptyText}>
              No stalls are currently available.
            </Text>
            <Text style={styles.emptySubtext}>
              Please contact support for assistance.
            </Text>
          </View>
        ) : (
          <>
            <ScrollView style={styles.stallList}>
              {stalls.map((stall) => (
                <TouchableOpacity
                  key={stall.id}
                  style={[
                    styles.stallCard,
                    selectedStallId === stall.id && styles.stallCardSelected,
                  ]}
                  onPress={() => setSelectedStallId(stall.id)}
                >
                  {stall.imageUrl && (
                    <Image
                      source={{ uri: stall.imageUrl }}
                      style={styles.stallImage}
                    />
                  )}
                  <View style={styles.stallInfo}>
                    <Text style={styles.stallName}>{stall.name}</Text>
                    {stall.description && (
                      <Text style={styles.stallDescription}>
                        {stall.description}
                      </Text>
                    )}
                  </View>
                  {selectedStallId === stall.id && (
                    <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[
                  styles.continueButton,
                  (!selectedStallId || isSubmitting) &&
                    styles.continueButtonDisabled,
                ]}
                disabled={!selectedStallId || isSubmitting}
                onPress={handleContinue}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.continueButtonText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  stallList: {
    flex: 1,
    paddingHorizontal: 24,
  },
  stallCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e5e5',
    marginBottom: 12,
  },
  stallCardSelected: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  stallImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  stallInfo: {
    flex: 1,
  },
  stallName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  stallDescription: {
    fontSize: 14,
    color: '#666',
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
  },
  continueButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
