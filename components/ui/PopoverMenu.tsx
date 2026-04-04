import React, { useCallback, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  View,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { XStack, Text } from "tamagui";
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

const MENU_WIDTH = 200;
const ITEM_HEIGHT = 48;
const MENU_PADDING = 8;

export function PopoverMenu({ items, children }: PopoverMenuProps) {
  const theme = useAppTheme();
  const { height: winH, width: winW } = useWindowDimensions();
  // collapsable={false} is critical — without it React Native may elide the
  // native backing view, causing measureInWindow to return zeros.
  const triggerRef = useRef<View>(null);

  // null = closed; object = open with precomputed position
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const menuHeight = items.length * ITEM_HEIGHT + MENU_PADDING;

  const open = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      // Precompute entirely inside the callback so there is never a render
      // cycle where visible=true but pos=(0,0).
      const spaceBelow = winH - (y + height);
      const floatAbove = spaceBelow < menuHeight + 12;
      const top = floatAbove ? y - menuHeight - 8 : y + height + 8;
      // Align right edge of menu with right edge of trigger; clamp to screen
      const left = Math.min(
        Math.max(8, x + width - MENU_WIDTH),
        winW - MENU_WIDTH - 8,
      );
      setMenuPos({ top, left });
    });
  }, [menuHeight, winH, winW]);

  const close = useCallback(() => setMenuPos(null), []);

  return (
    <>
      {/* collapsable={false} ensures a real native view exists for measureInWindow */}
      <View ref={triggerRef} collapsable={false}>
        <Pressable onPress={open}>{children}</Pressable>
      </View>

      <Modal
        visible={menuPos !== null}
        transparent
        animationType="none"
        onRequestClose={close}
        statusBarTranslucent
      >
        {/* Full-screen dismiss backdrop */}
        <Pressable style={StyleSheet.absoluteFill} onPress={close}>
          {menuPos && (
            // Stop propagation so tapping inside the card doesn't dismiss
            <Pressable
              style={[
                styles.menu,
                {
                  top: menuPos.top,
                  left: menuPos.left,
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
          )}
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
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
  },
  item: { minHeight: ITEM_HEIGHT },
  divider: { height: StyleSheet.hairlineWidth },
});
