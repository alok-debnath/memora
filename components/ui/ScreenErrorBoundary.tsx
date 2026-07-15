import React from "react";
import { YStack, Text } from "tamagui";

import { Feather } from "@/lib/icons";
import { AppButton } from "@/components/ui/AppButton";
import { useAppTheme } from "@/hooks/useAppTheme";

function ScreenErrorFallback({ label, onRetry }: { label?: string; onRetry: () => void }) {
  const theme = useAppTheme();
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" padding={24} gap={12}>
      <YStack
        width={48}
        height={48}
        borderRadius={24}
        alignItems="center"
        justifyContent="center"
        backgroundColor={theme.destructive.val + "14"}
      >
        <Feather name="alert-triangle" size={20} color={theme.destructive.val} />
      </YStack>
      <Text fontSize={16} fontFamily="$heading" fontWeight="700" color={theme.color.val}>
        {label ? `${label} hit a snag` : "Something went wrong"}
      </Text>
      <Text fontSize={13} fontFamily="$body" color={theme.colorMuted.val} textAlign="center">
        The rest of the app is fine — retry this screen.
      </Text>
      <AppButton title="Try again" icon="refresh-cw" size="sm" onPress={onRetry} />
    </YStack>
  );
}

type Props = {
  children: React.ReactNode;
  /** Screen name shown in the fallback + dev logs. */
  label?: string;
};

type State = { hasError: boolean };

/**
 * Per-screen error boundary: one crashing tab/sheet shows a local retry
 * fallback instead of unmounting the whole app through the root boundary.
 */
export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (__DEV__) {
      console.error(
        `[ScreenErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`,
        error,
      );
    }
  }

  private handleRetry = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return <ScreenErrorFallback label={this.props.label} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
