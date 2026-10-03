import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp, HexColor } from 'react-native-android-widget';
import { MeterType } from '../types';
import { WidgetMeter, WidgetModel } from './model';

/** Глубокая ссылка: «+» на виджете сразу открывает ввод показаний */
export const ENTRY_DEEP_LINK = 'ckom://entry';

export type WidgetThemeName = 'dark' | 'light';

interface Palette {
  bg: HexColor;
  bgTo: HexColor;
  card: HexColor;
  border: HexColor;
  text: HexColor;
  sub: HexColor;
  muted: HexColor;
  primary: HexColor;
  onPrimary: HexColor;
  warning: HexColor;
  success: HexColor;
  danger: HexColor;
  track: HexColor;
}

/** Те же цвета, что в приложении: графит в темной теме, белый в светлой */
export const WIDGET_PALETTES: Record<WidgetThemeName, Palette> = {
  dark: {
    bg: '#1C1F26',
    bgTo: '#141619',
    card: '#24272E',
    border: '#2E323A',
    text: '#F3F4F6',
    sub: '#A4A9B3',
    muted: '#6C717C',
    primary: '#2ED3F0',
    onPrimary: '#0E0F12',
    warning: '#FFB547',
    success: '#3DDC97',
    danger: '#FF6B7A',
    track: '#2E323A',
  },
  light: {
    bg: '#FFFFFF',
    bgTo: '#F3F6FD',
    card: '#F1F4FB',
    border: '#E2E8F5',
    text: '#0A1A45',
    sub: '#55638A',
    muted: '#8A96B8',
    primary: '#0E7CB8',
    onPrimary: '#FFFFFF',
    warning: '#D98A00',
    success: '#12A06A',
    danger: '#E0475A',
    track: '#E2E8F5',
  },
};

const FONT = {
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  bold: 'Onest_700Bold',
  extrabold: 'Onest_800ExtraBold',
};

/** Иконки ресурсов: те же формы, что в приложении (молния, капля, пламя) */
function meterIconSvg(type: MeterType, color: string): string {
  const paths: Record<MeterType, string> = {
    electricity: 'M13 2 4 14h7l-1 8 9-12h-7z',
    cold_water: 'M12 2.5S5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-7-12.5-7-12.5z',
    hot_water: 'M12 2.5S5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-7-12.5-7-12.5z',
    gas: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5z',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${color}" d="${paths[type]}"/></svg>`;
}

const PLUS_SVG = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="${color}" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>`;

/** Прозрачная заливка цвета ресурса для подложки иконки */
function tint(color: string, alpha: number): ColorProp {
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})` as ColorProp;
}

/** Размер виджета на рабочем столе в dp */
export interface WidgetSizeDp {
  width: number;
  height: number;
}

/** Базовые размеры, под которые нарисован макет; от них считается масштаб */
const BASE: Record<'small' | 'medium' | 'large', WidgetSizeDp> = {
  small: { width: 180, height: 84 },
  medium: { width: 330, height: 160 },
  large: { width: 330, height: 330 },
};

/**
 * Масштаб шрифтов и иконок: виджет, растянутый на рабочем столе, получает
 * крупные цифры, а не пустые карточки с мелким текстом.
 */
function scaleFor(kind: keyof typeof BASE, size?: WidgetSizeDp): number {
  if (!size || !size.width || !size.height) return 1;
  const base = BASE[kind];
  const ratio = Math.min(size.width / base.width, size.height / base.height);
  return Math.max(0.9, Math.min(ratio, 1.7));
}

/** Размер в dp с учетом масштаба */
const px = (value: number, s: number) => Math.round(value * s);

function Root({ p, children, padding = 14 }: { p: Palette; children: any; padding?: number }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        padding,
        borderRadius: 24,
        backgroundGradient: { from: p.bg, to: p.bgTo, orientation: 'TOP_BOTTOM' },
      }}
    >
      {children}
    </FlexWidget>
  );
}

function PlusButton({ p, size = 36 }: { p: Palette; size?: number }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: ENTRY_DEEP_LINK }}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.36),
        backgroundColor: p.primary,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <SvgWidget
        svg={PLUS_SVG(p.onPrimary)}
        style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }}
      />
    </FlexWidget>
  );
}

function Chip({ text, color, bg, s = 1 }: { text: string; color: HexColor; bg: ColorProp; s?: number }) {
  return (
    <FlexWidget
      style={{ paddingHorizontal: px(8, s), paddingVertical: px(3, s), borderRadius: 999, backgroundColor: bg }}
    >
      <TextWidget
        text={text}
        maxLines={1}
        style={{ fontSize: px(11, s), color, fontFamily: FONT.medium }}
      />
    </FlexWidget>
  );
}

