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
      fontWeight="600"
      textTransform="uppercase"
      letterSpacing={1.2}
      marginBottom={marginBottom}
      marginLeft={4}
    >
      {children}
    </Text>
  );
}
