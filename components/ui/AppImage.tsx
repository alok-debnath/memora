import React from "react";
import { Image, type ImageProps } from "expo-image";

/**
 * expo-image with sane defaults for list usage: disk+memory caching and a
 * recycling key so recycled rows don't flash a previous row's bitmap.
 * Pass `recyclingKey` (usually the item id) on any image inside a list.
 */
export function AppImage(props: ImageProps) {
  return <Image cachePolicy="memory-disk" transition={120} {...props} />;
}
