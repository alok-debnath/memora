import { Platform, TextInput } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";

// BottomSheetTextInput's blur handler calls
// TextInput.State.currentlyFocusedInput(), which react-native-web does not
// implement, crashing on web. The keyboard coordination it provides is a
// native-only concern anyway, so web uses the plain TextInput.
export const SheetTextInput = (
  Platform.OS === "web" ? TextInput : BottomSheetTextInput
) as typeof BottomSheetTextInput;
