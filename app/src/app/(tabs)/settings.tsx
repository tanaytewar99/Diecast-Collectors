import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Chip, Label } from '../../components/ui';
import { CURRENCIES } from '../../lib/format';
import { deletePhoto } from '../../lib/photos';
import { DEFAULT_API_URL, emptyDetails, useStore } from '../../lib/store';
import { BRAND, colors, font, radius, space } from '../../lib/theme';
import type { Car } from '../../lib/types';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const settings = useStore((s) => s.settings);
  const cars = useStore((s) => s.cars);
  const update = useStore((s) => s.updateSettings);
  const [apiUrl, setApiUrl] = useState(settings.apiUrl);
  const [appKey, setAppKey] = useState(settings.appKey);
  const [health, setHealth] = useState<string | null>(null);

  const testServer = async () => {
    update({ apiUrl: apiUrl.trim() || DEFAULT_API_URL, appKey: appKey.trim() });
    setHealth('Checking…');
    try {
      const res = await fetch(`${(apiUrl.trim() || DEFAULT_API_URL).replace(/\/$/, '')}/health`);
      setHealth(res.ok ? 'Connected ✓' : `Server responded ${res.status}`);
    } catch {
      setHealth("Can't reach server");
    }
  };

  const exportData = async () => {
    const json = JSON.stringify({ app: 'diecast-collectors', version: 1, exportedAt: new Date().toISOString(), cars }, null, 2);
    const name = `diecast-collectors-${new Date().toISOString().slice(0, 10)}.json`;
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = name;
      a.click();
      return;
    }
    const file = new File(Paths.cache, name);
    file.write(json);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export collection' });
  };

  const importData = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    try {
      const text = Platform.OS === 'web' ? await (await fetch(res.assets[0].uri)).text() : await new File(res.assets[0].uri).text();
      const parsed = JSON.parse(text) as { cars?: Car[] };
      const added = useStore.getState().importCars(Array.isArray(parsed.cars) ? parsed.cars : []);
      Alert.alert('Import complete', `${added} car${added === 1 ? '' : 's'} added.`);
    } catch {
      Alert.alert('Import failed', 'That file is not a Diecast Collectors export.');
    }
  };

  const eraseAll = () => {
    const doErase = () => {
      useStore.getState().cars.forEach((c) => deletePhoto(c.photoUri));
      useStore.getState().clearAll();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Erase your entire collection? This cannot be undone.')) doErase();
      return;
    }
    Alert.alert('Erase all data?', 'This permanently deletes every car in your collection.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: doErase },
    ]);
  };

  const addManually = () => {
    useStore.getState().setDraft({
      photoUri: null,
      pendingImage: null,
      result: null,
      details: emptyDetails(),
      description: null,
      status: 'owned',
      myValue: null,
      purchasePrice: null,
    });
    router.push('/car/edit?draft=1');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, gap: space.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <Text style={[font.title, { color: colors.text }]}>Settings</Text>

      <Card>
        <Label>Currency</Label>
        <View style={styles.wrap}>
          {CURRENCIES.map((c) => (
            <Chip key={c} label={c} active={settings.currency === c} onPress={() => update({ currency: c })} />
          ))}
        </View>
        <Text style={styles.help}>New scans and refreshes are valued in this currency. Existing cars keep the currency they were added in.</Text>
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Auto-refresh values</Text>
            <Text style={styles.help}>When you open the app, update up to 5 cars whose market value is over a week old.</Text>
          </View>
          <Switch
            value={settings.autoRefresh}
            onValueChange={(v) => update({ autoRefresh: v })}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      </Card>

      <Card>
        <Label>Add without scanning</Label>
        <Button title="Add a car manually" variant="secondary" icon="create-outline" onPress={addManually} />
      </Card>

      <Card>
        <Label>Your data</Label>
        <Button title="Export collection (JSON)" variant="secondary" icon="share-outline" onPress={exportData} />
        <Button title="Import collection" variant="secondary" icon="download-outline" onPress={importData} />
        <Button title="Erase all data" variant="danger" icon="trash-outline" onPress={eraseAll} />
      </Card>

      <Card>
        <Label>AI server</Label>
        <TextInput value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} placeholder={DEFAULT_API_URL} placeholderTextColor={colors.textDim} style={styles.input} />
        <TextInput value={appKey} onChangeText={setAppKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="App key (optional)" placeholderTextColor={colors.textDim} style={styles.input} />
        <Button title="Save & test connection" variant="ghost" icon="pulse" onPress={testServer} />
        {health && <Text style={styles.help}>{health}</Text>}
      </Card>

      <View style={styles.about}>
        <View style={styles.logo}>
          <Ionicons name="car-sport" size={22} color={colors.text} />
        </View>
        <Text style={styles.rowTitle}>{BRAND.name}</Text>
        <Text style={styles.help}>{BRAND.tagline}</Text>
        <Text style={styles.help}>Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  help: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    color: colors.text,
  },
  about: { alignItems: 'center', gap: 4, paddingVertical: space.lg },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
