import React, { useEffect, useState } from "react";
import {
  TextInput,
  Switch,
  Platform,
  Pressable,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Modal,
  View,
} from "react-native";
import DateTimePicker from "react-native-ui-datepicker";
import dayjs from "dayjs";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { GradientButton } from "./ui/GradientButton";
import { PressableScale } from "./ui/PressableScale";
import { BaseSheet } from "./ui/BaseSheet";
import { SegmentedControl } from "./ui/SegmentedControl";
import { TagInput } from "./ui/TagInput";
import { PickerField, type PickerOption } from "./ui/PickerField";
import { TimeCapsuleToggle } from "./ui/TimeCapsuleToggle";
import { VoiceRecorder } from "./VoiceRecorder";
import { KeyboardAwareScrollViewCompat } from "./KeyboardAwareScrollViewCompat";
import {
  moodLabels,
  moodIcons,
  type Mood,
} from "@/constants/categories";
import { moodColors } from "@/constants/colors";
import { FontFamily } from "@/constants/fonts";
import type { MemoryNote } from "@/types/memory";
import { getReminderDate, inferMemoryEntryKind } from "@/types/memoryKind";

const MANUAL_OPTIONS = [
  { value: "manual" as const, label: "Manual" },
  { value: "voice" as const, label: "Voice" },
];

const ENTRY_KIND_OPTIONS = [
  { value: "memory" as const, label: "Memory" },
  { value: "reminder" as const, label: "Reminder" },
];

const moodOptions: PickerOption[] = (Object.keys(moodLabels) as Mood[]).map((k) => ({
  value: k,
  label: moodLabels[k],
  icon: moodIcons[k],
  color: moodColors[k],
}));

interface EditMemorySheetProps {
  memory?: MemoryNote;
  visible: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}

function createInitialState(memory?: MemoryNote) {
  const schedule = memory?.schedule;
  return {
    title: memory?.title ?? "",
    content: memory?.content ?? "",
    mood: (memory?.mood ?? null) as Mood | null,
    people: memory?.people ?? [],
    locations: memory?.locations ?? [],
    entryKind: inferMemoryEntryKind(memory ?? {}),
    reminderDate: schedule?.dueAt ?? getReminderDate(memory ?? {}) ?? "",
    isRecurring: schedule?.isRecurring ?? false,
    capsuleEnabled: !!(memory?.capsuleUnlockDate),
    capsuleDate: memory?.capsuleUnlockDate ?? "",
  };
}

