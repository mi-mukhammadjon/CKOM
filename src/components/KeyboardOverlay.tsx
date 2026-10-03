import React from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

interface KeyboardOverlayProps {
  /** Стиль затемненной подложки модального окна: фон, отступы, выравнивание карточки */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Подложка модального окна, которая не дает клавиатуре закрыть поля ввода.
 *
 * KeyboardAvoidingView в режиме padding сам считает, насколько клавиатура
 * перекрывает окно: если система уже уменьшила окно, отступ будет нулевым.
 * Поэтому режим одинаковый для Android и iOS. Внутренний ScrollView позволяет
 * пролистать карточку, когда над клавиатурой остается мало места.
 */
export const KeyboardOverlay: React.FC<KeyboardOverlayProps> = ({ style, children }) => {
  const flat = StyleSheet.flatten(style) || {};
  // flex у подложки заменяем на flexGrow: иначе содержимое нельзя будет пролистать
  const { backgroundColor, flex: _flex, ...layout } = flat;

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.fill, { backgroundColor }]}>
      <ScrollView
        contentContainerStyle={[styles.content, layout]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
});
