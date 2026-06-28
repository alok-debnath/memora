import React, { useState, useRef, useCallback, useEffect } from "react";
import { TextInput, Platform, Alert, Switch } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetView,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  TouchableOpacity as BottomSheetTouchableOpacity,
} from "@gorhom/bottom-sheet";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@/lib/icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";
import { useAction } from "convex/react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { FontFamily } from "@/constants/fonts";
import { AIChatPanel, AIChatPanelFooter, useAIChatController } from "./AIChatPanel";
import { PressableScale } from "./ui/PressableScale";
import { SegmentedControl } from "./ui/SegmentedControl";
import { GradientButton } from "./ui/GradientButton";
import { statusAccentColors } from "@/constants/colors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPLATES = [
  {
    name: "Meeting Notes",
    icon: "briefcase" as const,
    prompt: "Meeting Notes:\n\nDate: \nAttendees: \nAgenda: \nKey Points:\n- \n\nAction Items:\n- ",
  },
  {
    name: "Daily Journal",
    icon: "file-text" as const,
    prompt: "Today I...\n\nGrateful for:\n- \n\nHighlights:\n- \n\nTomorrow I want to:\n- ",
  },
  {
    name: "Habit Tracker",
    icon: "check-square" as const,
    prompt: "Habit Check-in:\n\nExercise: \nWater intake: \nSleep: \nMeditation: \nReading: ",
  },
  {
    name: "Health Log",
    icon: "heart" as const,
    prompt: "Health Log:\n\nDate: \nSymptoms: \nMedications: \nMood: \nEnergy level: \nNotes: ",
  },
];

const TIPS = [
  '"Remind me to renew my passport on March 15 every year"',
  '"WiFi password for the office is starlight42"',
  "Enable Time Capsule to lock a memory until a future date",
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onPress,
}: {
  template: (typeof TEMPLATES)[number];
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <PressableScale onPress={onPress} style={{ flexBasis: "46%", flexGrow: 1 }}>
      <YStack
        backgroundColor="$card"
        borderColor="$borderColor"
        borderWidth={1}
        borderRadius={16}
        padding={16}
        gap={8}
      >
        <XStack
          width={40}
          height={40}
          borderRadius={12}
          alignItems="center"
          justifyContent="center"
          backgroundColor={theme.primary.val + "12"}
        >
          <Feather name={template.icon} size={20} color={theme.primary.val} />
        </XStack>
        <Text fontSize={14} fontFamily="$body" fontWeight="600" color="$color" numberOfLines={1}>
          {template.name}
        </Text>
      </YStack>
    </PressableScale>
  );
}

