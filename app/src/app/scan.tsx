import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { preparePhoto } from '../lib/photos';
import { emptyDetails, useStore } from '../lib/store';
import { colors, font, radius, space } from '../lib/theme';

export default function Scan() {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const setDraft = useStore((s) => s.setDraft);

  const startDraft = async (uri: string, width: number, height: number) => {
    setBusy(true);
    try {
      const { base64, storedUri } = await preparePhoto(uri, width, height);
      setDraft({
        photoUri: storedUri,
        pendingImage: base64,
        result: null,
        details: emptyDetails(),
        description: null,
        status: 'owned',
        myValue: null,
        purchasePrice: null,
      });
      router.replace('/scan-result');
    } catch (e) {
      setBusy(false);
      Alert.alert('Photo problem', e instanceof Error ? e.message : 'Could not process that photo.');
    }
  };

  const capture = async () => {
    if (!camera.current || busy) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const photo = await camera.current.takePictureAsync({ quality: 0.9, shutterSound: false });
    if (photo) await startDraft(photo.uri, photo.width, photo.height);
  };

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      await startDraft(a.uri, a.width, a.height);
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!permission) return <View style={styles.screen} />;

  if (!permission.granted) {
    return (
      <View style={[styles.screen, styles.center, { padding: space.xl, gap: space.lg }]}>
        <Ionicons name="camera" size={48} color={colors.primary} />
        <Text style={[font.title, { color: colors.text, textAlign: 'center' }]}>Camera access</Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 15 }}>
          Diecast Collectors uses the camera to identify your cars. Photos stay on your device, except the one you scan, which is
          sent for identification.
        </Text>
        <Button title="Allow camera" icon="camera" onPress={requestPermission} style={{ alignSelf: 'stretch' }} />
        <Button title="Choose from photos" variant="ghost" icon="images" onPress={pick} style={{ alignSelf: 'stretch' }} />
        <Button title="Cancel" variant="ghost" onPress={close} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} onCameraReady={() => setReady(true)} />

      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <RoundButton icon="close" onPress={close} label="Close" />
        <Text style={styles.title}>Scan a car</Text>
        <RoundButton icon={torch ? 'flash' : 'flash-off'} onPress={() => setTorch((t) => !t)} label="Toggle flash" />
      </View>

      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame}>
          {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
            <View key={c} style={[styles.corner, cornerStyle[c]]} />
          ))}
        </View>
        <Text style={styles.hint}>Fit the car, or the whole card, in the frame</Text>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.xl }]}>
        <RoundButton icon="images" onPress={pick} label="Choose from photos" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          onPress={capture}
          disabled={!ready || busy}
          style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          {busy ? <ActivityIndicator color={colors.primary} /> : <View style={styles.shutterInner} />}
        </Pressable>
        <View style={{ width: 48 }} />
      </View>
    </View>
  );
}

function RoundButton({ icon, onPress, label }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={styles.round} hitSlop={8}>
      <Ionicons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

const C = 28;
const cornerStyle = StyleSheet.create({
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radius.lg },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radius.lg },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radius.lg },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radius.lg },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  frame: { width: '82%', aspectRatio: 4 / 3 },
  corner: { position: 'absolute', width: C, height: C, borderColor: colors.text },
  hint: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: colors.overlay,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary },
});
