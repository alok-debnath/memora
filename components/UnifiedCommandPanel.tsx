import React, { useState, useRef, useCallback } from "react";
import {
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  Switch,
} from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, useAnimatedStyle } from "react-native-reanimated";
import {
  KeyboardStickyView,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { FontFamily } from "@/constants/fonts";
import { AIChatPanel } from "./AIChatPanel";
import { VoiceRecorder } from "./VoiceRecorder";
import { BaseSheet } from "./ui/BaseSheet";
import { PressableScale } from "./ui/PressableScale";
import { SegmentedControl } from "./ui/SegmentedControl";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPLATES = [
  {
    name: "Meeting Notes",
    icon: "briefcase" as const,
    category: "work",
    prompt: "Meeting Notes:\n\nDate: \nAttendees: \nAgenda: \nKey Points:\n- \n\nAction Items:\n- ",
  },
  {
    name: "Daily Journal",
    icon: "file-text" as const,
    category: "personal",
    prompt: "Today I...\n\nGrateful for:\n- \n\nHighlights:\n- \n\nTomorrow I want to:\n- ",
  },
  {
    name: "Habit Tracker",
    icon: "check-square" as const,
    category: "health",
    prompt: "Habit Check-in:\n\nExercise: \nWater intake: \nSleep: \nMeditation: \nReading: ",
  },
  {
    name: "Health Log",
    icon: "heart" as const,
    category: "health",
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
        <Text fontSize={12} fontFamily="$body" color="$colorMuted">
          {template.category.charAt(0).toUpperCase() + template.category.slice(1)}
        </Text>
      </YStack>
    </PressableScale>
  );
}

function TipsCard() {
  const theme = useAppTheme();
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
        <Feather name="zap" size={14} color="#F59E0B" />
        <Text fontSize={14} fontFamily="$body" fontWeight="600" color="$color">Tips</Text>
      </XStack>
      {TIPS.map((tip, i) => (
        <XStack key={i} gap={8}>
          <Text fontSize={14} lineHeight={20} color="$colorMuted">{"\u2022"}</Text>
          <Text fontSize={13} fontFamily="$body" lineHeight={20} flex={1} color="$colorMuted">{tip}</Text>
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
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<"chat" | "note">("chat");
  const [chatInputMode, setChatInputMode] = useState<"voice" | "keyboard">("voice");
  const [noteSubTab, setNoteSubTab] = useState<"type" | "template">("type");
  const [noteText, setNoteText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [timeCapsuleEnabled, setTimeCapsuleEnabled] = useState(false);
  const [capsuleDate, setCapsuleDate] = useState("");
  const insets = useSafeAreaInsets();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const keyboardSpacerStyle = useAnimatedStyle(() => ({
    height: Math.abs(keyboardHeight.value),
  }));

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
      const content = timeCapsuleEnabled && capsuleDate
        ? `${noteText}\n\n[Time Capsule: lock until ${capsuleDate}]`
        : noteText;
      const result = await captureMemory({ token, content });
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

  // ---- Render ----

  return (
    <BaseSheet
      sheetId="unifiedCommand"
      open={visible}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* ── Header ── */}
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={16}
        paddingVertical={12}
        borderBottomWidth={0.5}
        borderBottomColor="$borderColor"
      >
        <XStack alignItems="center" gap={10} flex={1}>
          <XStack
            width={36}
            height={36}
            borderRadius={12}
            alignItems="center"
            justifyContent="center"
            backgroundColor={theme.primary.val + "15"}
          >
            <Feather name="cpu" size={18} color={theme.primary.val} />
          </XStack>
          <YStack>
            <Text fontSize={16} fontFamily="$body" fontWeight="600" color="$color">Memora</Text>
            <Text fontSize={12} fontFamily="$body" marginTop={1} color="$colorMuted">
              {activeTab === "chat"
                ? "Ask anything about your memories"
                : "Create a new memory"}
            </Text>
          </YStack>
        </XStack>
        <XStack alignItems="center" gap={4}>
          {activeTab === "chat" && (
            <>
              <Pressable
                onPress={() => {}}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.primary.val + "15",
                }}
              >
                <Feather name="volume-2" size={16} color={theme.primary.val} />
              </Pressable>
              <Pressable
                onPress={() =>
                  setChatInputMode(chatInputMode === "voice" ? "keyboard" : "voice")
                }
                style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" }}
              >
                <Feather
                  name={chatInputMode === "voice" ? "type" : "mic"}
                  size={16}
                  color={theme.colorMuted.val}
                />
              </Pressable>
            </>
          )}
          <Pressable onPress={onClose} style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" }}>
            <Feather name="x" size={18} color={theme.colorMuted.val} />
          </Pressable>
        </XStack>
      </XStack>

      {/* ── Main Tabs ── */}
      <YStack paddingHorizontal={16} paddingVertical={10}>
        <SegmentedControl
          options={[
            {
              value: "chat" as const,
              label: "AI Chat",
              icon: <Feather name="cpu" size={14} color={activeTab === "chat" ? theme.color.val : theme.colorMuted.val} />,
            },
            {
              value: "note" as const,
              label: "New Memory",
              icon: <Feather name="edit-3" size={14} color={activeTab === "note" ? theme.color.val : theme.colorMuted.val} />,
            },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </YStack>

      {/* ── Content ── */}
      {activeTab === "chat" ? (
        <AIChatPanel token={token} chatInputMode={chatInputMode} setChatInputMode={setChatInputMode} />
      ) : (
        /* ── New Memory Tab ── */
        <YStack flex={1}>
          {/* Sub-tabs */}
          <YStack paddingHorizontal={16} paddingBottom={8}>
            <SegmentedControl
              options={[
                {
                  value: "type" as const,
                  label: "Type",
                  icon: <Feather name="edit-3" size={14} color={noteSubTab === "type" ? theme.color.val : theme.colorMuted.val} />,
                },
                {
                  value: "template" as const,
                  label: "Template",
                  icon: <Feather name="grid" size={14} color={noteSubTab === "template" ? theme.color.val : theme.colorMuted.val} />,
                },
              ]}
              value={noteSubTab}
              onChange={setNoteSubTab}
            />
          </YStack>

          <ScrollView
            contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Time Capsule Toggle */}
            <XStack
              alignItems="center"
              justifyContent="space-between"
              paddingVertical={4}
              borderBottomWidth={0.5}
              borderBottomColor="$borderColor"
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
                trackColor={{ false: theme.borderColor.val, true: theme.primary.val + "60" }}
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
                  borderRadius={12}
                  borderWidth={0.5}
                  borderColor="$borderColor"
                  backgroundColor="$secondary"
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
                    <TextInput
                      value={capsuleDate}
                      onChangeText={setCapsuleDate}
                      placeholder="mm/dd/yyyy"
                      placeholderTextColor={theme.colorMuted.val}
                      style={{ flex: 1, fontSize: 14, fontFamily: FontFamily.regular, padding: 0, color: theme.color.val }}
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
                  minHeight={120}
                  position="relative"
                >
                  <Feather
                    name="edit-3"
                    size={18}
                    color={theme.colorMuted.val}
                    style={{ marginBottom: 8 }}
                  />
                  <TextInput
                    ref={noteInputRef}
                    value={noteText}
                    onChangeText={setNoteText}
                    placeholder={"Type a memory note... e.g.\n'Remind me to renew my passport\non March 15 every year'"}
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
                  <PressableScale
                    onPress={handleSaveNote}
                    disabled={!noteText.trim() || isSaving}
                    style={{ position: "absolute", bottom: 14, right: 14 }}
                  >
                    <XStack
                      width={38}
                      height={38}
                      borderRadius={19}
                      alignItems="center"
                      justifyContent="center"
                      backgroundColor={noteText.trim() && !isSaving ? "$primary" : "$borderColor"}
                    >
                      <Feather
                        name="send"
                        size={16}
                        color={
                          noteText.trim() && !isSaving ? "#FFFFFF" : theme.colorMuted.val
                        }
                      />
                    </XStack>
                  </PressableScale>
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
          </ScrollView>
        </YStack>
      )}
    </BaseSheet>
  );
}