export function EditMemorySheet({
  memory,
  visible,
  onClose,
  onSave,
}: EditMemorySheetProps) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const { token } = useAuth();
  const chatAction = useAction(api.actions.memoryChat.chat);
  const topicList = useQuery(api.userTopics.list, token ? { token } : "skip") ?? [];
  const resolvedTopics = (() => {
    if (!memory) return [];
    const byId: Record<string, { name: string; color?: string | null }> = {};
    for (const t of topicList) byId[t._id] = { name: t.name, color: t.color };
    const primary = memory.primaryTopicId ? byId[memory.primaryTopicId] : undefined;
    const secondary = (memory.topicIds ?? [])
      .filter((id) => id !== memory.primaryTopicId && byId[id])
      .map((id) => byId[id]);
    return [...(primary ? [primary] : []), ...secondary];
  })();
  const stackPickers = width < 390;

  const [form, setForm] = useState(() => createInitialState(memory));
  const [mode, setMode] = useState<"manual" | "voice">("manual");
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(createInitialState(memory));
      setMode("manual");
    }
  }, [memory, visible]);

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (form.entryKind === "reminder" && !form.reminderDate.trim()) {
      if (Platform.OS === "web") {
        window.alert("Reminder needs a date and time.");
      } else {
        Alert.alert("Reminder", "Add a date and time before saving.");
      }
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onSave({
      title: form.title.trim() || "Untitled Memory",
      content: form.content.trim(),
      mood: form.mood,
      people: form.people,
      locations: form.locations,
      entryKind: form.entryKind,
      schedule:
        form.entryKind === "reminder" && form.reminderDate.trim()
          ? {
              dueAt: form.reminderDate.trim(),
              isRecurring: form.isRecurring,
              recurrenceType: form.isRecurring ? "monthly" : undefined,
            }
          : null,
      capsuleUnlockDate:
        form.capsuleEnabled && form.capsuleDate.trim() ? form.capsuleDate.trim() : null,
    });
  };

  const handleReadAloud = () => {
    if (!form.content && !form.title) return;
    Speech.speak(`${form.title}. ${form.content}`, { language: "en" });
  };


  const handleDelete = () => {
    if (!memory) return;
    if (Platform.OS === "web") {
      if (window.confirm("Delete this memory? This cannot be undone.")) {
        onSave({ _delete: true });
      }
    } else {
      Alert.alert("Delete Memory", "This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onSave({ _delete: true }) },
      ]);
    }
  };

  const handleVoiceTranscription = async (text: string) => {
    if (!token || !memory || !text.trim()) return;
    setVoiceLoading(true);
    try {
      await chatAction({
        token,
        message: `For the memory titled "${memory.title}" (ID: ${memory.id}): ${text}`,
        currentTime: new Date().toISOString(),
        currentTimezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      onClose();
    } catch {
      if (Platform.OS === "web") {
        window.alert("Voice edit failed. Please try again.");
      } else {
        Alert.alert("Voice Edit", "Something went wrong. Please try again.");
      }
    } finally {
      setVoiceLoading(false);
    }
  };

  return (
    <BaseSheet
      onOpenChange={(open) => { if (!open) onClose(); }}
      open={visible}
      sheetId="editMemory"
      backgroundColor={theme.background.val}
    >
      {/* Header */}
      <XStack alignItems="center" paddingHorizontal={20} paddingTop={6} paddingBottom={12}>
        <XStack flex={1} alignItems="center" gap={8}>
          <Text fontSize={18}>✏️</Text>
          <Text fontSize={18} fontFamily="$body" fontWeight="600" color="$color">Edit Memory</Text>
        </XStack>
        <PressableScale onPress={onClose}>
          <YStack
            width={38}
            height={38}
            borderRadius={14}
            alignItems="center"
            justifyContent="center"
            backgroundColor="$background"
            borderWidth={1}
            borderColor="$borderColor"
          >
            <Feather name="x" size={18} color={theme.color.val} />
          </YStack>
        </PressableScale>
      </XStack>

      {/* Memory subtitle */}
      {memory && (
        <XStack alignItems="center" justifyContent="center" gap={6} marginBottom={6}>
          <Text fontSize={13} fontFamily="$body" color="$colorMuted" numberOfLines={1} maxWidth="80%">
            {memory.title}
          </Text>
        </XStack>
      )}

      {/* Mode switcher */}
      <YStack paddingHorizontal={20} marginBottom={4}>
        <SegmentedControl
          options={MANUAL_OPTIONS}
          value={mode}
          onChange={setMode}
        />
      </YStack>

      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          gap: 16,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Time Capsule */}
        <TimeCapsuleToggle
          enabled={form.capsuleEnabled}
          date={form.capsuleDate}
          onToggle={(v) => setField("capsuleEnabled", v)}
          onDateChange={(v) => setField("capsuleDate", v)}
        />

        {mode === "manual" ? (
          <>
            {/* Title */}
            <YStack gap={6}>
              <Text
                fontSize={11}
                fontFamily="$body"
                fontWeight="600"
                letterSpacing={0.8}
                marginLeft={4}
                textTransform="uppercase"
                color="$colorMuted"
              >
                TITLE
              </Text>
              <TextInput
                value={form.title}
                onChangeText={(v) => setField("title", v)}
                placeholder="Memory title"
                placeholderTextColor={theme.colorMuted.val}
                style={{
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  fontFamily: FontFamily.regular,
                  borderWidth: 0.5,
                  color: theme.color.val,
                  backgroundColor: theme.card.val,
                  borderColor: theme.borderColor.val,
                }}
              />
            </YStack>

            {/* Content */}
            <YStack gap={6}>
              <Text
                fontSize={11}
                fontFamily="$body"
                fontWeight="600"
                letterSpacing={0.8}
                marginLeft={4}
                textTransform="uppercase"
                color="$colorMuted"
              >
                CONTENT
              </Text>
              <TextInput
                value={form.content}
                onChangeText={(v) => setField("content", v)}
                placeholder="What happened?"
                placeholderTextColor={theme.colorMuted.val}
                multiline
                numberOfLines={5}
                style={{
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  fontFamily: FontFamily.regular,
                  borderWidth: 0.5,
                  minHeight: 100,
                  textAlignVertical: "top",
                  color: theme.color.val,
                  backgroundColor: theme.card.val,
                  borderColor: theme.borderColor.val,
                }}
              />
            </YStack>

            {/* Mood */}
            <PickerField
              label="MOOD"
              options={moodOptions}
              value={form.mood}
              onChange={(v) => setField("mood", v as Mood | null)}
              allowClear
              placeholder="None"
              stacked={stackPickers}
            />

            {/* People */}
            <TagInput
              label="PEOPLE"
              value={form.people}
              onChange={(v) => setField("people", v)}
              placeholder="Add person..."
            />

            {/* Locations */}
            <TagInput
              label="LOCATIONS"
              value={form.locations}
              onChange={(v) => setField("locations", v)}
              placeholder="Add location..."
            />

            <YStack gap={6}>
              <Text
                fontSize={11}
                fontFamily="$body"
                fontWeight="600"
                letterSpacing={0.8}
                marginLeft={4}
                textTransform="uppercase"
                color="$colorMuted"
              >
                TYPE
              </Text>
              <SegmentedControl
                options={ENTRY_KIND_OPTIONS}
                value={form.entryKind}
                onChange={(value) => {
                  const entryKind = value as "memory" | "reminder";
                  setField("entryKind", entryKind);
                  if (entryKind === "memory") {
                    setField("reminderDate", "");
                    setField("isRecurring", false);
                  }
                }}
              />
            </YStack>

            {form.entryKind === "reminder" ? (
              <>
                <YStack gap={6}>
              <Text
                fontSize={11}
                fontFamily="$body"
                fontWeight="600"
                letterSpacing={0.8}
                marginLeft={4}
                textTransform="uppercase"
                color="$colorMuted"
              >
                REMINDER
              </Text>
              {Platform.OS === "web" ? (
                <XStack
                  alignItems="center"
                  gap={8}
                  borderWidth={0.5}
                  borderRadius={12}
                  paddingHorizontal={12}
                  paddingVertical={10}
                  borderColor="$borderColor"
                  backgroundColor="$card"
                >
                  <Feather name="calendar" size={14} color={theme.colorMuted.val} />
                  <input
                    type="datetime-local"
                    value={form.reminderDate ? form.reminderDate.slice(0, 16) : ""}
                    onChange={(e: any) => setField("reminderDate", e.target.value ? new Date(e.target.value).toISOString() : "")}
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
                </XStack>
              ) : (
                <YStack gap={8}>
                  <Pressable
                    onPress={() => setShowPicker(!showPicker)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      borderWidth: 0.5,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderColor: theme.borderColor.val,
                      backgroundColor: theme.card.val,
                    }}
                  >
                    <Feather name="calendar" size={14} color={theme.colorMuted.val} />
                    <Text style={{ flex: 1, fontSize: 14, fontFamily: FontFamily.regular, color: form.reminderDate ? theme.color.val : theme.colorMuted.val }}>
                      {form.reminderDate ? dayjs(form.reminderDate).format("MMM D, YYYY - h:mm A") : "Select Date & Time"}
                    </Text>
                  </Pressable>

                  <Modal
                    visible={showPicker}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowPicker(false)}
                  >
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: "rgba(0,0,0,0.5)",
                        justifyContent: "center",
                        alignItems: "center",
                        padding: 20,
                      }}
                    >
                      <Pressable
                        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                        onPress={() => setShowPicker(false)}
                      />
                      <YStack
                        backgroundColor="$card"
                        borderRadius={16}
                        borderWidth={1}
                        borderColor="$borderColor"
                        padding={16}
                        width="100%"
                        maxWidth={400}
                        shadowColor="#000"
                        shadowOffset={{ width: 0, height: 4 }}
                        shadowOpacity={0.2}
                        shadowRadius={12}
                        elevation={10}
                      >
                        <XStack justifyContent="space-between" alignItems="center" marginBottom={16}>
                          <Text fontSize={16} fontFamily="$heading" fontWeight="600" color="$color">
                            Set Reminder
                          </Text>
                          <Pressable onPress={() => setShowPicker(false)} hitSlop={10}>
                            <Feather name="x" size={20} color={theme.colorMuted.val} />
                          </Pressable>
                        </XStack>

                        <DateTimePicker
                          mode="single"
                          timePicker={true}
                          date={form.reminderDate ? dayjs(form.reminderDate).toDate() : new Date()}
                          onChange={(params: any) => {
                            if (params.date) {
                              setField("reminderDate", dayjs(params.date).toISOString());
                            }
                          }}
                          styles={{
                            day_label: { color: theme.color.val, fontFamily: FontFamily.regular },
                            selected: { backgroundColor: theme.primary.val, borderRadius: 8 },
                            selected_label: { color: "#fff", fontFamily: FontFamily.bold },
                            month_selector_label: { color: theme.color.val, fontFamily: FontFamily.bold },
                            year_selector_label: { color: theme.color.val, fontFamily: FontFamily.bold },
                            time_selector_label: { color: theme.color.val, fontFamily: FontFamily.bold },
                            weekday_label: { color: theme.colorMuted.val, fontFamily: FontFamily.regular },
                            today_label: { color: theme.primary.val, fontFamily: FontFamily.bold },
                            button_prev: { backgroundColor: "transparent" },
                            button_next: { backgroundColor: "transparent" },
                          }}
                        />

                        <GradientButton
                          title="Done"
                          onPress={() => setShowPicker(false)}
                          style={{ marginTop: 16 }}
                        />
                      </YStack>
                    </View>
                  </Modal>
                </YStack>
              )}
                </YStack>

                {/* Recurring */}
                <XStack
                  alignItems="center"
                  gap={12}
                  borderWidth={0.5}
                  borderRadius={14}
                  padding={14}
                  borderColor="$borderColor"
                  backgroundColor="$card"
                >
                  <Feather name="refresh-cw" size={16} color={theme.colorMuted.val} />
                  <YStack flex={1}>
                    <Text fontSize={14} fontFamily="$body" fontWeight="600" color="$color">Recurring</Text>
                    <Text fontSize={12} fontFamily="$body" marginTop={1} color="$colorMuted">Repeat this reminder</Text>
                  </YStack>
                  <Switch
                    value={form.isRecurring}
                    onValueChange={(v) => setField("isRecurring", v)}
                    trackColor={{ true: theme.primary.val, false: theme.borderColor.val }}
                    thumbColor="#FFFFFF"
                  />
                </XStack>
              </>
            ) : null}

            {/* AI Topics (readonly) */}
            {resolvedTopics.length > 0 && (
              <YStack
                borderWidth={0.5}
                borderRadius={14}
                padding={14}
                gap={8}
                borderColor="$borderColor"
                backgroundColor="$card"
              >
                <XStack alignItems="center" gap={6} marginBottom={2}>
                  <Feather name="tag" size={13} color={theme.colorMuted.val} />
                  <Text
                    fontSize={11}
                    fontFamily="$body"
                    fontWeight="600"
                    letterSpacing={0.8}
                    textTransform="uppercase"
                    color="$colorMuted"
                  >
                    AI Topics
                  </Text>
                </XStack>
                <XStack flexWrap="wrap" gap={6}>
                  {resolvedTopics.map((topic, i) => (
                    <XStack
                      key={i}
                      alignItems="center"
                      gap={5}
                      paddingHorizontal={10}
                      paddingVertical={5}
                      borderRadius={20}
                      backgroundColor={(topic.color ?? theme.primary.val) + "18"}
                      borderWidth={0.5}
                      borderColor={(topic.color ?? theme.primary.val) + "40"}
                    >
                      <YStack
                        width={7}
                        height={7}
                        borderRadius={4}
                        backgroundColor={topic.color ?? theme.primary.val}
                      />
                      <Text
                        fontSize={12}
                        fontFamily="$body"
                        fontWeight="500"
                        color={topic.color ?? theme.primary.val}
                      >
                        {topic.name}
                      </Text>
                    </XStack>
                  ))}
                </XStack>
                <Text fontSize={11} fontFamily="$body" color="$colorMuted">
                  Assigned automatically by AI. Manage via the chat.
                </Text>
              </YStack>
            )}

            {/* AI Insights */}
            {memory?.contextTags && (
              <YStack
                borderWidth={0.5}
                borderRadius={14}
                padding={14}
                gap={6}
                borderColor="$borderColor"
                backgroundColor="$card"
              >
                <XStack alignItems="center" gap={6} marginBottom={2}>
                  <Text fontSize={14}>✨</Text>
                  <Text
                    fontSize={11}
                    fontFamily="$body"
                    fontWeight="600"
                    letterSpacing={0.8}
                    textTransform="uppercase"
                    color="$colorMuted"
                  >
                    AI INSIGHTS
                  </Text>
                </XStack>
                {memory.contextTags.what ? (
                  <Text fontSize={13} fontFamily="$body" lineHeight={18} color="$colorMuted">
                    {memory.contextTags.what}
                  </Text>
                ) : null}
                {memory.contextTags.why ? (
                  <Text fontSize={13} fontFamily="$body" lineHeight={18} color="$colorMuted">
                    Why: {memory.contextTags.why}
                  </Text>
                ) : null}
              </YStack>
            )}

            {/* Attachments */}
            <PressableScale>
              <XStack
                alignItems="center"
                gap={10}
                borderWidth={0.5}
                borderRadius={14}
                padding={14}
                borderColor="$borderColor"
                backgroundColor="$card"
                borderStyle="dashed"
              >
                <Feather name="upload" size={18} color={theme.colorMuted.val} />
                <Text fontSize={14} fontFamily="$body" color="$color">
                  Attach files (warranties, receipts, docs)
                </Text>
              </XStack>
            </PressableScale>

            {/* Save */}
            <GradientButton title="Save Changes" onPress={handleSave} icon="save" />

            {/* Read Aloud + Delete */}
            <XStack justifyContent="center" gap={24} paddingTop={4}>
              <Pressable onPress={handleReadAloud} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 4 }}>
                <Feather name="volume-2" size={14} color={theme.colorMuted.val} />
                <Text fontSize={13} fontFamily="$body" color="$colorMuted">Read Aloud</Text>
              </Pressable>
              <Pressable onPress={handleDelete} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 4 }}>
                <Feather name="trash-2" size={14} color={theme.destructive.val} />
                <Text fontSize={13} fontFamily="$body" color="$destructive">Delete</Text>
              </Pressable>
            </XStack>

            {/* Tips */}
            <TipsCard />
          </>
        ) : (
          /* Voice Mode */
          <>
            {voiceLoading ? (
              <YStack alignItems="center" justifyContent="center" gap={16} paddingVertical={60}>
                <ActivityIndicator size="large" color={theme.primary.val} />
                <Text fontSize={15} fontFamily="$body" color="$colorMuted">
                  Processing your edit...
                </Text>
              </YStack>
            ) : (
              <YStack alignItems="center" gap={12} paddingTop={28} paddingHorizontal={4}>
                <VoiceRecorder
                  onTranscription={() => {}}
                  onTranscriptionComplete={handleVoiceTranscription}
                />
                <Text fontSize={16} fontFamily="$body" fontWeight="600" color="$color">
                  Tap to describe your edit
                </Text>
                <Text fontSize={13} fontFamily="$body" textAlign="center" color="$colorMuted">
                  e.g. "Change the title" or "Add a reminder"
                </Text>
              </YStack>
            )}
            <TipsCard />
          </>
        )}
      </KeyboardAwareScrollViewCompat>
    </BaseSheet>
  );
}

function TipsCard() {
  const theme = useAppTheme();
  const tips = [
    "Use voice mode to describe changes naturally",
    "Topics are assigned automatically by AI",
    "Set a mood to track how you felt",
  ];
  return (
    <YStack
      borderWidth={0.5}
      borderRadius={14}
      padding={16}
      gap={10}
      borderColor="$borderColor"
      backgroundColor="$card"
    >
      <XStack alignItems="center" gap={6}>
        <Text fontSize={16}>💡</Text>
        <Text fontSize={13} fontFamily="$body" fontWeight="600" color="$color">Tips</Text>
      </XStack>
      {tips.map((tip) => (
        <XStack key={tip} alignItems="flex-start" gap={6}>
          <Text fontSize={12} marginTop={1} color="$colorMuted">•</Text>
          <Text flex={1} fontSize={12} fontFamily="$body" lineHeight={17} color="$colorMuted">{tip}</Text>
        </XStack>
      ))}
    </YStack>
  );
}
