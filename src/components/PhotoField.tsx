import React, { useState } from 'react';
import { Image, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { capturePhoto, getPhotoUri, PhotoSource } from '../services/photos';
import type { TranslationKey } from '../i18n';
import { font, fontSize, button, buttonText } from '../constants/theme';
import { appAlert, appError } from './AppDialog';

interface PhotoFieldProps {
  label: TranslationKey;
  hint?: TranslationKey;
  /** Имя файла снимка или undefined, если фото нет */
  fileName?: string;
  /** Вызывается с новым именем файла или null, если фото убрали */
  onChange: (fileName: string | null) => void;
}

/**
 * Поле «фотография»: снимок с камеры или из галереи, предпросмотр и удаление.
 * В вебе блок не отображается — там работа с файлами камеры недоступна.
 */
export const PhotoField: React.FC<PhotoFieldProps> = ({ label, hint, fileName, onChange }) => {
  const { theme, t } = useApp();
  const [isBusy, setIsBusy] = useState(false);
  const [isPreviewOpen, setPreviewOpen] = useState(false);

  if (Platform.OS === 'web') return null;

  const uri = getPhotoUri(fileName);

  const handlePick = async (source: PhotoSource) => {
    try {
      setIsBusy(true);
      const result = await capturePhoto(source);

      switch (result.status) {
        case 'saved':
          onChange(result.fileName);
          break;
        case 'denied':
          appAlert(
            t('photo.permissionTitle'),
            t(source === 'camera' ? 'photo.permissionCamera' : 'photo.permissionLibrary')
          );
          break;
        case 'unsupported':
          appAlert(t('common.attention'), t('photo.webUnsupported'));
          break;
        case 'failed':
          appError(t('common.error'), t('photo.failed'));
          break;
        case 'canceled':
          break;
      }
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{t(label)}</Text>
      {hint && <Text style={[styles.hint, { color: theme.textMuted }]}>{t(hint)}</Text>}

      {uri ? (
        <View style={styles.previewRow}>
          <TouchableOpacity onPress={() => setPreviewOpen(true)} activeOpacity={0.8}>
            <Image source={{ uri }} style={[styles.thumb, { borderColor: theme.border }]} />
          </TouchableOpacity>

          <View style={styles.previewActions}>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: theme.surfaceLight, borderColor: theme.border }]}
              onPress={() => handlePick('camera')}
              disabled={isBusy}
            >
              <Ionicons name="camera-outline" size={16} color={theme.primary} />
              <Text style={[styles.smallBtnText, { color: theme.primary }]}>{t('entry.photoTake')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: theme.surfaceLight, borderColor: theme.border }]}
              onPress={() => onChange(null)}
              disabled={isBusy}
            >
              <Ionicons name="trash-outline" size={16} color={theme.danger} />
              <Text style={[styles.smallBtnText, { color: theme.danger }]}>{t('entry.photoRemove')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.pickRow}>
          <TouchableOpacity
            style={[styles.pickBtn, { backgroundColor: theme.surfaceLight, borderColor: theme.border }]}
            onPress={() => handlePick('camera')}
            disabled={isBusy}
            activeOpacity={0.7}
          >
            <Ionicons name="camera-outline" size={20} color={theme.primary} />
            <Text style={[styles.pickBtnText, { color: theme.text }]}>{t('entry.photoTake')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pickBtn, { backgroundColor: theme.surfaceLight, borderColor: theme.border }]}
            onPress={() => handlePick('library')}
            disabled={isBusy}
            activeOpacity={0.7}
          >
            <Ionicons name="images-outline" size={20} color={theme.primary} />
            <Text style={[styles.pickBtnText, { color: theme.text }]}>{t('entry.photoPick')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={isPreviewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
        <TouchableOpacity
          style={styles.previewOverlay}
          activeOpacity={1}
          onPress={() => setPreviewOpen(false)}
        >
          {uri && <Image source={{ uri }} style={styles.fullImage} resizeMode="contain" />}
          <View style={[styles.closeHint, { backgroundColor: theme.card }]}>
            <Text style={{ color: theme.text }}>{t('common.close')}</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  label: {
    fontSize: fontSize.xs,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  hint: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
    marginBottom: 8,
    lineHeight: 16,
  },
  pickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickBtn: {
    ...button.md,
    flex: 1,
    borderWidth: 1,
  },
  pickBtnText: {
    ...buttonText.md,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: 12,
    borderWidth: 1,
  },
  previewActions: {
    flex: 1,
    gap: 8,
  },
  smallBtn: {
    ...button.sm,
    borderWidth: 1,
  },
  smallBtnText: {
    ...buttonText.sm,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },
  closeHint: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
});
