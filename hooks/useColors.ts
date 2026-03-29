import Colors from "@/constants/colors";
import { useThemeStore } from "@/store/theme";

export function useColors() {
  const resolvedMode = useThemeStore((s) => s.resolvedMode);
  return Colors[resolvedMode];
}
