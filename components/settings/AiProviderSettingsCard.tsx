import React from "react";
import { StyleSheet, Switch, TextInput } from "react-native";
import { useAction, useMutation, useQuery } from "convex/react";
import { Text, XStack, YStack } from "tamagui";

import { api } from "@/convex/_generated/api";
import { AppButton } from "@/components/ui/AppButton";
import { SectionCard } from "@/components/ui/AppScreen";
import { Badge } from "@/components/ui/Badge";
import { PressableScale } from "@/components/ui/PressableScale";
import { useAppConfirm } from "@/components/ui/confirm/AppConfirmProvider";
import { useAppToast } from "@/components/ui/toast";
import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppTheme } from "@/hooks/useAppTheme";
import { useAuth } from "@/hooks/useAuth";
import { Feather } from "@/lib/icons";

type Provider = "openai" | "google";

export function AiProviderSettingsCard() {
  const theme = useAppTheme();
  const { token } = useAuth();
  const { confirm } = useAppConfirm();
  const { showToast } = useAppToast();
  const settings = useQuery(api.aiProviders.getSettings, token ? {} : "skip");
  const setPreference = useMutation(api.aiProviders.setByokPreference);
  const deleteProviderKey = useMutation(api.aiProviders.deleteProviderKey);
  const upsertProviderKey = useAction(api.actions.aiProviderKeys.upsertProviderKey);

  const [provider, setProvider] = React.useState<Provider>("openai");
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [models, setModels] = React.useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = React.useState(false);
  const [isUpdatingRouting, setIsUpdatingRouting] = React.useState(false);

  const providerConfig = settings?.providers?.find((item: any) => item.provider === provider);
  const byokEnabled = settings?.preference?.byokEnabled ?? false;
  const embeddingRebuildActive = Boolean(
    settings?.preference?.embeddingRebuildStatus &&
    settings.preference.embeddingRebuildStatus !== "idle" &&
    settings.preference.embeddingRebuildStatus !== "failed",
  );

  React.useEffect(() => {
    const preferred = settings?.preference?.preferredProvider;
    if (preferred) setProvider(preferred);
  }, [settings?.preference?.preferredProvider]);

  React.useEffect(() => {
    setBaseUrl(providerConfig?.baseUrl ?? "");
    setModels({
      ...(providerConfig?.defaultModels ?? {}),
      ...(providerConfig?.savedModels ?? {}),
    });
  }, [providerConfig]);

  const updateRouting = async (enabled: boolean) => {
    setIsUpdatingRouting(true);
    try {
      await setPreference({
        preferredProvider: provider,
        byokEnabled: enabled,
        providerModels: { [provider]: models },
      });
      showToast({
        title: enabled ? "Personal provider enabled" : "Memora routing enabled",
        message: enabled
          ? "Supported AI requests will use your selected provider and models."
          : "AI requests will use Memora's provider routing.",
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "Routing update failed",
        message: error instanceof Error ? error.message : "Unable to update AI routing.",
        tone: "error",
      });
    } finally {
      setIsUpdatingRouting(false);
    }
  };

  const saveKey = async () => {
    if (!apiKey.trim() && !providerConfig?.configured) {
      showToast({
        title: "API key required",
        message: "Paste a provider API key before saving.",
        tone: "error",
      });
      return;
    }
    setIsSaving(true);
    try {
      if (apiKey.trim()) {
        await upsertProviderKey({
          provider,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim() || undefined,
          validate: true,
        });
      }
      await setPreference({
        preferredProvider: provider,
        byokEnabled,
        providerModels: { [provider]: models },
      });
      setApiKey("");
      showToast({
        title: "Provider settings saved",
        message: apiKey.trim()
          ? "The key was validated, encrypted, and stored."
          : "Your provider and model selections were updated.",
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "Provider save failed",
        message: error instanceof Error ? error.message : "Unable to save the provider key.",
        tone: "error",
        closeMode: "manual",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const removeKey = async () => {
    const accepted = await confirm({
      title: "Delete provider key",
      message: `Remove your ${provider === "openai" ? "OpenAI" : "Google"} key from Memora?`,
      confirmLabel: "Delete key",
      tone: "destructive",
      icon: "trash-2",
    });
    if (!accepted) return;
    try {
      await deleteProviderKey({ provider });
      setApiKey("");
      showToast({ title: "Provider key removed", tone: "success" });
    } catch (error) {
      showToast({
        title: "Key removal failed",
        message: error instanceof Error ? error.message : "Unable to remove the provider key.",
        tone: "error",
      });
    }
  };

  return (
    <SectionCard title="AI providers" eyebrow="Privacy & AI" emphasis="quiet">
      <XStack alignItems="center" gap={12} paddingVertical={4}>
        <YStack
          width={36}
          height={36}
          borderRadius={11}
          alignItems="center"
          justifyContent="center"
          backgroundColor={withAlpha(theme.primary.val, "12")}
        >
          <Feather name="key" size={15} color={theme.primary.val} />
        </YStack>
        <YStack flex={1} gap={2}>
          <Text fontSize={13} fontWeight="700" color={theme.color.val}>
            Use your own provider
          </Text>
          <Text fontSize={11} lineHeight={16} color={theme.colorMuted.val}>
            Route supported AI work through your encrypted provider credentials.
          </Text>
        </YStack>
        <Switch
          value={byokEnabled}
          onValueChange={(value) => void updateRouting(value)}
          disabled={isUpdatingRouting || embeddingRebuildActive}
          trackColor={{ true: theme.primary.val, false: theme.borderColor.val }}
          thumbColor={theme.textInverse.val}
        />
      </XStack>

      {embeddingRebuildActive ? (
        <Text fontSize={11} lineHeight={17} color={theme.colorMuted.val}>
          Rebuilding embeddings: {settings?.preference?.embeddingRebuildProcessed ?? 0} /{" "}
          {settings?.preference?.embeddingRebuildTotal || "?"}. Provider changes are temporarily
          locked.
        </Text>
      ) : null}

      <XStack gap={8} flexWrap="wrap" paddingTop={4}>
        {(["openai", "google"] as Provider[]).map((item) => {
          const active = provider === item;
          const configured = settings?.providers?.some(
            (entry: any) => entry.provider === item && entry.configured,
          );
          return (
            <PressableScale
              key={item}
              onPress={() => setProvider(item)}
              style={[
                styles.providerChip,
                {
                  borderColor: active ? theme.primary.val : theme.borderColor.val,
                  backgroundColor: active
                    ? withAlpha(theme.primary.val, "12")
                    : theme.backgroundStrong.val,
                },
              ]}
            >
              <Text
                fontSize={12}
                fontWeight="700"
                color={active ? theme.primary.val : theme.color.val}
              >
                {item === "openai" ? "OpenAI" : "Google"}
              </Text>
              {configured ? (
                <YStack width={6} height={6} borderRadius={3} backgroundColor={theme.primary.val} />
              ) : null}
            </PressableScale>
          );
        })}
      </XStack>

      <YStack gap={6} paddingTop={4}>
        <Text
          fontSize={11}
          fontWeight="700"
          letterSpacing={0.8}
          textTransform="uppercase"
          color={theme.colorMuted.val}
        >
          API key
        </Text>
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          placeholder={`Paste your ${provider === "openai" ? "OpenAI" : "Google"} API key`}
          placeholderTextColor={theme.colorMuted.val}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={[
            styles.input,
            {
              backgroundColor: theme.secondary.val,
              borderColor: theme.borderColor.val,
              color: theme.color.val,
            },
          ]}
        />
      </YStack>

      {provider === "openai" ? (
        <YStack gap={6}>
          <Text
            fontSize={11}
            fontWeight="700"
            letterSpacing={0.8}
            textTransform="uppercase"
            color={theme.colorMuted.val}
          >
            Base URL
          </Text>
          <TextInput
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="Optional OpenAI-compatible base URL"
            placeholderTextColor={theme.colorMuted.val}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              {
                backgroundColor: theme.secondary.val,
                borderColor: theme.borderColor.val,
                color: theme.color.val,
              },
            ]}
          />
        </YStack>
      ) : null}

      <YStack gap={10} paddingTop={4}>
        <Text
          fontSize={11}
          fontWeight="700"
          letterSpacing={0.8}
          textTransform="uppercase"
          color={theme.colorMuted.val}
        >
          Models
        </Text>
        {(providerConfig?.supportedCapabilities ?? []).map((capability: string) => {
          const availableModels = (providerConfig?.availableModels ?? []).filter((model: any) =>
            model.capabilities.includes(capability),
          );
          return (
            <YStack key={capability} gap={6}>
              <Text fontSize={12} fontWeight="600" color={theme.color.val}>
                {formatCapabilityLabel(capability)}
              </Text>
              <XStack gap={6} flexWrap="wrap">
                {availableModels.map((model: any) => {
                  const selected = models[capability] === model.id;
                  const locked = capability === "embeddings" && embeddingRebuildActive;
                  return (
                    <PressableScale
                      key={`${capability}-${model.id}`}
                      onPress={
                        locked
                          ? undefined
                          : () => setModels((current) => ({ ...current, [capability]: model.id }))
                      }
                      style={[
                        styles.modelChip,
                        {
                          borderColor: selected ? theme.primary.val : theme.borderColor.val,
                          backgroundColor: selected
                            ? withAlpha(theme.primary.val, "12")
                            : theme.backgroundStrong.val,
                          opacity: locked ? 0.55 : 1,
                        },
                      ]}
                    >
                      <Text
                        fontSize={11}
                        fontWeight="600"
                        color={selected ? theme.primary.val : theme.color.val}
                      >
                        {model.label ?? model.id}
                      </Text>
                    </PressableScale>
                  );
                })}
              </XStack>
            </YStack>
          );
        })}
      </YStack>

      <XStack gap={8} flexWrap="wrap" alignItems="center">
        <AppButton
          title={isSaving ? "Saving…" : "Save provider settings"}
          icon="key"
          onPress={() => void saveKey()}
          loading={isSaving}
          style={{ flexGrow: 1 }}
        />
        <AppButton
          title="Delete key"
          icon="trash-2"
          variant="secondary"
          tone="error"
          disabled={!providerConfig?.configured}
          onPress={() => void removeKey()}
        />
      </XStack>

      <XStack alignItems="center" justifyContent="space-between" gap={12} paddingTop={2}>
        <YStack flex={1} gap={2}>
          <Text fontSize={12} fontWeight="700" color={theme.color.val}>
            {provider === "openai" ? "OpenAI" : "Google"} status
          </Text>
          <Text fontSize={11} lineHeight={16} color={theme.colorMuted.val}>
            {providerConfig?.lastValidationMessage ??
              "Keys are encrypted server-side and only used for your AI requests."}
          </Text>
        </YStack>
        <Badge
          label={
            providerConfig?.configured ? `••••${providerConfig.maskedKeySuffix ?? ""}` : "No key"
          }
          color={providerConfig?.configured ? theme.primary.val : theme.borderColor.val}
          small
        />
      </XStack>
    </SectionCard>
  );
}

function formatCapabilityLabel(capability: string) {
  return capability
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const styles = StyleSheet.create({
  providerChip: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  modelChip: {
    minHeight: 36,
    paddingHorizontal: 10,
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
  },
});
