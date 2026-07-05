import React from "react";

import { withAlpha } from "@/components/ui/themeHelpers";
import { useAppTheme } from "@/hooks/useAppTheme";

export function useSemanticColors() {
  const theme = useAppTheme();

  return React.useMemo(() => {
    const status = {
      success: theme.success.val,
      successStrong: theme.textSuccess.val,
      warning: theme.warning.val,
      warningStrong: theme.textWarning.val,
      error: theme.destructive.val,
      errorStrong: theme.textError.val,
      info: theme.info.val,
      neutral: theme.colorMuted.val,
    } as const;

    const integration = {
      googleDrive: theme.info.val,
      reasoning: theme.primaryHover.val,
      openai: theme.primary.val,
      mlkit: theme.success.val,
      pdfExtract: theme.colorMuted.val,
    } as const;

    const stat = {
      memories: theme.info.val,
      reminders: theme.warning.val,
      categories: theme.success.val,
      topics: theme.primaryHover.val,
      words: theme.success.val,
      diary: theme.primary.val,
    } as const;

    const reviewQuality = {
      again: theme.destructive.val,
      hard: theme.warning.val,
      good: theme.info.val,
      easy: theme.success.val,
    } as const;

    const mood = {
      happy: theme.warning.val,
      sad: theme.info.val,
      anxious: theme.destructive.val,
      excited: theme.primaryHover.val,
      neutral: theme.colorMuted.val,
      grateful: theme.success.val,
      frustrated: theme.destructive.val,
      hopeful: theme.primary.val,
      nostalgic: theme.primaryHover.val,
      motivated: theme.success.val,
    } as const;

    const navigation = {
      timeline: theme.primary.val,
      reminders: theme.warning.val,
      documents: theme.info.val,
      knowledgeGraph: theme.success.val,
      statistics: theme.primaryHover.val,
      settings: theme.primary.val,
      data: theme.warning.val,
      profile: theme.primaryHover.val,
      admin: theme.destructive.val,
    } as const;

    const documentStatus = {
      pending: theme.warning.val,
      processing: theme.info.val,
      completed: theme.success.val,
      failed: theme.destructive.val,
    } as const;

    return {
      status,
      integration,
      stat,
      reviewQuality,
      mood,
      navigation,
      documentStatus,
      soft: {
        success: withAlpha(theme.success.val, "18"),
        warning: withAlpha(theme.warning.val, "18"),
        error: withAlpha(theme.destructive.val, "18"),
        info: withAlpha(theme.info.val, "18"),
        primary: withAlpha(theme.primary.val, "18"),
        neutral: withAlpha(theme.colorMuted.val, "18"),
      },
    };
  }, [
    theme.colorMuted.val,
    theme.destructive.val,
    theme.info.val,
    theme.primary.val,
    theme.primaryHover.val,
    theme.success.val,
    theme.textError.val,
    theme.textSuccess.val,
    theme.textWarning.val,
    theme.warning.val,
  ]);
}