function TipsCard() {
  return (
    <YStack
      backgroundColor="$card"
      borderColor="$borderColor"
      borderWidth={1}
      borderRadius={16}
      padding={16}
      gap={8}
    >
      <XStack alignItems="center" gap={6} marginBottom={4}>
        <Feather name="zap" size={14} color={statusAccentColors.warning} />
        <Text fontSize={14} fontFamily="$body" fontWeight="600" color="$color">
          Tips
        </Text>
      </XStack>
      {TIPS.map((tip, i) => (
        <XStack key={i} gap={8}>
          <Text fontSize={14} lineHeight={20} color="$colorMuted">
            {"\u2022"}
          </Text>
          <Text fontSize={13} fontFamily="$body" lineHeight={20} flex={1} color="$colorMuted">
            {tip}
          </Text>
        </XStack>
      ))}
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface UnifiedCommandPanelProps {
  visible: boolean;
  onClose: () => void;
}

export function UnifiedCommandPanel({ visible, onClose }: UnifiedCommandPanelProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const isLargeScreen = useIsLargeScreen();
  const modalRef = useRef<BottomSheetModal>(null);
  const presentedRef = useRef(false);
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<"chat" | "note">("chat");
  const [chatInputMode, setChatInputMode] = useState<"voice" | "keyboard">("voice");
  const [autoVoiceOutput, setAutoVoiceOutput] = useState(true);
  const [noteSubTab, setNoteSubTab] = useState<"type" | "template">("type");
  const [noteText, setNoteText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [timeCapsuleEnabled, setTimeCapsuleEnabled] = useState(false);
  const [capsuleDate, setCapsuleDate] = useState("");
  const [chatFooterHeight, setChatFooterHeight] = useState(0);
  const chatController = useAIChatController({
    token,
    chatInputMode,
    setChatInputMode,
    autoVoiceOutput,
  });

  const noteInputRef = useRef<TextInput>(null);

  const captureMemory = useAction(api.actions.processMemory.captureMemory);

  // ---- Handlers ----

  const handleSaveNote = async () => {
    if (!noteText.trim() || !token) return;
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setIsSaving(true);
    try {
      const content =
        timeCapsuleEnabled && capsuleDate
          ? `${noteText}\n\n[Time Capsule: lock until ${capsuleDate}]`
          : noteText;
      const result = await captureMemory({
        token,
        content,
        currentTime: new Date().toISOString(),
        currentTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      if (result.conflicts.length > 0) {
        const message = result.conflicts
          .map((c: { description: string }) => c.description)
          .join("\n");
        if (Platform.OS === "web") {
          window.alert(`Saved with potential conflicts:\n${message}`);
        } else {
          Alert.alert("Potential conflicts", message);
        }
      }
      setNoteText("");
      setTimeCapsuleEnabled(false);
      setCapsuleDate("");
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleTemplateSelect = (template: (typeof TEMPLATES)[number]) => {
    setNoteText(template.prompt);
    setNoteSubTab("type");
    setTimeout(() => noteInputRef.current?.focus(), 200);
  };

  const handleDismiss = useCallback(() => {
    presentedRef.current = false;
    onClose();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  useEffect(() => {
    if (visible && !presentedRef.current) {
      modalRef.current?.present();
      presentedRef.current = true;
      return;
    }

    if (!visible && presentedRef.current) {
      modalRef.current?.dismiss();
    }
  }, [visible]);

  const sharedHeader = (
    <YStack paddingHorizontal={16} paddingTop={10} paddingBottom={10} gap={12}>
      <XStack alignItems="center" justifyContent="space-between" gap={12}>
        <XStack flex={1} alignItems="center" gap={12}>
          <XStack
            width={40}
            height={40}
            borderRadius={20}
            alignItems="center"
            justifyContent="center"
            backgroundColor={theme.primary.val + "15"}
          >
            <Feather
              name={activeTab === "chat" ? "cpu" : "edit-3"}
              size={18}
              color={theme.primary.val}
            />
          </XStack>
          <YStack flex={1} minWidth={0} gap={2}>
            <Text
              fontSize={18}
              fontFamily="$body"
              fontWeight="700"
              color="$color"
              numberOfLines={1}
            >
              Memora
            </Text>
            <Text fontSize={13} lineHeight={18} color="$colorMuted" numberOfLines={2}>
              {activeTab === "chat"
                ? "Ask anything about your memories"
                : "Capture a memory quickly"}
            </Text>
          </YStack>
        </XStack>
        <XStack alignItems="center" gap={6}>
          {activeTab === "chat" ? (
            <>
              <BottomSheetTouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAutoVoiceOutput((v) => !v);
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: autoVoiceOutput ? theme.primary.val + "15" : theme.card.val,
                  borderWidth: 1,
                  borderColor: theme.borderColor.val,
                }}
              >
                <Feather
                  name={autoVoiceOutput ? "volume-2" : "volume-x"}
                  size={16}
                  color={autoVoiceOutput ? theme.primary.val : theme.colorMuted.val}
                />
              </BottomSheetTouchableOpacity>
              <BottomSheetTouchableOpacity
                onPress={() => setChatInputMode(chatInputMode === "voice" ? "keyboard" : "voice")}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.card.val,
                  borderWidth: 1,
                  borderColor: theme.borderColor.val,
                }}
              >
                <Feather
                  name={chatInputMode === "voice" ? "type" : "mic"}
                  size={16}
                  color={theme.colorMuted.val}
                />
              </BottomSheetTouchableOpacity>
            </>
          ) : null}
          <PressableScale onPress={onClose}>
            <YStack
              width={36}
              height={36}
              borderRadius={18}
              alignItems="center"
              justifyContent="center"
              backgroundColor="$card"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <Feather name="x" size={16} color={theme.color.val} />
            </YStack>
          </PressableScale>
        </XStack>
      </XStack>

      <SegmentedControl
        options={[
          {
            value: "chat" as const,
            label: "AI Chat",
            icon: (
              <Feather
                name="cpu"
                size={14}
                color={activeTab === "chat" ? theme.color.val : theme.colorMuted.val}
              />
            ),
          },
          {
            value: "note" as const,
            label: "New Memory",
            icon: (
              <Feather
                name="edit-3"
                size={14}
                color={activeTab === "note" ? theme.color.val : theme.colorMuted.val}
              />
            ),
          },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />
    </YStack>
  );

  // ---- Render ----

  return (
    <BottomSheetModal
      ref={modalRef}
      name="unifiedCommand"
      index={0}
      snapPoints={["62%", "92%"]}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      detached={isLargeScreen}
      enablePanDownToClose
      style={
        isLargeScreen
          ? {
              marginHorizontal: 16,
              width: "100%",
              maxWidth: 720,
              alignSelf: "center",
            }
          : undefined
      }
      topInset={isLargeScreen ? insets.top + 16 : insets.top}
      bottomInset={isLargeScreen ? insets.bottom + 16 : insets.bottom}
      enableBlurKeyboardOnGesture
      android_keyboardInputMode="adjustResize"
      stackBehavior="push"
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.surface.val }}
      footerComponent={
        activeTab === "chat"
          ? (props) => (
              <AIChatPanelFooter
                {...props}
                controller={chatController}
                bottomInset={isLargeScreen ? insets.bottom + 16 : insets.bottom}
                onHeightChange={(height) => {
                  setChatFooterHeight((current) =>
                    Math.abs(current - height) < 1 ? current : height,
                  );
                }}
              />
            )
          : undefined
      }
      onDismiss={handleDismiss}
    >
      {activeTab === "chat" ? (
        <>
          {sharedHeader}
          <XStack
            alignItems="center"
            justifyContent="space-between"
            paddingHorizontal={16}
            paddingBottom={10}
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
            backgroundColor="$background"
          >
            <Text fontSize={12} fontFamily="$body" color="$colorMuted">
              {chatController.messages.length}{" "}
              {chatController.messages.length === 1 ? "message" : "messages"}
            </Text>
            <PressableScale onPress={chatController.handleClearChat}>
              <XStack
                alignItems="center"
                gap={6}
                paddingHorizontal={10}
                paddingVertical={6}
                borderRadius={999}
                borderWidth={1}
                borderColor="$borderColor"
                backgroundColor="$card"
              >
                <Feather name="trash-2" size={13} color={theme.colorMuted.val} />
                <Text fontSize={12} fontFamily="$body" color="$colorMuted">
                  Clear
                </Text>
              </XStack>
            </PressableScale>
          </XStack>
          <AIChatPanel controller={chatController} footerHeight={chatFooterHeight} />
        </>
      ) : (
        <BottomSheetView style={{ flex: 1, minHeight: 0 }}>
          {sharedHeader}
          <YStack flex={1} minHeight={0}>
            {/* Sub-tabs */}
            <YStack paddingHorizontal={16} paddingBottom={8}>
              <SegmentedControl
                options={[
                  {
                    value: "type" as const,
                    label: "Type",
                    icon: (
                      <Feather
                        name="edit-3"
                        size={14}
                        color={noteSubTab === "type" ? theme.color.val : theme.colorMuted.val}
                      />
                    ),
                  },
                  {
                    value: "template" as const,
                    label: "Template",
                    icon: (
                      <Feather
                        name="grid"
                        size={14}
                        color={noteSubTab === "template" ? theme.color.val : theme.colorMuted.val}
                      />
                    ),
                  },
                ]}
                value={noteSubTab}
                onChange={setNoteSubTab}
              />
            </YStack>

            <BottomSheetScrollView
              contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 32, gap: 16 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {/* Time Capsule Toggle */}
              <XStack
                alignItems="center"
                justifyContent="space-between"
                padding={14}
                borderRadius={16}
                borderWidth={1}
                borderColor="$borderColor"
                backgroundColor="$card"
              >
                <XStack alignItems="center" gap={12}>
                  <Feather
                    name="lock"
                    size={18}
                    color={timeCapsuleEnabled ? theme.primary.val : theme.colorMuted.val}
                  />
                  <YStack>
                    <Text fontSize={15} fontFamily="$body" fontWeight="600" color="$color">
                      Time Capsule
                    </Text>
                    <Text fontSize={12} fontFamily="$body" marginTop={1} color="$colorMuted">
                      Lock until a future date
                    </Text>
                  </YStack>
                </XStack>
                <Switch
                  value={timeCapsuleEnabled}
                  onValueChange={setTimeCapsuleEnabled}
                  trackColor={{
                    false: theme.borderColor.val,
                    true: theme.primary.val + "60",
                  }}
                  thumbColor={timeCapsuleEnabled ? theme.primary.val : theme.colorMuted.val}
                />
              </XStack>

              {/* Date picker when time capsule is on */}
              {timeCapsuleEnabled && (
                <Animated.View entering={FadeIn.duration(200)}>
                  <XStack
                    alignItems="center"
                    paddingHorizontal={14}
                    paddingVertical={12}
                    borderRadius={16}
                    borderWidth={1}
                    borderColor="$borderColor"
                    backgroundColor="$card"
                    gap={8}
                  >
                    {Platform.OS === "web" ? (
                      <input
                        type="date"
                        value={capsuleDate}
                        onChange={(e: any) => setCapsuleDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        style={{
                          flex: 1,
                          border: "none",
                          background: "transparent",
                          color: theme.color.val,
                          fontSize: 14,
                          fontFamily: "Inter, sans-serif",
                          outline: "none",
                        }}
                      />
                    ) : (
                      <BottomSheetTextInput
                        value={capsuleDate}
                        onChangeText={setCapsuleDate}
                        placeholder="mm/dd/yyyy"
                        placeholderTextColor={theme.colorMuted.val}
                        style={{
                          flex: 1,
                          fontSize: 14,
                          fontFamily: FontFamily.regular,
                          padding: 0,
                          color: theme.color.val,
                        }}
                        keyboardType="numbers-and-punctuation"
                      />
                    )}
                    <Feather name="calendar" size={16} color={theme.colorMuted.val} />
                  </XStack>
                </Animated.View>
              )}

              {noteSubTab === "type" ? (
                <>
                  {/* Note input area */}
                  <YStack
                    backgroundColor="$card"
                    borderColor="$borderColor"
                    borderWidth={1}
                    borderRadius={16}
                    padding={16}
                    gap={12}
                  >
                    <YStack gap={4}>
                      <Text
                        fontSize={12}
                        fontWeight="600"
                        color="$colorMuted"
                        textTransform="uppercase"
                      >
                        Memory note
                      </Text>
                      <Text fontSize={13} color="$colorMuted">
                        Write a quick note, reminder, or idea.
                      </Text>
                    </YStack>
                    <BottomSheetTextInput
                      ref={noteInputRef as any}
                      value={noteText}
                      onChangeText={setNoteText}
                      placeholder={
                        "Type a memory note... e.g.\n'Remind me to renew my passport\non March 15 every year'"
                      }
                      placeholderTextColor={theme.colorMuted.val}
                      multiline
                      style={{
                        fontSize: 14,
                        fontFamily: FontFamily.regular,
                        lineHeight: 22,
                        textAlignVertical: "top",
                        minHeight: 60,
                        padding: 0,
                        color: theme.color.val,
                      }}
                    />
                    <GradientButton
                      title={isSaving ? "Saving..." : "Save Memory"}
                      icon="save"
                      onPress={handleSaveNote}
                      disabled={!noteText.trim() || isSaving}
                    />
                  </YStack>

                  <TipsCard />
                </>
              ) : (
                <>
                  {/* Template grid */}
                  <XStack flexWrap="wrap" gap={12}>
                    {TEMPLATES.map((template) => (
                      <TemplateCard
                        key={template.name}
                        template={template}
                        onPress={() => handleTemplateSelect(template)}
                      />
                    ))}
                  </XStack>

                  <TipsCard />
                </>
              )}
            </BottomSheetScrollView>
          </YStack>
        </BottomSheetView>
      )}
    </BottomSheetModal>
  );
}
