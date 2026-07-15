import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/src/constants/theme';
import { Button } from '@/src/components/ui';

export interface SelectedImage {
  uri: string;
  mimeType: string;
  size: number;
}

interface Props {
  onImageSelected: (image: SelectedImage | null) => void;
  selectedImage: SelectedImage | null;
  isUploading?: boolean;
}

const MAX_FILE_SIZE = 5242880; // 5 MB

export function PaymentScreenshotPicker({ onImageSelected, selectedImage, isUploading }: Props) {
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false, // Do not allow cropping as per requirements
        quality: 0.8, // Preserve readability but compress slightly
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        
        let mimeType = asset.mimeType;
        if (!mimeType) {
          // Fallback based on extension
          if (asset.uri.toLowerCase().endsWith('.png')) mimeType = 'image/png';
          else if (asset.uri.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
          else mimeType = 'image/jpeg';
        }

        // Reject HEIC/HEIF or unsupported types
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
          alert('Unsupported image format. Please select a JPEG, PNG, or WebP image.');
          return;
        }

        let size = asset.fileSize;
        if (size === undefined || size === null) {
          const fileInfo = await FileSystem.getInfoAsync(asset.uri);
          if (fileInfo.exists && !fileInfo.isDirectory) {
            size = fileInfo.size;
          }
        }

        if (!size) {
          alert('Could not determine file size. Please select a different image.');
          return;
        }

        if (size > MAX_FILE_SIZE) {
          alert('Image is too large. Maximum size is 5MB.');
          return;
        }

        onImageSelected({
          uri: asset.uri,
          mimeType,
          size: size,
        });
      }
    } catch (error) {
      console.error('Image picking failed', error);
      alert('Failed to select image.');
    }
  };

  if (selectedImage) {
    return (
      <View style={styles.container}>
        {selectedImage.uri ? (
          <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} contentFit="contain" />
        ) : (
          <View style={styles.previewImage} />
        )}
        <View style={styles.actionRow}>
          <Button 
            title="Replace Screenshot" 
            variant="outline" 
            onPress={pickImage} 
            disabled={isUploading}
            style={{ flex: 1, marginRight: Spacing.xs }}
          />
          <Button 
            title="Remove" 
            variant="outline" 
            onPress={() => onImageSelected(null)} 
            disabled={isUploading}
            style={{ flex: 1, marginLeft: Spacing.xs, borderColor: Colors.error }}
            textStyle={{ color: Colors.error }}
          />
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.pickerArea} onPress={pickImage} disabled={isUploading} activeOpacity={0.7}>
      {isUploading ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <>
          <Ionicons name="image-outline" size={32} color={Colors.textSecondary} />
          <Text style={styles.pickerText}>Tap to select payment screenshot</Text>
          <Text style={styles.pickerHint}>JPEG, PNG, WebP (Max 5MB)</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  actionRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  pickerArea: {
    width: '100%',
    height: 120,
    borderWidth: 2,
    borderColor: Colors.borderLight,
    borderStyle: 'dashed',
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  pickerText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  pickerHint: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
});
