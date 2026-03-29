import { useWindowDimensions } from "react-native";

export function useIsLargeScreen() {
  const { width } = useWindowDimensions();
  return width >= 768;
}
