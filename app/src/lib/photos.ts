import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';

/** Longest edge sent to the AI; larger images are downscaled server-side anyway. */
const UPLOAD_EDGE = 1568;
/** Longest edge kept on web, where photos live inside browser storage as data URIs. */
const WEB_STORE_EDGE = 640;

async function resize(uri: string, width: number, height: number, edge: number, base64: boolean) {
  const ctx = ImageManipulator.manipulate(uri);
  const scale = Math.min(1, edge / Math.max(width || edge, height || edge));
  if (scale < 1) ctx.resize(width >= height ? { width: Math.round(width * scale) } : { height: Math.round(height * scale) });
  const ref = await ctx.renderAsync();
  return ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.82, base64 });
}

/**
 * Prepare a captured/picked photo: a base64 JPEG for upload and a URI safe to keep long-term.
 */
export async function preparePhoto(uri: string, width: number, height: number): Promise<{ base64: string; storedUri: string }> {
  const upload = await resize(uri, width, height, UPLOAD_EDGE, true);
  if (!upload.base64) throw new Error('Could not read the photo.');

  if (Platform.OS === 'web') {
    const small = await resize(uri, width, height, WEB_STORE_EDGE, true);
    return { base64: upload.base64, storedUri: `data:image/jpeg;base64,${small.base64}` };
  }

  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  await new File(upload.uri).copy(dest);
  return { base64: upload.base64, storedUri: dest.uri };
}

export function deletePhoto(uri: string | null) {
  if (!uri || Platform.OS === 'web' || uri.startsWith('data:')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Best effort; a leftover file is harmless.
  }
}

/** JPEG bytes of a stored photo, for uploading to the cloud. */
export async function readPhotoBytes(uri: string): Promise<Uint8Array> {
  if (uri.startsWith('data:')) {
    const bin = atob(uri.slice(uri.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  return new File(uri).bytes();
}

/** Download a photo from a (signed) URL into local storage; returns the local URI. */
export async function savePhotoFromUrl(url: string, carId: string): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(url)).blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${carId}-cloud.jpg`);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(url, dest);
  return file.uri;
}
