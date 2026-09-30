import { useMemo, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { colors, space } from '../lib/theme';

export interface Series {
  label: string;
  color: string;
  dashed?: boolean;
  points: { date: string; value: number }[];
}

const PAD = { top: 12, right: 12, bottom: 22, left: 48 };

/** Line chart for value over time. One y-axis, hairline grid, 2px lines, press-and-drag crosshair. */
export function ValueChart({
  series,
  height = 180,
  format,
}: {
  series: Series[];
  height?: number;
  format: (n: number) => string;
}) {
  const [width, setWidth] = useState(0);
  const [activeX, setActiveX] = useState<number | null>(null);
  const visible = series.filter((s) => s.points.length > 0);

  const geo = useMemo(() => {
    const all = visible.flatMap((s) => s.points);
    if (!all.length || width === 0) return null;
    const times = all.map((p) => new Date(p.date).getTime());
    let t0 = Math.min(...times);
    let t1 = Math.max(...times);
    if (t0 === t1) {
      t0 -= 86_400_000;
      t1 += 86_400_000;
    }
    const values = all.map((p) => p.value);
    let v0 = Math.min(...values);
    let v1 = Math.max(...values);
    const padV = (v1 - v0) * 0.15 || Math.max(1, v1 * 0.2);
    v0 = Math.max(0, v0 - padV);
    v1 = v1 + padV;
    const w = width - PAD.left - PAD.right;
    const h = height - PAD.top - PAD.bottom;
    const x = (d: string) => PAD.left + ((new Date(d).getTime() - t0) / (t1 - t0)) * w;
    const y = (v: number) => PAD.top + h - ((v - v0) / (v1 - v0)) * h;
    const ticks = [0, 0.5, 1].map((f) => v0 + (v1 - v0) * f);
    return { x, y, ticks, t0, t1, w, h };
  }, [visible, width, height]);

  const onTouch = (e: GestureResponderEvent) => setActiveX(e.nativeEvent.locationX);

  // Nearest point per series to the crosshair.
  const hover = useMemo(() => {
    if (!geo || activeX === null) return null;
    const rows = visible.map((s) => {
      let best = s.points[0];
      for (const p of s.points) if (Math.abs(geo.x(p.date) - activeX) < Math.abs(geo.x(best.date) - activeX)) best = p;
      return { s, p: best };
    });
    const anchor = rows.reduce((a, b) =>
      Math.abs(geo.x(a.p.date) - activeX) <= Math.abs(geo.x(b.p.date) - activeX) ? a : b,
    );
    return { rows, x: geo.x(anchor.p.date), date: anchor.p.date };
  }, [geo, activeX, visible]);

  if (!visible.some((s) => s.points.length > 1)) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {visible.length ? 'History builds up as values are re-checked over time.' : 'No value history yet.'}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {visible.length > 1 && (
        <View style={styles.legend}>
          {visible.map((s) => (
            <View key={s.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: s.color }, s.dashed && styles.swatchDashed]} />
              <Text style={styles.legendText}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
        onResponderRelease={() => setActiveX(null)}
        onResponderTerminate={() => setActiveX(null)}
        accessibilityLabel={visible
          .map((s) => `${s.label}: latest ${format(s.points[s.points.length - 1].value)}`)
          .join('. ')}
      >
        {geo && (
          <Svg width={width} height={height}>
            {geo.ticks.map((t) => (
              <Line key={t} x1={PAD.left} x2={width - PAD.right} y1={geo.y(t)} y2={geo.y(t)} stroke={colors.grid} strokeWidth={1} />
            ))}
            {visible.map((s, i) => {
              const pts = s.points.length === 1 ? [s.points[0], { ...s.points[0], date: new Date(geo.t1).toISOString() }] : s.points;
              const d = pts.map((p, j) => `${j ? 'L' : 'M'}${geo.x(p.date).toFixed(1)},${geo.y(p.value).toFixed(1)}`).join(' ');
              const base = PAD.top + geo.h;
              const area = `${d} L${geo.x(pts[pts.length - 1].date).toFixed(1)},${base} L${geo.x(pts[0].date).toFixed(1)},${base} Z`;
              const last = s.points[s.points.length - 1];
              return (
                <G key={s.label}>
                  {i === 0 && !s.dashed && <Path d={area} fill={s.color} fillOpacity={0.1} />}
                  <Path
                    d={d}
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={s.dashed ? '6 5' : undefined}
                    fill="none"
                  />
                  <Circle cx={geo.x(last.date)} cy={geo.y(last.value)} r={4} fill={s.color} stroke={colors.surface} strokeWidth={2} />
                </G>
              );
            })}
            {hover && (
              <>
                <Line x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + geo.h} stroke={colors.textDim} strokeWidth={1} />
                {hover.rows.map(({ s, p }) => (
                  <Circle key={s.label} cx={geo.x(p.date)} cy={geo.y(p.value)} r={5} fill={s.color} stroke={colors.surface} strokeWidth={2} />
                ))}
              </>
            )}
          </Svg>
        )}
        {geo &&
          geo.ticks.map((t) => (
            <Text key={t} style={[styles.axis, { top: geo.y(t) - 8, left: 0, width: PAD.left - 6, textAlign: 'right' }]}>
              {format(t)}
            </Text>
          ))}
        {geo && (
          <>
            <Text style={[styles.axis, { bottom: 0, left: PAD.left }]}>{shortDate(new Date(geo.t0).toISOString())}</Text>
            <Text style={[styles.axis, { bottom: 0, right: PAD.right }]}>{shortDate(new Date(geo.t1).toISOString())}</Text>
          </>
        )}
        {hover && geo && (
          <View
            pointerEvents="none"
            style={[styles.tooltip, hover.x > width / 2 ? { right: width - hover.x + 8 } : { left: hover.x + 8 }]}
          >
            <Text style={styles.tooltipDate}>{shortDate(hover.date)}</Text>
            {hover.rows.map(({ s, p }) => (
              <View key={s.label} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: s.color }]} />
                <Text style={styles.tooltipText}>
                  {s.label}: {format(p.value)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function shortDate(iso: string) {
  // Date-only strings ("2026-06-01") are UTC midnight; format them in UTC so the day doesn't shift.
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: iso.length === 10 ? 'UTC' : undefined,
  });
}

const styles = StyleSheet.create({
  empty: { paddingVertical: space.sm },
  emptyText: { color: colors.textDim, fontSize: 12 },
  legend: { flexDirection: 'row', gap: space.lg, marginBottom: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 3, borderRadius: 2 },
  swatchDashed: { width: 14, opacity: 0.9 },
  legendText: { color: colors.textMuted, fontSize: 12 },
  axis: { position: 'absolute', color: colors.textDim, fontSize: 10 },
  tooltip: {
    position: 'absolute',
    top: 4,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    gap: 2,
  },
  tooltipDate: { color: colors.textDim, fontSize: 11 },
  tooltipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
});