function Breakdown({ model, p, s = 1 }: { model: WidgetModel; p: Palette; s?: number }) {
  const h = px(5, s);
  if (model.breakdown.length === 0) {
    return (
      <FlexWidget style={{ height: h, width: 'match_parent', borderRadius: 3, backgroundColor: p.track }} />
    );
  }
  return (
    <FlexWidget
      style={{
        height: h,
        width: 'match_parent',
        flexDirection: 'row',
        borderRadius: 3,
        overflow: 'hidden',
        flexGap: 2,
      }}
    >
      {model.breakdown.map((part, index) => (
        <FlexWidget
          key={index}
          style={{
            height: h,
            flex: Math.max(1, Math.round(part.share * 100)),
            backgroundColor: part.color as HexColor,
          }}
        />
      ))}
    </FlexWidget>
  );
}

function Total({ model, p, size }: { model: WidgetModel; p: Palette; size: number }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <TextWidget
        text={model.total}
        maxLines={1}
        style={{ fontSize: size, color: p.text, fontFamily: FONT.extrabold, letterSpacing: -0.02 }}
      />
      <TextWidget
        text={` ${model.currency}`}
        style={{
          fontSize: Math.round(size * 0.45),
          color: p.sub,
          fontFamily: FONT.medium,
          marginBottom: Math.round(size * 0.08),
        }}
      />
    </FlexWidget>
  );
}

function MeterIcon({ meter, size }: { meter: WidgetMeter; size: number }) {
  return (
    <FlexWidget
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        backgroundColor: tint(meter.color, 0.18),
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <SvgWidget
        svg={meterIconSvg(meter.type, meter.color)}
        style={{ width: Math.round(size * 0.58), height: Math.round(size * 0.58) }}
      />
    </FlexWidget>
  );
}

function StatusDot({ ok, p, size = 6 }: { ok: boolean; p: Palette; size?: number }) {
  return (
    <FlexWidget
      style={{ width: size, height: size, borderRadius: size, backgroundColor: ok ? p.success : p.warning }}
    />
  );
}

interface WidgetProps {
  model: WidgetModel;
  theme: WidgetThemeName;
  size?: WidgetSizeDp;
}

// ---------- Малый 2×1 ----------

export function SmallWidget({ model, theme, size }: WidgetProps) {
  const p = WIDGET_PALETTES[theme];
  const s = scaleFor('small', size);
  const allDone = model.totalMeters > 0 && model.entered >= model.totalMeters;
  return (
    <Root p={p} padding={px(12, s)}>
      <TextWidget
        text={`${model.monthTitle} · ${model.propertyName}`}
        maxLines={1}
        truncate="END"
        style={{ fontSize: px(11, s), color: p.sub, fontFamily: FONT.medium }}
      />
      <FlexWidget style={{ flex: 1, justifyContent: 'center' }}>
        <Total model={model} p={p} size={px(24, s)} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: px(5, s) }}>
        <StatusDot ok={allDone} p={p} size={px(7, s)} />
        <TextWidget
          text={allDone ? model.labels.allDone : `${model.entered}/${model.totalMeters}`}
          maxLines={1}
          style={{ fontSize: px(12, s), color: p.sub, fontFamily: FONT.medium }}
        />
      </FlexWidget>
    </Root>
  );
}

function Header({ model, p, s, big }: { model: WidgetModel; p: Palette; s: number; big?: boolean }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <TextWidget
          text={model.propertyName}
          maxLines={1}
          truncate="END"
          style={{ fontSize: px(big ? 15 : 14, s), color: p.text, fontFamily: FONT.bold }}
        />
        <TextWidget
          text={model.labels.charged}
          maxLines={1}
          truncate="END"
          style={{ fontSize: px(big ? 12 : 11, s), color: p.sub, fontFamily: FONT.regular }}
        />
      </FlexWidget>
      <PlusButton p={p} size={px(big ? 38 : 36, s)} />
    </FlexWidget>
  );
}

// ---------- Средний 4×2 ----------

