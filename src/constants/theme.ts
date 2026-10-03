import { TextStyle, ViewStyle } from 'react-native';

/**
 * Дизайн-система СКОМ. Палитра взята из логотипа: темно-синий фон
 * и фирменные цвета ресурсов (свет — янтарный, вода — бирюзовый,
 * горячая вода — коралловый, газ — оранжевый).
 */
export interface ThemeColors {
  background: string;
  surface: string;
  surfaceLight: string;
  card: string;
  cardHover: string;
  border: string;
  borderLight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  /** Текст и иконки поверх primary */
  onPrimary: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  tabBarBg: string;
  tabBarBorder: string;
  badgeBg: string;
  inputBg: string;
  inputBorder: string;
  /** Главная карточка с суммой — темно-синяя в обеих темах */
  heroBg: string;
  heroText: string;
  heroTextMuted: string;
  heroChipBg: string;
}

/**
 * Темная тема — графит: нейтральный почти черный фон без синевы.
 * На нем фирменные бирюзовый акцент и цвета ресурсов выглядят чище.
 */
export const DarkTheme: ThemeColors = {
  background: '#0E0F12',
  surface: '#0E0F12',
  surfaceLight: '#1F2228',
  card: '#17191E',
  cardHover: '#1F2228',
  border: '#25282F',
  borderLight: '#2E323A',
  text: '#F3F4F6',
  textSecondary: '#A4A9B3',
  textMuted: '#6C717C',
  primary: '#2ED3F0',
  primaryLight: '#7FE6F7',
  primaryDark: '#14B3D1',
  onPrimary: '#0E0F12',
  success: '#3DDC97',
  warning: '#FFB547',
  danger: '#FF6B7A',
  info: '#2ED3F0',
  tabBarBg: '#17191E',
  tabBarBorder: '#25282F',
  badgeBg: 'rgba(46, 211, 240, 0.14)',
  inputBg: '#121318',
  inputBorder: '#2E323A',
  heroBg: '#1C1F26',
  heroText: '#FFFFFF',
  heroTextMuted: '#C9CDD6',
  heroChipBg: 'rgba(255, 255, 255, 0.10)',
};

export const LightTheme: ThemeColors = {
  background: '#F3F6FD',
  surface: '#F3F6FD',
  surfaceLight: '#E9EEF9',
  card: '#FFFFFF',
  cardHover: '#F6F8FE',
  border: '#E2E8F5',
  borderLight: '#D5DDEF',
  text: '#0A1A45',
  textSecondary: '#55638A',
  textMuted: '#8A96B8',
  primary: '#0E7CB8',
  primaryLight: '#3BA3DA',
  primaryDark: '#0A5F8F',
  onPrimary: '#FFFFFF',
  success: '#12A06A',
  warning: '#D98A00',
  danger: '#E0475A',
  info: '#0E7CB8',
  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E2E8F5',
  badgeBg: 'rgba(14, 124, 184, 0.10)',
  inputBg: '#FFFFFF',
  inputBorder: '#D5DDEF',
  heroBg: '#0B2A6B',
  heroText: '#FFFFFF',
  heroTextMuted: '#D4DCF6',
  heroChipBg: 'rgba(255, 255, 255, 0.12)',
};

/** Текст и иконки поверх ярких цветов (белая кнопка, янтарь, цвета ресурсов) */
export const INK_ON_BRIGHT = '#111317';

/** Затемнение под модальными окнами */
export const OVERLAY_BG = 'rgba(0, 0, 0, 0.4)';

/** Свечение главной карточки (радиальные градиенты из логотипа) */
export const HERO_GLOW =
  'radial-gradient(circle at 100% 0%, rgba(155, 107, 255, 0.55) 0%, rgba(155, 107, 255, 0) 55%), ' +
  'radial-gradient(circle at 0% 100%, rgba(46, 211, 240, 0.45) 0%, rgba(46, 211, 240, 0) 60%)';

/** Начертания шрифта Onest: кириллица и узбекская латиница */
export const font = {
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
  extrabold: 'Onest_800ExtraBold',
} as const;

/** Шкала размеров текста — других размеров в интерфейсе нет */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 36,
} as const;

/** Радиусы скругления */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

/**
 * Размеры кнопок. Цвета задаются на месте из темы:
 * основная — primary + onPrimary, второстепенная — surfaceLight + text.
 */
export const button: Record<'lg' | 'md' | 'sm' | 'icon', ViewStyle> = {
  /** Главное действие экрана: «Сохранить», «Внести показание» */
  lg: {
    height: 52,
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  /** Второстепенные действия в формах */
  md: {
    height: 46,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  /** Компактные действия в заголовках и карточках */
  sm: {
    height: 36,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  /** Квадратная кнопка с иконкой */
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
};

export const buttonText: Record<'lg' | 'md' | 'sm', TextStyle> = {
  lg: { fontSize: fontSize.md, fontFamily: font.bold },
  md: { fontSize: fontSize.sm, fontFamily: font.semibold },
  sm: { fontSize: fontSize.sm, fontFamily: font.semibold },
};
