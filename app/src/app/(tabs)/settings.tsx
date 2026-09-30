import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Chip, Label } from '../../components/ui';
import { deleteAccount } from '../../lib/api';
import { CURRENCIES, relativeTime } from '../../lib/format';
import { emptyDetails, useStore } from '../../lib/store';
import { useAuth } from '../../lib/supabase';
import { pendingChanges, saveAccountPreference, signOutAndClear, syncNow, useSyncStatus } from '../../lib/sync';
import { BRAND, colors, font, radius, space } from '../../lib/theme';
import type { Car } from '../../lib/types';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const settings = useStore((s) => s.settings);
  const cars = useStore((s) => s.cars);
  const update = useStore((s) => s.updateSettings);
  const email = useAuth((s) => s.session?.user.email ?? '');
  const status = useSyncStatus();
  const pending = useStore((s) => s.sync.dirty.length + s.sync.deleted.length);
  const [accountBusy, setAccountBusy] = useState(false);

  const confirm = (title: string, message: string, action: string, onYes: () => void) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) onYes();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, style: 'destructive', onPress: onYes },
    ]);
  };

  const signOut = async () => {
    setAccountBusy(true);
    await syncNow();
    setAccountBusy(false);
    const unsynced = pendingChanges();
    confirm(
      'Sign out?',
      unsynced
        ? `${unsynced} change${unsynced === 1 ? " hasn't" : "s haven't"} reached the cloud yet (no connection) and will be lost if you sign out now.`
        : 'Your collection stays safe in the cloud. Sign in again with the same email on any phone to get it back.',
      'Sign out',
      () => void signOutAndClear(),
    );
  };

  const removeAccount = () =>
    confirm(
      'Delete account?',
      'This permanently deletes your account and your whole collection (cars, photos, value history) from the cloud and this phone. This cannot be undone.',
      'Delete forever',
      async () => {
        setAccountBusy(true);
        try {
          await deleteAccount();
          await signOutAndClear();
        } catch (e) {
          Alert.alert('Could not delete account', e instanceof Error ? e.message : 'Please try again.');
        } finally {
          setAccountBusy(false);
        }
      },
    );

  const syncLine =
    status.state === 'syncing'
      ? 'Syncing…'
      : status.state === 'error'
        ? status.error
        : pending
          ? `${pending} change${pending === 1 ? '' : 's'} waiting to upload`
          : status.lastSyncedAt
            ? `All changes saved to the cloud · ${relativeTime(status.lastSyncedAt)}`
            : 'All changes saved to the cloud';

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
        <Label>Account & backup</Label>
        <View style={styles.rowBetween}>
          <Ionicons
            name={status.state === 'error' ? 'cloud-offline' : pending || status.state === 'syncing' ? 'cloud-upload' : 'cloud-done'}
            size={26}
            color={status.state === 'error' ? colors.gold : colors.up}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{email}</Text>
            <Text style={styles.help}>{syncLine}</Text>
          </View>
        </View>
        <Text style={styles.help}>
          Everything (cars, photos, prices, value history, what you paid) is backed up to this account. On a new phone, sign in
          with the same email.
        </Text>
        <Button title="Sync now" variant="secondary" icon="sync" onPress={() => void syncNow()} loading={status.state === 'syncing'} />
        <Button title="Sign out" variant="ghost" icon="log-out-outline" onPress={signOut} loading={accountBusy} />
      </Card>

      <Card>
        <Label>Currency</Label>
        <View style={styles.wrap}>
          {CURRENCIES.map((c) => (
            <Chip key={c} label={c} active={settings.currency === c} onPress={() => {
                update({ currency: c });
                saveAccountPreference({ currency: c });
              }} />
          ))}
        </View>
        <Text style={styles.help}>New scans and refreshes are valued in this currency. Existing cars keep the currency they were added in. Saved to your account.</Text>
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Auto-refresh values</Text>
            <Text style={styles.help}>When you open the app, update cars whose market value is over a week old. Free: prices come from eBay listings, not AI.</Text>
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
        <Text style={styles.help}>An extra copy you keep yourself. Your collection is already backed up to your account.</Text>
        <Button title="Delete account" variant="danger" icon="trash-outline" onPress={removeAccount} disabled={accountBusy} />
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
