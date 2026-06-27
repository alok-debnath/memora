import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  BackHandler,
  Keyboard,
  Pressable,
  View,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@/lib/icons";
import { XStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Portal } from "react-native-teleport";

export interface PopoverMenuItem {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  iconColor?: string;
  destructive?: boolean;
  onPress: () => void;
}

interface PopoverMenuProps {
  items: PopoverMenuItem[];
  children: React.ReactNode; // the trigger element
  width?: number;
  align?: "start" | "end";
  triggerGap?: number;
  horizontalOffset?: number;
  verticalOffset?: number;
}

const DEFAULT_MENU_WIDTH = 220;
const ITEM_HEIGHT = 48;
const MENU_PADDING = 8;
const MENU_EDGE_OFFSET = 8;
const DEFAULT_TRIGGER_GAP = 8;

type TriggerRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getMenuPosition({
  rect,
  menuHeight,
  menuWidth,
  windowWidth,
  windowHeight,
  keyboardHeight,
  align,
  triggerGap,
  horizontalOffset,
  verticalOffset,
}: {
  rect: TriggerRect;
  menuHeight: number;
  menuWidth: number;
  windowWidth: number;
  windowHeight: number;
  keyboardHeight: number;
  align: "start" | "end";
  triggerGap: number;
  horizontalOffset: number;
  verticalOffset: number;
}) {
  const bottomLimit = windowHeight - keyboardHeight - MENU_EDGE_OFFSET;
  const effectiveGap = triggerGap + verticalOffset;
  const spaceBelow = bottomLimit - (rect.y + rect.height) - effectiveGap;
  const spaceAbove = rect.y - MENU_EDGE_OFFSET - effectiveGap;
  const floatAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;

  const unclampedTop = floatAbove
    ? rect.y - menuHeight - effectiveGap
    : rect.y + rect.height + effectiveGap;
  const maxTop = Math.max(MENU_EDGE_OFFSET, bottomLimit - menuHeight);
  const top = Math.min(Math.max(MENU_EDGE_OFFSET, unclampedTop), maxTop);

  const preferredLeft =
    (align === "start" ? rect.x : rect.x + rect.width - menuWidth) + horizontalOffset;
  const left = Math.min(
    Math.max(MENU_EDGE_OFFSET, preferredLeft),
    windowWidth - menuWidth - MENU_EDGE_OFFSET,
  );

  return { top, left };
}

export function PopoverMenu({
  items,
  children,
  width = DEFAULT_MENU_WIDTH,
  align = "end",
  triggerGap = DEFAULT_TRIGGER_GAP,
  horizontalOffset = 0,
  verticalOffset = 0,
}: PopoverMenuProps) {
  const theme = useAppTheme();
  const { height: winH, width: winW } = useWindowDimensions();
  const portalName = useId();
  // collapsable={false} is critical — without it React Native may elide the
  // native backing view, causing measureInWindow to return zeros.
  const triggerRef = useRef<View>(null);
  const lastTriggerRect = useRef<TriggerRect | null>(null);

  // null = closed; object = open with precomputed position
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const isOpen = menuPos !== null;

  const menuHeight = items.length * ITEM_HEIGHT + MENU_PADDING;

  const positionMenu = useCallback(
    (rect: TriggerRect) => {
      lastTriggerRect.current = rect;
      setMenuPos(
        getMenuPosition({
          rect,
          menuHeight,
          menuWidth: width,
          windowWidth: winW,
          windowHeight: winH,
          keyboardHeight,
          align,
          triggerGap,
          horizontalOffset,
          verticalOffset,
        }),
      );
    },
    [
      align,
      horizontalOffset,
      keyboardHeight,
      menuHeight,
      triggerGap,
      verticalOffset,
      winH,
      winW,
      width,
    ],
  );

  const measureAndOpen = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, triggerWidth, height) => {
      positionMenu({ x, y, width: triggerWidth, height });
    });
  }, [positionMenu]);

  const open = useCallback(() => {
    measureAndOpen();
  }, [measureAndOpen]);

  const close = useCallback(() => setMenuPos(null), []);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
      close();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => backSub.remove();
  }, [close, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (lastTriggerRect.current) {
      positionMenu(lastTriggerRect.current);
    }
  }, [isOpen, keyboardHeight, positionMenu, winH, winW]);

  return (
    <>
      {/* collapsable={false} ensures a real native view exists for measureInWindow */}
      <View ref={triggerRef} collapsable={false}>
        <Pressable onPress={open} style={({ pressed }) => [pressed && styles.triggerPressed]}>
          {children}
        </Pressable>
      </View>

      {menuPos ? (
        <Portal hostName="root" name={`popover-menu-${portalName}`}>
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Pressable style={StyleSheet.absoluteFill} onPress={close} />
            <Pressable
              style={[
                styles.menu,
                {
                  top: menuPos.top,
                  left: menuPos.left,
                  width,
                  backgroundColor: theme.card.val,
                  borderColor: theme.borderColor.val,
                  shadowColor: theme.shadowColor.val,
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
                    onPress={() => {
                      close();
                      item.onPress();
                    }}
                    style={({ pressed }) => [styles.item, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <XStack
                      alignItems="center"
                      gap={12}
                      paddingHorizontal={14}
                      paddingVertical={13}
                    >
                      <Feather
                        name={item.icon}
                        size={16}
                        color={
                          item.destructive
                            ? theme.destructive.val
                            : (item.iconColor ?? theme.colorMuted.val)
                        }
                      />
                      <Text
                        fontSize={14}
                        fontFamily="$body"
                        color={item.destructive ? theme.destructive.val : "$color"}
                      >
                        {item.label}
                      </Text>
                    </XStack>
                  </Pressable>
                </React.Fragment>
              ))}
            </Pressable>
          </View>
        </Portal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  triggerPressed: {
    opacity: 0.6,
  },
  menu: {
    position: "absolute",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
  },
  item: { minHeight: ITEM_HEIGHT },
  divider: { height: StyleSheet.hairlineWidth },
});
