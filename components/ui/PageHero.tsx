import React from "react";
import { Feather, type FeatherIconName } from "@/lib/icons";
import { Text, XStack, YStack } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";
import { withAlpha } from "@/components/ui/themeHelpers";

type PageHeroStat = {
  label: string;
  value: string | number;
  color?: string;
};

type PageHeroProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: FeatherIconName;
  iconColor?: string;
  action?: React.ReactNode;
  stats?: PageHeroStat[];
  accentStyle?: "rail" | "none";
};

export function PageHero({
  eyebrow,
  title,
  description,
  icon,
  iconColor,
  action,
  stats,
  accentStyle = "rail",
}: PageHeroProps) {
  const theme = useAppTheme();
  const accent = iconColor ?? theme.primary.val;

  return (
    <YStack gap={10}>
      <XStack alignItems="center" gap={12}>
        {accentStyle === "rail" ? (
          <YStack
            width={3}
            minHeight={52}
            borderRadius={999}
            backgroundColor={withAlpha(accent, "D9")}
          />
        ) : null}
        <YStack flex={1} minWidth={0} gap={3}>
          {eyebrow ? (
            <Text
              fontSize={11}
              lineHeight={14}
              fontFamily="$body"
              fontWeight="700"
              color={theme.colorMuted.val}
              textTransform="uppercase"
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text
            fontSize={26}
            lineHeight={30}
            fontFamily="$heading"
            fontWeight="700"
            color={theme.color.val}
          >
            {title}
          </Text>
          {description ? (
            <Text fontSize={13} lineHeight={18} fontFamily="$body" color={theme.colorMuted.val}>
              {description}
            </Text>
          ) : null}
        </YStack>

        {action ?? (icon ? <HeroIcon icon={icon} color={accent} /> : null)}
      </XStack>

      {stats?.length ? (
        <XStack
          gap={0}
          borderRadius={14}
          borderWidth={1}
          borderColor={theme.borderSubtle.val}
          backgroundColor={theme.backgroundStrong.val}
          overflow="hidden"
        >
          {stats.map((stat, index) => {
            const color = stat.color ?? accent;
            return (
              <YStack
                key={`${stat.label}-${stat.value}`}
                flex={1}
                paddingHorizontal={10}
                paddingVertical={8}
                borderLeftWidth={index === 0 ? 0 : 1}
                borderLeftColor={theme.borderSubtle.val}
                gap={1}
              >
                <Text fontSize={15} fontFamily="$heading" fontWeight="700" color={color}>
                  {stat.value}
                </Text>
                <Text fontSize={10} fontFamily="$body" color={theme.colorMuted.val}>
                  {stat.label}
                </Text>
              </YStack>
            );
          })}
        </XStack>
      ) : null}
    </YStack>
  );
}

function HeroIcon({ icon, color }: { icon: FeatherIconName; color: string }) {
  return (
    <YStack
      width={36}
      height={36}
      borderRadius={12}
      alignItems="center"
      justifyContent="center"
      backgroundColor={withAlpha(color, "12")}
    >
      <Feather name={icon} size={17} color={color} />
    </YStack>
  );
}
