import React, { useState } from "react";
import { ScrollView, Platform, Alert, Pressable, StyleSheet } from "react-native";
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
  const filteredDocuments =
    statusFilter === "all"
      ? documents
      : documents.filter((doc) => doc.status === statusFilter);
  const fullyFilteredDocuments = filteredDocuments.filter((doc) => {
    const matchesType = typeFilter === "all" || (doc.documentType || "other") === typeFilter;
    const haystack = [
      doc.filename,
      doc.summary,
      doc.documentType,
      ...(doc.keyDetails ? Object.values(doc.keyDetails) : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    return matchesType && matchesQuery;
  });
  const documentTypes = Array.from(
    new Set(documents.map((doc) => doc.documentType || "other"))
  ).sort();

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
    const doDelete = () => {
      removeDoc({ token, documentId: docId });
    };
    if (Platform.OS === "web") {
      if (confirm("Delete this document?")) doDelete();
    } else {
      Alert.alert("Delete Document", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  };

  return (
    <YStack flex={1} backgroundColor="$background">
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={16}
        paddingBottom={12}
        paddingTop={insets.top + webTopPadding + 12}
      >
        <PressableScale onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={theme.color.val} />
        </PressableScale>
        <Text fontSize={18} fontFamily="$heading" fontWeight="600" color="$color">Documents</Text>
        <YStack width={22} />
      </XStack>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.summaryCard}>
          <YStack flex={1} alignItems="center">
            <Text fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">{documents.length}</Text>
            <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">Vault Items</Text>
          </YStack>
          <YStack width={1} height={34} backgroundColor="$borderColor" />
          <YStack flex={1} alignItems="center">
            <Text fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">
              {documents.filter((doc) => doc.status === "completed").length}
            </Text>
            <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">Processed</Text>
          </YStack>
          <YStack width={1} height={34} backgroundColor="$borderColor" />
          <YStack flex={1} alignItems="center">
            <Text fontSize={24} fontFamily="$heading" fontWeight="700" color="$color">
              {documents.reduce((sum, doc) => sum + doc.generatedMemoryIds.length, 0)}
            </Text>
            <Text fontSize={11} fontFamily="$body" marginTop={4} color="$colorMuted">Memories Created</Text>
          </YStack>
        </Card>

        {documents.length === 0 ? (
          <>
            <EmptyState
              icon="file-text"
              title="No documents yet"
              description="Upload documents to extract and organize important information with AI"
            />
            <GradientButton
              title="Upload Document"
              onPress={handleUpload}
              icon="upload"
              loading={isUploading}
              style={{ marginTop: 16, marginHorizontal: 40 }}
            />
          </>
        ) : (
          <>
            <GradientButton
              title="Upload Document"
              onPress={handleUpload}
              icon="upload"
              loading={isUploading}
              style={{ marginBottom: 16 }}
            />
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Search documents..."
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {[
                { key: "all", label: "All" },
                { key: "processing", label: "Processing" },
                { key: "completed", label: "Completed" },
                { key: "failed", label: "Failed" },
              ].map((filter) => (
                <PressableScale
                  key={filter.key}
                  onPress={() => setStatusFilter(filter.key as typeof statusFilter)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        statusFilter === filter.key ? theme.primary.val + "18" : theme.card.val,
                      borderColor:
                        statusFilter === filter.key ? theme.primary.val : theme.borderColor.val,
                    },
                  ]}
                >
                  <Text
                    fontSize={13}
                    fontFamily="$body"
                    style={{
                      color:
                        statusFilter === filter.key ? theme.primary.val : theme.colorMuted.val,
                    }}
                  >
                    {filter.label}
                  </Text>
                </PressableScale>
              ))}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {["all", ...documentTypes].map((type) => (
                <PressableScale
                  key={type}
                  onPress={() => setTypeFilter(type)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        typeFilter === type ? theme.primary.val + "18" : theme.card.val,
                      borderColor:
                        typeFilter === type ? theme.primary.val : theme.borderColor.val,
                    },
                  ]}
                >
                  <Text
                    fontSize={13}
                    fontFamily="$body"
                    style={{
                      color: typeFilter === type ? theme.primary.val : theme.colorMuted.val,
                    }}
                  >
                    {type === "all" ? "All Types" : type}
                  </Text>
                </PressableScale>
              ))}
            </ScrollView>
            {fullyFilteredDocuments.map((doc, index) => (
              <Animated.View key={doc._id} entering={FadeInUp.delay(index * 50).duration(300)}>
                <Card style={{ ...styles.docCard, borderColor: theme.borderColor.val }}>
                  <XStack alignItems="center" justifyContent="space-between">
                    <XStack alignItems="center" gap={8} flex={1}>
                      <Feather name="file-text" size={18} color={theme.primary.val} />
                      <Text
                        fontSize={15}
                        fontFamily="$body"
                        fontWeight="500"
                        flex={1}
                        color="$color"
                        numberOfLines={1}
                      >
                        {doc.filename}
                      </Text>
                    </XStack>
                    <XStack alignItems="center" gap={10}>
                      <Badge
                        label={doc.status}
                        color={statusColors[doc.status] || theme.colorMuted.val}
                      />
                      <Pressable onPress={() => handleDelete(doc._id)}>
                        <Feather name="trash-2" size={16} color={theme.colorMuted.val} />
                      </Pressable>
                    </XStack>
                  </XStack>
                  <XStack flexWrap="wrap" gap={8} marginTop={10}>
                    <Badge
                      label={doc.documentType || "other"}
                      color={theme.primary.val}
                      small
                    />
                    {doc.expiryDate ? (
                      <Badge
                        label={`Expires ${new Date(doc.expiryDate).toLocaleDateString()}`}
                        color={
                          new Date(doc.expiryDate).getTime() < Date.now()
                            ? theme.destructive.val
                            : "#F59E0B"
                        }
                        small
                      />
                    ) : null}
                  </XStack>
                  {doc.summary && (
                    <Text
                      fontSize={13}
                      fontFamily="$body"
                      marginTop={8}
                      lineHeight={18}
                      color="$colorMuted"
                      numberOfLines={2}
                    >
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
                              fontFamily="$heading"
                              fontWeight="600"
                              textTransform="uppercase"
                              letterSpacing={0.5}
                              color="$colorMuted"
                            >
                              {key.replace(/_/g, " ")}
                            </Text>
                            <Text
                              fontSize={12}
                              fontFamily="$body"
                              fontWeight="500"
                              marginTop={4}
                              color="$color"
                              numberOfLines={1}
                            >
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
                    <Text fontSize={12} fontFamily="$body" fontWeight="500" marginTop={4} color="$primary">
                      {doc.memoryCount ?? doc.generatedMemoryIds.length} memories generated
                    </Text>
                  )}
                </Card>
              </Animated.View>
            ))}
            {fullyFilteredDocuments.length === 0 && (
              <EmptyState
                icon="filter"
                title="No matching documents"
                description="Try another filter or upload a new document."
              />
            )}
          </>
        )}
        <YStack height={40} />
      </ScrollView>
    </YStack>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  filterRow: {
    gap: 10,
    paddingBottom: 16,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  docCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
});
