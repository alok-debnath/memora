import React, { useMemo, useState } from "react";
import { ScrollView, Platform, Alert, Pressable } from "react-native";
import { XStack, YStack, Text } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { GradientButton } from "@/components/ui/GradientButton";
import { PressableScale } from "@/components/ui/PressableScale";
import { SearchBar } from "@/components/ui/SearchBar";

const statusColors: Record<string, string> = {
  pending: "#F59E0B",
  processing: "#3B82F6",
  completed: "#10B981",
  failed: "#EF4444",
};

type DocumentItem = {
  _id: Id<"documentExtractions">;
  _creationTime: number;
  filename: string;
  summary?: string;
  status: string;
  documentType?: string;
  expiryDate?: string;
  keyDetails?: Record<string, string>;
  memoryCount?: number;
  generatedMemoryIds: string[];
};

export default function DocumentsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "processing" | "completed" | "failed">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  const documents = (useQuery(api.documents.list, token ? { token } : "skip") ?? []) as DocumentItem[];
  const createDoc = useMutation(api.documents.create);
  const removeDoc = useMutation(api.documents.remove);

  const documentTypes = useMemo(() => Array.from(new Set(documents.map((doc) => doc.documentType || "other"))).sort(), [documents]);

  const fullyFilteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return documents
      .filter((doc) => statusFilter === "all" || doc.status === statusFilter)
      .filter((doc) => typeFilter === "all" || (doc.documentType || "other") === typeFilter)
      .filter((doc) => {
        if (!normalized) return true;
        const haystack = [
          doc.filename,
          doc.summary,
          doc.documentType,
          ...(doc.keyDetails ? Object.values(doc.keyDetails) : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      });
  }, [documents, query, statusFilter, typeFilter]);

  const summary = useMemo(
    () => ({
      total: documents.length,
      processed: documents.filter((doc) => doc.status === "completed").length,
      memories: documents.reduce((sum, doc) => sum + doc.generatedMemoryIds.length, 0),
    }),
    [documents]
  );

  const handleUpload = async () => {
    if (!token) return;
    setIsUploading(true);
    try {
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "application/pdf", "text/csv", "text/markdown"],
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        let text = "";

        try {
          if (Platform.OS === "web") {
            const response = await fetch(asset.uri);
            text = await response.text();
          } else {
            const FileSystem = await import("expo-file-system");
            text = (await FileSystem.readAsStringAsync(asset.uri)) || "";
          }
        } catch {
          text = `[Document: ${asset.name}]`;
        }

        if (text.length > 0) {
          await createDoc({
            token,
            filename: asset.name || "Untitled Document",
            extractedText: text.slice(0, 10000),
          });
        }
      }
    } catch {
      if (Platform.OS === "web") {
        alert("Failed to upload document. Please try again.");
      } else {
        Alert.alert("Error", "Failed to upload document. Please try again.");
      }
    }
    setIsUploading(false);
  };

  const handleDelete = (docId: Id<"documentExtractions">) => {
    if (!token) return;
    const doDelete = () => removeDoc({ token, documentId: docId });
    if (Platform.OS === "web") {
      if (confirm("Delete this document?")) doDelete();
    } else {
      Alert.alert("Delete Document", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const statusFilters = [
    { key: "all", label: "All" },
    { key: "processing", label: "Processing" },
    { key: "completed", label: "Completed" },
    { key: "failed", label: "Failed" },
  ] as const;

  return (
    <YStack flex={1} backgroundColor="$background">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: insets.top + webTopPadding + 12,
          paddingBottom: 28,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(400)}>
          <Card style={{ padding: 18, borderRadius: 24, backgroundColor: theme.card.val, marginBottom: 14 }}>
            <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
              <YStack flex={1} gap={6}>
                <Badge label="Vault" color={theme.primary.val} />
                <Text fontSize={28} lineHeight={32} fontFamily="$heading" fontWeight="700" color="$color">
                  Documents
                </Text>
                <Text fontSize={14} lineHeight={20} fontFamily="$body" color="$colorMuted">
                  Upload files, extract structured details, and keep track of what turned into memories.
                </Text>
              </YStack>
              <PressableScale onPress={() => router.back()} hitSlop={8}>
                <YStack
                  width={42}
                  height={42}
                  borderRadius={14}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={theme.secondary.val}
                  borderWidth={1}
                  borderColor={theme.borderColor.val}
                >
                  <Feather name="arrow-left" size={20} color={theme.color.val} />
                </YStack>
              </PressableScale>
            </XStack>
            <XStack gap={10} marginTop={16}>
              <Card style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 }}>
                <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
                  {summary.total}
                </Text>
                <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">
                  vault items
                </Text>
              </Card>
              <Card style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 }}>
                <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
                  {summary.processed}
                </Text>
                <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">
                  processed
                </Text>
              </Card>
              <Card style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 18 }}>
                <Text fontSize={22} fontFamily="$heading" fontWeight="700" color="$color">
                  {summary.memories}
                </Text>
                <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">
                  memories
                </Text>
              </Card>
            </XStack>
          </Card>
        </Animated.View>

        <GradientButton
          title="Upload document"
          onPress={handleUpload}
          icon="upload"
          loading={isUploading}
          style={{ marginBottom: 14 }}
        />

        <SearchBar value={query} onChangeText={setQuery} placeholder="Search documents..." />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 12 }}>
          {statusFilters.map((filter) => {
            const active = statusFilter === filter.key;
            return (
              <PressableScale
                key={filter.key}
                onPress={() => setStatusFilter(filter.key)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? theme.primary.val : theme.borderColor.val,
                  backgroundColor: active ? theme.primary.val + "18" : theme.card.val,
                }}
              >
                <Text fontSize={13} fontFamily="$body" color={active ? "$primary" : "$colorMuted"}>
                  {filter.label}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
          {["all", ...documentTypes].map((type) => {
            const active = typeFilter === type;
            return (
              <PressableScale
                key={type}
                onPress={() => setTypeFilter(type)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? theme.primary.val : theme.borderColor.val,
                  backgroundColor: active ? theme.primary.val + "18" : theme.card.val,
                }}
              >
                <Text fontSize={13} fontFamily="$body" color={active ? "$primary" : "$colorMuted"}>
                  {type === "all" ? "All types" : type}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        <YStack gap={12}>
          {fullyFilteredDocuments.length === 0 ? (
            <EmptyState
              icon="filter"
              title="No matching documents"
              description="Try another filter or upload a new document."
            />
          ) : (
            fullyFilteredDocuments.map((doc, index) => (
              <Animated.View key={doc._id} entering={FadeInUp.delay(index * 50).duration(300)}>
                <Card style={{ borderRadius: 22, borderColor: theme.borderColor.val }}>
                  <XStack alignItems="center" justifyContent="space-between" gap={12}>
                    <XStack alignItems="center" gap={8} flex={1}>
                      <Feather name="file-text" size={18} color={theme.primary.val} />
                      <Text fontSize={15} fontFamily="$heading" fontWeight="600" flex={1} color="$color" numberOfLines={1}>
                        {doc.filename}
                      </Text>
                    </XStack>
                    <XStack alignItems="center" gap={10}>
                      <Badge label={doc.status} color={statusColors[doc.status] || theme.colorMuted.val} />
                      <Pressable onPress={() => handleDelete(doc._id)}>
                        <Feather name="trash-2" size={16} color={theme.colorMuted.val} />
                      </Pressable>
                    </XStack>
                  </XStack>

                  <XStack flexWrap="wrap" gap={8} marginTop={10}>
                    <Badge label={doc.documentType || "other"} color={theme.primary.val} small />
                    {doc.expiryDate ? (
                      <Badge
                        label={`Expires ${new Date(doc.expiryDate).toLocaleDateString()}`}
                        color={new Date(doc.expiryDate).getTime() < Date.now() ? theme.destructive.val : "#F59E0B"}
                        small
                      />
                    ) : null}
                  </XStack>

                  {doc.summary && (
                    <Text fontSize={13} fontFamily="$body" marginTop={8} lineHeight={18} color="$colorMuted" numberOfLines={3}>
                      {doc.summary}
                    </Text>
                  )}

                  {doc.keyDetails && Object.keys(doc.keyDetails).length > 0 ? (
                    <XStack flexWrap="wrap" gap={8} marginTop={10}>
                      {Object.entries(doc.keyDetails)
                        .slice(0, 3)
                        .map(([key, value]) => (
                          <YStack
                            key={key}
                            borderWidth={1}
                            borderRadius={14}
                            paddingHorizontal={10}
                            paddingVertical={8}
                            minWidth="40%"
                            backgroundColor="$secondary"
                            borderColor="$borderColor"
                          >
                            <Text
                              fontSize={10}
                              fontFamily="$body"
                              fontWeight="700"
                              textTransform="uppercase"
                              letterSpacing={0.5}
                              color="$colorMuted"
                            >
                              {key.replace(/_/g, " ")}
                            </Text>
                            <Text fontSize={12} fontFamily="$body" fontWeight="500" marginTop={4} color="$color" numberOfLines={1}>
                              {value}
                            </Text>
                          </YStack>
                        ))}
                    </XStack>
                  ) : null}

                  <Text fontSize={12} fontFamily="$body" marginTop={6} color="$colorMuted">
                    {formatDate(doc._creationTime)}
                  </Text>

                  {doc.generatedMemoryIds.length > 0 && (
                    <Text fontSize={12} fontFamily="$body" fontWeight="600" marginTop={4} color="$primary">
                      {doc.memoryCount ?? doc.generatedMemoryIds.length} memories generated
                    </Text>
                  )}
                </Card>
              </Animated.View>
            ))
          )}
        </YStack>
      </ScrollView>
    </YStack>
  );
}
