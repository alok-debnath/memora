import React, { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Sheet, YStack, XStack, Text } from "tamagui";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

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
  const [open, setOpen] = useState(false);

  const handlePress = () => {
    if (!driveConnected) {
      onRequestDriveAccess?.();
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <Pressable
        onPress={handlePress}
        hitSlop={8}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.pressed,
        ]}
      >
        {driveConnected ? (
          <Feather name="paperclip" size={size} color={colors.textSecondary} />
        ) : (
          <Feather name="lock" size={size} color={colors.textTertiary} />
        )}
      </Pressable>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        snapPoints={[35]}
        snapPointsMode="percent"
        dismissOnSnapToBottom
        modal
        zIndex={100000}
        animation="quick"
      >
        <Sheet.Overlay animation="quick" enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
        <Sheet.Handle />
        <Sheet.Frame
          padding="$4"
          backgroundColor="$background"
          borderTopLeftRadius="$6"
          borderTopRightRadius="$6"
        >
          <Text
            fontSize={13}
            fontWeight="600"
            color="$colorSubtle"
            mb="$3"
            letterSpacing={0.5}
            textTransform="uppercase"
          >
            Attach File
          </Text>
          <YStack gap="$2">
            <PickerOption
              icon={<Feather name="image" size={20} color={colors.text} />}
              label="Photo Library"
              colors={colors}
              onPress={() => {
                setOpen(false);
                setTimeout(onPickImages, 200);
              }}
            />
            <PickerOption
              icon={<Feather name="camera" size={20} color={colors.text} />}
              label="Camera"
              colors={colors}
              onPress={() => {
                setOpen(false);
                setTimeout(onPickCamera, 200);
              }}
            />
            <PickerOption
              icon={<Feather name="file-text" size={20} color={colors.text} />}
              label="PDF Document"
              colors={colors}
              onPress={() => {
                setOpen(false);
                setTimeout(onPickDocument, 200);
              }}
            />
          </YStack>
        </Sheet.Frame>
      </Sheet>
    </>
  );
}

function PickerOption({
  icon,
  label,
  colors,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: pressed
            ? colors.backgroundTertiary
            : colors.backgroundSecondary,
        },
      ]}
    >
      <XStack alignItems="center" gap="$3">
        {icon}
        <Text fontSize={15} color="$color" fontWeight="500">
          {label}
        </Text>
      </XStack>
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
  option: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
