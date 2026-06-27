import type { ComponentProps } from "react";
import { Feather } from "@react-native-vector-icons/feather";
import { FontAwesome5 } from "@react-native-vector-icons/fontawesome5";

export type FeatherIconName = ComponentProps<typeof Feather>["name"];

export { Feather, FontAwesome5 };
