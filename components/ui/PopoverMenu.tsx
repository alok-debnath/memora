import React, { useCallback, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  View,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { YStack, XStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";

export interface PopoverMenuItem {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
}

interface PopoverMenuProps {
  items: PopoverMenuItem[];
  children: React.ReactNode; // the trigger element
}

type Pos = { x: number; y: number; width: number; height: number };

export function PopoverMenu({ items, children }: PopoverMenuProps) {
  const theme = useAppTheme();
  const { height: winH } = useWindowDimensions();
  const triggerRef = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0, width: 0, height: 0 });

  const MENU_WIDTH = 200;
  const ITEM_HEIGHT = 48;
  const MENU_HEIGHT = items.length * ITEM_HEIGHT + 8;

  const open = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setPos({ x, y, width, height });
      setVisible(true);
    });
  }, []);

  const close = useCallback(() => setVisible(false), []);

  // Decide whether menu floats above or below the trigger
  const spaceBelow = winH - (pos.y + pos.height);
  const floatAbove = spaceBelow < MENU_HEIGHT + 12;

  const menuTop = floatAbove
    ? pos.y - MENU_HEIGHT - 8
    : pos.y + pos.height + 8;

  // Align right edge of menu with right edge of trigger
  const menuLeft = Math.max(8, pos.x + pos.width - MENU_WIDTH);

  return (
    <>
      <View ref={triggerRef}>
        <Pressable onPress={open}>{children}</Pressable>
      </View>

      <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
        {/* Full-screen dismiss backdrop */}
        <Pressable style={StyleSheet.absoluteFill} onPress={close}>
          {/* Menu card — stops propagation so tapping inside doesn't dismiss */}
          <Pressable
            style={[
              styles.menu,
              {
                top: menuTop,
                left: menuLeft,
                width: MENU_WIDTH,
                backgroundColor: theme.card.val,
                borderColor: theme.borderColor.val,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {items.map((item, i) => (
              <React.Fragment key={item.label}>
                {i > 0 && (
                  <View style={[styles.divider, { backgroundColor: theme.borderColor.val }]} />
                )}
                <Pressable
                  onPress={() => { close(); item.onPress(); }}
                  style={({ pressed }) => [styles.item, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <XStack alignItems="center" gap={12} paddingHorizontal={14} paddingVertical={13}>
                    <Feather name={item.icon} size={16} color={theme.colorMuted.val} />
                    <Text fontSize={14} fontFamily="$body" color="$color">{item.label}</Text>
                  </XStack>
                </Pressable>
              </React.Fragment>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
  },
  item: { minHeight: 48 },
  divider: { height: StyleSheet.hairlineWidth },
});