export function MediumWidget({ model, theme, size }: WidgetProps) {
  const p = WIDGET_PALETTES[theme];
  const s = scaleFor('medium', size);
  return (
    <Root p={p} padding={px(14, s)}>
      <Header model={model} p={p} s={s} />

      <FlexWidget style={{ marginTop: px(4, s), marginBottom: px(8, s) }}>
        <Total model={model} p={p} size={px(30, s)} />
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', flexGap: px(6, s), flex: 1 }}>
        {model.meters.slice(0, 4).map(meter => (
          <FlexWidget
            key={meter.id}
            style={{
              flex: 1,
              height: 'match_parent',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: px(8, s),
              borderRadius: px(14, s),
              backgroundColor: p.card,
            }}
          >
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
              <MeterIcon meter={meter} size={px(22, s)} />
              <FlexWidget style={{ flex: 1 }} />
              <StatusDot ok={meter.submitted} p={p} size={px(7, s)} />
            </FlexWidget>
            <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
              <TextWidget
                text={meter.label}
                maxLines={1}
                truncate="END"
                style={{ fontSize: px(11, s), color: p.sub, fontFamily: FONT.medium }}
              />
              <TextWidget
                text={meter.value}
                maxLines={1}
                style={{
                  fontSize: px(18, s),
                  color: p.text,
                  fontFamily: FONT.extrabold,
                  adjustsFontSizeToFit: true,
                }}
              />
              <TextWidget
                text={meter.submitted && meter.consumption ? `${meter.consumption} ${meter.unit}` : meter.unit}
                maxLines={1}
                style={{
                  fontSize: px(10, s),
                  color: meter.submitted ? p.sub : p.muted,
                  fontFamily: FONT.medium,
                }}
              />
            </FlexWidget>
          </FlexWidget>
        ))}
      </FlexWidget>
    </Root>
  );
}

// ---------- Большой 4×4 ----------

export function LargeWidget({ model, theme, size }: WidgetProps) {
  const p = WIDGET_PALETTES[theme];
  const s = scaleFor('large', size);
  const allDone = model.totalMeters > 0 && model.entered >= model.totalMeters;
  const up = (model.diffPercent ?? 0) > 0;
  return (
    <Root p={p} padding={px(16, s)}>
      <Header model={model} p={p} s={s} big />

      <FlexWidget style={{ marginTop: px(6, s), marginBottom: px(8, s) }}>
        <Total model={model} p={p} size={px(32, s)} />
      </FlexWidget>

      <Breakdown model={model} p={p} s={s} />

      <FlexWidget style={{ flexDirection: 'row', flexGap: px(6, s), marginTop: px(8, s) }}>
        {model.labels.vsPrev ? (
          <Chip
            s={s}
            text={model.labels.vsPrev}
            color={up ? p.danger : p.success}
            bg={tint(up ? p.danger : p.success, 0.14)}
          />
        ) : null}
        <Chip
          s={s}
          text={allDone ? model.labels.allDone : model.labels.deadline}
          color={allDone ? p.success : p.warning}
          bg={tint(allDone ? p.success : p.warning, 0.14)}
        />
      </FlexWidget>

      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'column',
          width: 'match_parent',
          marginTop: px(10, s),
          flexGap: px(6, s),
        }}
      >
        {model.meters.slice(0, 4).map(meter => (
          <FlexWidget
            key={meter.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              width: 'match_parent',
              flex: 1,
              paddingHorizontal: px(10, s),
              borderRadius: px(14, s),
              backgroundColor: p.card,
              flexGap: px(10, s),
            }}
          >
            <MeterIcon meter={meter} size={px(28, s)} />
            <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
              <TextWidget
                text={meter.label}
                maxLines={1}
                style={{ fontSize: px(11, s), color: p.sub, fontFamily: FONT.medium }}
              />
              <TextWidget
                text={`${meter.value} ${meter.unit}`}
                maxLines={1}
                style={{ fontSize: px(15, s), color: p.text, fontFamily: FONT.bold }}
              />
            </FlexWidget>
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: px(5, s) }}>
              <StatusDot ok={meter.submitted} p={p} size={px(7, s)} />
              <TextWidget
                text={meter.submitted && meter.consumption ? meter.consumption : model.labels.notEntered}
                maxLines={1}
                style={{
                  fontSize: px(12, s),
                  color: meter.submitted ? p.text : p.muted,
                  fontFamily: FONT.bold,
                }}
              />
            </FlexWidget>
          </FlexWidget>
        ))}
      </FlexWidget>
    </Root>
  );
}

/** Заглушка, когда данных еще нет (приложение ни разу не открывали) */
export function EmptyWidget({ theme, text }: { theme: WidgetThemeName; text: string }) {
  const p = WIDGET_PALETTES[theme];
  return (
    <Root p={p}>
      <FlexWidget style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: 'match_parent' }}>
        <TextWidget text="СКОМ" style={{ fontSize: 16, color: p.text, fontFamily: FONT.bold }} />
        <TextWidget text={text} style={{ fontSize: 11, color: p.sub, fontFamily: FONT.regular, marginTop: 4 }} />
      </FlexWidget>
    </Root>
  );
}
