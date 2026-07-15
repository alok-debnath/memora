import { FlatList, Platform } from "react-native";
import { FlashList } from "@shopify/flash-list";

export type { ListRenderItemInfo } from "@shopify/flash-list";

// FlashList v2's web renderer can enter a commitLayout measurement loop
// ("Maximum update depth exceeded" in ViewHolderCollection) when row heights
// settle asynchronously, so web falls back to FlatList; the prop surface used
// in this app (data/renderItem/headers/onEndReached/contentContainerStyle) is
// shared between the two.
export const AppList = (Platform.OS === "web" ? FlatList : FlashList) as typeof FlashList;
