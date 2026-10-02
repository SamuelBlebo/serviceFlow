import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/** Longest side after compression: plenty to read an ID card, small on mobile data. */
const MAX_DIMENSION = 1600;

/**
 * Downscales and re-encodes a photo as JPEG before upload. Phone cameras
 * produce 3–8 MB images; this brings them to a few hundred KB, which matters
 * on prepaid data and keeps us well under the server's 8 MB limit.
 */
export async function compressPhoto(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  const original = await context.renderAsync();
  const { width, height } = original;
  if (Math.max(width, height) > MAX_DIMENSION) {
    context.resize(width >= height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return saved.uri;
}

export type PhotoSource = "camera" | "library";
export type PickPhoto = (source: PhotoSource, camera: "front" | "back") => Promise<string | null>;

/**
 * Takes or chooses one photo. Returns null when the person cancels; throws
 * a readable error when permission is refused.
 */
export const pickPhoto: PickPhoto = async (source, camera) => {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.9,
    cameraType: camera === "front" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  };
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Allow camera access in your phone settings to take the photo.");
    const result = await ImagePicker.launchCameraAsync(options);
    return result.canceled ? null : (result.assets[0]?.uri ?? null);
  }
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Allow photo access in your phone settings to choose a photo.");
  const result = await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
};
