# Bottom-sheet gesture limitation

`BottomSheetTextInput` can retain a vertical drag inside a scrollable form,
causing the field to focus instead of handing the gesture to
`BottomSheetScrollView`. This was reproduced in the Edit Memory sheet. Its
paused Voice mode transcript deliberately uses a native `TextInput` so it
does not reintroduce the conflict.

Do not treat `enableContentPanningGesture={false}` as a general fix: Gorhom
has an iOS issue where that setting can make a modal's scrollable content stop
scrolling. Form-heavy editing flows need an explicit gesture architecture (or
a non-draggable modal/screen), validated on both Android and iOS.
