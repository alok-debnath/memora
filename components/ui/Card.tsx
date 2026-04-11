import React from "react";
import { type ViewStyle } from "react-native";
import { SurfaceCard } from "@/components/ui/SurfaceCard";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  noPadding?: boolean;
}

export function Card({ children, style, noPadding }: CardProps) {
  return (
    <SurfaceCard padding={noPadding ? 0 : 18} style={style}>
      {children}
    </SurfaceCard>
  );
}
