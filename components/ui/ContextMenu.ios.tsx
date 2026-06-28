import React, { useImperativeHandle, useMemo, useRef } from "react";
import {
  MenuView,
  type MenuAction,
  type MenuComponentRef,
  type NativeActionEvent,
} from "@expo/ui/community/menu";
import {
  Button as SwiftUIButton,
  ContextMenu as SwiftUIContextMenu,
  Host as SwiftUIHost,
  RNHostView as SwiftUIRNHostView,
  Section as SwiftUISection,
} from "@expo/ui/swift-ui";
import { contentShape, onTapGesture, shapes } from "@expo/ui/swift-ui/modifiers";
import {
  actionId,
  ContextMenuHandle,
  type ContextMenuItemDef,
  type ContextMenuProps,
  IOS_SYMBOLS,
  wrapTrigger,
} from "./ContextMenu.shared";

function toNativeActions(items: ContextMenuItemDef[]): MenuAction[] {
  return items.map((item, index) => ({
    id: actionId(item, index),
    title: item.label,
    image: IOS_SYMBOLS[item.icon],
    imageColor: item.destructive ? undefined : item.iconColor,
    attributes: item.destructive ? { destructive: true } : undefined,
  }));
}

export const ContextMenu = React.forwardRef<ContextMenuHandle, ContextMenuProps>(
  function ContextMenu(
    { children, preview, items, onPress, openOn = "longPress" }: ContextMenuProps,
    ref,
  ) {
    const validItems = useMemo(() => items.filter(Boolean) as ContextMenuItemDef[], [items]);
    const nativeActions = useMemo(() => toNativeActions(validItems), [validItems]);
    const menuRef = useRef<MenuComponentRef>(null);

    useImperativeHandle(
      ref,
      () => ({
        open: () => menuRef.current?.show(),
        close: () => {},
      }),
      [],
    );

    if (validItems.length === 0) {
      return <>{wrapTrigger(children, onPress, openOn)}</>;
    }

    if (openOn === "press") {
      return (
        <MenuView
          ref={menuRef}
          actions={nativeActions}
          onPressAction={(event: NativeActionEvent) => {
            const item = validItems.find(
              (candidate, index) => actionId(candidate, index) === event.nativeEvent.event,
            );
            item?.onPress();
          }}
        >
          {children}
        </MenuView>
      );
    }

    const trigger = (
      <SwiftUIRNHostView matchContents>
        <>{wrapTrigger(children, onPress, openOn)}</>
      </SwiftUIRNHostView>
    );

    return (
      <SwiftUIHost matchContents ignoreSafeArea="all">
        <SwiftUIContextMenu
          modifiers={
            onPress ? [contentShape(shapes.rectangle()), onTapGesture(onPress)] : undefined
          }
        >
          <SwiftUIContextMenu.Trigger>{trigger}</SwiftUIContextMenu.Trigger>
          {preview ? (
            <SwiftUIContextMenu.Preview>
              <SwiftUIRNHostView matchContents>
                <>{preview}</>
              </SwiftUIRNHostView>
            </SwiftUIContextMenu.Preview>
          ) : null}
          <SwiftUIContextMenu.Items>
            <SwiftUISection>
              {validItems.map((item, index) => (
                <SwiftUIButton
                  key={actionId(item, index)}
                  label={item.label}
                  role={item.destructive ? "destructive" : undefined}
                  systemImage={IOS_SYMBOLS[item.icon]}
                  onPress={item.onPress}
                />
              ))}
            </SwiftUISection>
          </SwiftUIContextMenu.Items>
        </SwiftUIContextMenu>
      </SwiftUIHost>
    );
  },
);

export type { ContextMenuHandle, ContextMenuItemDef, ContextMenuProps } from "./ContextMenu.shared";
