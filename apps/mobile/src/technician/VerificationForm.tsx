import { ID_DOCUMENT_LABELS, IdDocumentType, normalizeIdNumber } from "@serviceflow/shared";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../auth/forms";
import { Chip, ErrorText, Field, SecondaryButton, Section, fieldStyles } from "../components/fields";
import { colors, radius, space } from "../theme";
import type { PickPhoto, PhotoSource } from "./photos";

export interface VerificationValues {
  idType: IdDocumentType;
  idNumber: string;
  idPhotoUri: string;
  selfieUri: string;
}

type Field = "idNumber" | "idPhoto" | "selfie";

function PhotoField({
  title,
  hint,
  uri,
  error,
  camera,
  pickPhoto,
  onPicked,
  onPickError,
}: {
  title: string;
  hint: string;
  uri: string | null;
  error?: string;
  camera: "front" | "back";
  pickPhoto: PickPhoto;
  onPicked(uri: string): void;
  onPickError(message: string): void;
}) {
  async function pick(source: PhotoSource) {
    try {
      const picked = await pickPhoto(source, camera);
      if (picked) onPicked(picked);
    } catch (e) {
      onPickError(e instanceof Error ? e.message : "Couldn't get the photo.");
    }
  }
  return (
    <Section title={title} hint={hint}>
      {uri ? <Image source={{ uri }} style={styles.preview} accessibilityLabel={`${title} preview`} /> : null}
      <View style={fieldStyles.wrap}>
        <SecondaryButton label={uri ? `Retake ${title.toLowerCase()}` : `Take ${title.toLowerCase()}`} onPress={() => void pick("camera")} />
        <SecondaryButton label="Choose from gallery" onPress={() => void pick("library")} />
      </View>
      <ErrorText message={error} />
    </Section>
  );
}

/**
 * Identity documents: ID type + number + a photo of the ID + a selfie.
 * Photos are compressed and uploaded to a private folder only after this
 * form validates; the server checks them again.
 */
export function VerificationForm({
  pickPhoto,
  busy = false,
  serverError,
  onSubmit,
}: {
  pickPhoto: PickPhoto;
  busy?: boolean;
  serverError?: string | null;
  onSubmit(values: VerificationValues): void;
}) {
  const [idType, setIdType] = useState<IdDocumentType>(IdDocumentType.GHANA_CARD);
  const [idNumber, setIdNumber] = useState("");
  const [idPhotoUri, setIdPhotoUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  function submit() {
    const normalized = normalizeIdNumber(idType, idNumber);
    const next: Partial<Record<Field, string>> = {
      idNumber: normalized ? undefined : idType === IdDocumentType.GHANA_CARD ? "Enter your Ghana Card number like GHA-123456789-0" : "Check the ID number",
      idPhoto: idPhotoUri ? undefined : "Add a photo of your ID",
      selfie: selfieUri ? undefined : "Add a selfie",
    };
    setErrors(next);
    if (normalized && idPhotoUri && selfieUri) onSubmit({ idType, idNumber: normalized, idPhotoUri, selfieUri });
  }

  return (
    <View style={{ gap: space[5] }}>
      <Section title="ID type">
        <View style={fieldStyles.wrap}>
          {Object.values(IdDocumentType).map((t) => (
            <Chip key={t} label={ID_DOCUMENT_LABELS[t]} selected={idType === t} onPress={() => setIdType(t)} />
          ))}
        </View>
      </Section>
      <Field
        label="ID number"
        value={idNumber}
        onChangeText={setIdNumber}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={idType === IdDocumentType.GHANA_CARD ? "GHA-123456789-0" : undefined}
        error={errors.idNumber}
      />
      <PhotoField
        title="ID photo"
        hint="Front of the card, all four corners visible, no glare."
        uri={idPhotoUri}
        error={errors.idPhoto}
        camera="back"
        pickPhoto={pickPhoto}
        onPicked={(uri) => {
          setIdPhotoUri(uri);
          setErrors((e) => ({ ...e, idPhoto: undefined }));
        }}
        onPickError={(m) => setErrors((e) => ({ ...e, idPhoto: m }))}
      />
      <PhotoField
        title="Selfie"
        hint="Your face, clearly lit, no sunglasses or hat."
        uri={selfieUri}
        error={errors.selfie}
        camera="front"
        pickPhoto={pickPhoto}
        onPicked={(uri) => {
          setSelfieUri(uri);
          setErrors((e) => ({ ...e, selfie: undefined }));
        }}
        onPickError={(m) => setErrors((e) => ({ ...e, selfie: m }))}
      />
      <Text style={fieldStyles.muted}>Your documents are private: only you and ServiceFlow's verification team can see them.</Text>
      <ErrorText message={serverError} />
      <PrimaryButton label="Submit for review" busy={busy} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.border },
});
