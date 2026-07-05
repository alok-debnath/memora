import React from "react";
import { Text } from "tamagui";

import { useAppTheme } from "@/hooks/useAppTheme";

interface SectionLabelProps {
  children: string;
  marginBottom?: number;
}

export function SectionLabel({ children, marginBottom = 8 }: SectionLabelProps) {
  const theme = useAppTheme();
  return (
    <Text
      color={theme.colorMuted.val}
      fontSize={11}
      fontFamily="$body"
      fontWeight="700"
      textTransform="uppercase"
      marginBottom={marginBottom}
      marginLeft={4}
    >
      {children}
    </Text>
  );
}
