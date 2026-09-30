import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Label } from '../../components/ui';
import { CONDITION_LABEL, PACKAGING_LABEL } from '../../lib/format';
import { useStore } from '../../lib/store';
import { colors, radius, space } from '../../lib/theme';
import type { CarDetails, Condition, Packaging } from '../../lib/types';

const COMMON_BRANDS = ['Hot Wheels', 'Matchbox', 'Mini GT', 'Tomica', 'Majorette', 'Johnny Lightning', 'M2 Machines', 'Greenlight', 'Inno64', 'Tarmac Works'];
const FLAGS = ['Treasure Hunt', 'Super Treasure Hunt', 'Chase', 'Limited Edition', 'Real Riders', 'Error'];

/** Full edit form. Reached only via an explicit "Edit details" action. */
export default function EditCar() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; draft?: string }>();
  const isDraft = params.draft === '1';
  const car = useStore((s) => (params.id ? s.cars.find((c) => c.id === params.id) : undefined));
  const draft = useStore((s) => s.draft);
  const source: (CarDetails & { description?: string | null; notes?: string | null }) | undefined = isDraft
    ? draft ? { ...draft.details, description: draft.description } : undefined
    : car;

  const [form, setForm] = useState(() => ({
    name: source?.name ?? '',
    make: source?.make ?? '',
    model: source?.model ?? '',
    brand: source?.brand ?? '',
    series: source?.series ?? '',
    year: source?.year ? String(source.year) : '',
    scale: source?.scale ?? '1:64',
    color: source?.color ?? '',
    castingNumber: source?.castingNumber ?? '',
    packaging: (source?.packaging ?? 'unknown') as Packaging,
    condition: (source?.condition ?? 'unknown') as Condition,
    flags: source?.flags ?? [],
    notes: car?.notes ?? '',
  }));
  const [error, setError] = useState<string | null>(null);

  if (!source) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Button title="Close" onPress={() => router.back()} />
      </View>
    );
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const orNull = (s: string) => (s.trim() ? s.trim() : null);

  const save = () => {
    if (!form.name.trim()) {
      setError('Give the car a name.');
      return;
    }
    const year = form.year.trim() ? Number.parseInt(form.year, 10) : null;
    if (year !== null && (!Number.isFinite(year) || year < 1900 || year > 2100)) {
      setError('Year looks wrong.');
      return;
    }
    const details: CarDetails = {
      name: form.name.trim(),
      make: orNull(form.make),
      model: orNull(form.model),
      brand: orNull(form.brand),
      series: orNull(form.series),
      year,
      scale: orNull(form.scale),
      color: orNull(form.color),
      castingNumber: orNull(form.castingNumber),
      packaging: form.packaging,
      condition: form.condition,
      flags: form.flags,
    };
    const store = useStore.getState();
    if (isDraft) {
      store.updateDraft({ details });
      // Manual add (no scan result to review): save straight to the garage.
      if (!store.draft?.result) {
        const id = store.saveDraft();
        router.dismissAll();
        if (id) router.push(`/car/${id}`);
        return;
      }
      router.back();
      return;
    }
    store.updateCar(car!.id, { ...details, notes: orNull(form.notes) });
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + 100 }} keyboardShouldPersistTaps="handled">
        <Field label="Name" value={form.name} onChange={(v) => set('name', v)} placeholder="'71 Datsun 510" />
        <View style={{ gap: space.sm }}>
          <Field label="Brand" value={form.brand} onChange={(v) => set('brand', v)} placeholder="Hot Wheels" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {COMMON_BRANDS.map((b) => (
              <Chip key={b} label={b} active={form.brand === b} onPress={() => set('brand', b)} />
            ))}
          </ScrollView>
        </View>
        <Field label="Series" value={form.series} onChange={(v) => set('series', v)} placeholder="Car Culture" />
        <Row>
          <Field label="Release year" value={form.year} onChange={(v) => set('year', v.replace(/\D/g, '').slice(0, 4))} keyboard="number-pad" placeholder="2024" />
          <Field label="Scale" value={form.scale} onChange={(v) => set('scale', v)} placeholder="1:64" />
        </Row>
        <Row>
          <Field label="Real car make" value={form.make} onChange={(v) => set('make', v)} placeholder="Datsun" />
          <Field label="Model" value={form.model} onChange={(v) => set('model', v)} placeholder="510" />
        </Row>
        <Row>
          <Field label="Colour" value={form.color} onChange={(v) => set('color', v)} placeholder="Blue" />
          <Field label="Toy / casting #" value={form.castingNumber} onChange={(v) => set('castingNumber', v)} placeholder="GRJ83" />
        </Row>

        <Options label="Packaging" options={PACKAGING_LABEL} value={form.packaging} onChange={(v) => set('packaging', v)} />
        <Options label="Condition" options={CONDITION_LABEL} value={form.condition} onChange={(v) => set('condition', v)} />

        <View style={{ gap: space.sm }}>
          <Label>Special</Label>
          <View style={styles.wrap}>
            {FLAGS.map((f) => (
              <Chip
                key={f}
                label={f}
                active={form.flags.includes(f)}
                onPress={() => set('flags', form.flags.includes(f) ? form.flags.filter((x) => x !== f) : [...form.flags, f])}
              />
            ))}
          </View>
        </View>

        {!isDraft && (
          <Field label="Notes" value={form.notes} onChange={(v) => set('notes', v)} placeholder="Where you found it, trades, etc." multiline />
        )}
        {error && <Text style={{ color: colors.down }}>{error}</Text>}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
        <Button title={isDraft && !draft?.result ? 'Add car' : 'Save'} onPress={save} style={{ flex: 2 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: space.md }}>{children}</View>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboard?: 'number-pad';
  multiline?: boolean;
}) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Label>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        keyboardType={keyboard}
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 90, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

function Options<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <Label>{label}</Label>
      <View style={styles.wrap}>
        {(Object.keys(options) as T[]).map((k) => (
          <Chip key={k} label={options[k]} active={value === k} onPress={() => onChange(k)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: space.sm,
    padding: space.lg,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.surface,
  },
});
