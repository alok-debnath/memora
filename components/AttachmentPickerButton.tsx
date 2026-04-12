import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { PopoverMenu, type PopoverMenuItem } from "./ui/PopoverMenu";

type AttachmentPickerButtonProps = {
  onPickImages: () => void;
  onPickCamera: () => void;
  onPickDocument: () => void;
  /** Show lock state when Drive not authorized */
  driveConnected?: boolean;
  onRequestDriveAccess?: () => void;
  size?: number;
};

export function AttachmentPickerButton({
  onPickImages,
  onPickCamera,
  onPickDocument,
  driveConnected = true,
  onRequestDriveAccess,
  size = 22,
}: AttachmentPickerButtonProps) {
  const colors = useColors();
  const menuItems: PopoverMenuItem[] = [
    {
      icon: "image",
      label: "Photo Library",
      onPress: () => setTimeout(onPickImages, 120),
    },
    {
      icon: "camera",
      label: "Camera",
      onPress: () => setTimeout(onPickCamera, 120),
    },
    {
      icon: "file-text",
      label: "PDF Document",
      onPress: () => setTimeout(onPickDocument, 120),
    },
  ];

  const trigger = (
    <View style={styles.button}>
      {driveConnected ? (
        <Feather name="paperclip" size={size} color={colors.textSecondary} />
      ) : (
        <Feather name="lock" size={size} color={colors.textTertiary} />
      )}
    </View>
  );

  return driveConnected ? (
    <PopoverMenu
      items={menuItems}
      align="start"
      triggerGap={0}
      horizontalOffset={-6}
      verticalOffset={-2}
    >
      {trigger}
    </PopoverMenu>
  ) : (
    <Pressable
      onPress={onRequestDriveAccess}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {driveConnected ? (
        <Feather name="paperclip" size={size} color={colors.textSecondary} />
      ) : (
        <Feather name="lock" size={size} color={colors.textTertiary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 6,
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.6,
  },
});
