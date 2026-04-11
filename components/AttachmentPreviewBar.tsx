import React from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { Text } from "tamagui";
import type { PendingAttachment } from "@/hooks/useFileAttachments";

type AttachmentPreviewBarProps = {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
  onPress?: (attachment: PendingAttachment) => void;
};

const SQUARE = 80;
const CORNER = 12;

export function AttachmentPreviewBar({
  attachments,
  onRemove,
  onPress,
}: AttachmentPreviewBarProps) {
  const colors = useColors();

  if (attachments.length === 0) return null;

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {attachments.map((attachment) => (
          <AttachmentSquare
            key={attachment.id}
            attachment={attachment}
            colors={colors}
            onRemove={onRemove}
            onPress={onPress}
          />
        ))}
      </ScrollView>
    </View>
  );
}

type AttachmentSquareProps = {
  attachment: PendingAttachment;
  colors: ReturnType<typeof useColors>;
  onRemove: (id: string) => void;
  onPress?: (attachment: PendingAttachment) => void;
};

function AttachmentSquare({
  attachment,
  colors,
  onRemove,
  onPress,
}: AttachmentSquareProps) {
  const isUploading =
    attachment.uploadStatus === "uploading" ||
    attachment.uploadStatus === "compressing";
  const isError = attachment.uploadStatus === "error";
  const isDone = attachment.uploadStatus === "uploaded";

  const borderColor = isError
    ? "#EF4444"
    : isDone
      ? colors.primary
      : colors.border;

  return (
    <Pressable
      onPress={() => onPress?.(attachment)}
      style={[
        styles.square,
        {
          backgroundColor: colors.backgroundSecondary,
          borderColor,
        },
      ]}
    >
      {attachment.type === "image" ? (
        <Image
          source={{ uri: attachment.uri }}
          style={styles.image}
          contentFit="cover"
          transition={200}
          placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
        />
      ) : (
        <View style={styles.docContent}>
          <Feather name="file-text" size={28} color={colors.textSecondary} />
          <Text
            fontSize={9}
            color={colors.textSecondary}
            textAlign="center"
            numberOfLines={2}
            style={{ marginTop: 4, paddingHorizontal: 4 }}
          >
            {trimFilename(attachment.name)}
          </Text>
        </View>
      )}

      {isUploading && (
        <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
          <UploadingIndicator color="#FFFFFF" />
        </View>
      )}

      {isError && (
        <View style={[styles.overlay, { backgroundColor: "rgba(239,68,68,0.25)" }]}>
          <Feather name="alert-circle" size={20} color="#EF4444" />
        </View>
      )}

      {isDone && (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Feather name="check-circle" size={10} color="#FFFFFF" />
        </View>
      )}

      <Pressable
        onPress={() => onRemove(attachment.id)}
        hitSlop={8}
        style={[styles.removeButton, { backgroundColor: colors.surface }]}
      >
        <Feather name="x" size={10} color={colors.text} />
      </Pressable>
    </Pressable>
  );
}

function UploadingIndicator({ color }: { color: string }) {
  const pulse = React.useRef(new Animated.Value(0.4)).current;

  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View style={{ opacity: pulse }}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 2.5,
          borderColor: color,
          borderTopColor: "transparent",
          transform: [{ rotate: "45deg" }],
        }}
      />
    </Animated.View>
  );
}

function trimFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  if (base.length <= 14) return name;
  return `${base.slice(0, 11)}…${ext}`;
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 4,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: "row",
  },
  square: {
    width: SQUARE,
    height: SQUARE,
    borderRadius: CORNER,
    borderWidth: 1.5,
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  docContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  removeButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1,
    elevation: 2,
  },
});
