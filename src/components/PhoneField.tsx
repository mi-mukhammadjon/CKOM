import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useApp } from '../context/AppContext';
import {
  UZ_PHONE_PREFIX,
  applyUzPhoneEdit,
  formatUzLocal,
  toStoredUzPhone,
  uzLocalDigits,
} from '../utils/inspectors';
import { font, fontSize, radius } from '../constants/theme';

interface PhoneFieldProps {
  /** Хранимое значение «+998XXXXXXXXX» или пустая строка */
  value: string;
  onChange: (value: string) => void;
}

/**
 * Поле телефона с неизменяемым кодом +998 и маской «(78) 000-00-00».
 * Разделители ставятся сами, Backspace стирает только цифры.
 */
export const PhoneField: React.FC<PhoneFieldProps> = ({ value, onChange }) => {
  const { theme } = useApp();
  const [digits, setDigits] = useState(() => uzLocalDigits(value));

  // Внешнее значение сменилось (открыли другого инспектора) — подхватываем его
  useEffect(() => {
    if (toStoredUzPhone(digits) !== value) setDigits(uzLocalDigits(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const text = formatUzLocal(digits);

  const handleChange = (next: string) => {
    const nextDigits = applyUzPhoneEdit(digits, text, next);
    setDigits(nextDigits);
    onChange(toStoredUzPhone(nextDigits));
  };

  return (
    <View
      style={[styles.wrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
    >
      <Text style={[styles.prefix, { color: theme.text }]}>{UZ_PHONE_PREFIX}</Text>
      <TextInput
        style={[styles.input, { color: theme.text }]}
        value={text}
        onChangeText={handleChange}
        placeholder="(78) 000-00-00"
        placeholderTextColor={theme.textMuted}
        keyboardType="phone-pad"
        inputMode="tel"
        autoComplete="tel"
        maxLength={14}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 6,
  },
  prefix: {
    fontSize: fontSize.md,
    fontFamily: font.semibold,
    fontVariant: ['tabular-nums'],
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.md,
    fontFamily: font.regular,
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
  },
});
