import React from "react";
import { ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";
import { Text, XStack } from "tamagui";
import { useAppTheme } from "@/hooks/useAppTheme";
import { categoryIcons, categoryLabels, type Category } from "@/constants/categories";
import { categoryColors } from "@/constants/colors";

interface CategoryPillsProps {
  selected: string | null;
  onSelect: (category: string | null) => void;
  /** Map of category → count from the backend stats query */
  categoryCounts: Record<string, number>;
}

export function CategoryPills({ selected, onSelect, categoryCounts }: CategoryPillsProps) {
  const theme = useAppTheme();

  // Only show categories that actually have memories, sorted by count descending
  const activeCategories = Object.entries(categoryCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);

  if (activeCategories.length < 2) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: "row" }}
    >
      {/* "All" pill */}
      <PressableScale
        onPress={() => onSelect(null)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 20,
          gap: 6,
          borderWidth: 0.5,
          backgroundColor: selected === null ? theme.primary.val : theme.secondary.val,
          borderColor: selected === null ? theme.primary.val : theme.borderColor.val,
        }}
      >
        <Text
          fontSize={13}
          fontFamily="$body"
          fontWeight="500"
          color={selected === null ? "#FFFFFF" : "$colorMuted"}
        >
          All
        </Text>
      </PressableScale>

      {/* Dynamic category pills */}
      {activeCategories.map((cat) => {
        const isSelected = selected === cat;
        const pillColor = categoryColors[cat] || theme.primary.val;
        const icon = categoryIcons[cat as Category];
        const label = categoryLabels[cat as Category] || cat;
        const count = categoryCounts[cat];

        return (
          <PressableScale
            key={cat}
            onPress={() => onSelect(cat)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              gap: 6,
              borderWidth: 0.5,
              backgroundColor: isSelected ? pillColor : theme.secondary.val,
              borderColor: isSelected ? pillColor : theme.borderColor.val,
            }}
          >
            {icon && (
              <Feather
                name={icon}
                size={14}
                color={isSelected ? "#FFFFFF" : theme.colorMuted.val}
              />
            )}
            <Text
              fontSize={13}
              fontFamily="$body"
              fontWeight="500"
              color={isSelected ? "#FFFFFF" : "$colorMuted"}
            >
              {label}
            </Text>
            <Text
              fontSize={11}
              fontFamily="$body"
              color={isSelected ? "rgba(255,255,255,0.7)" : "$colorMuted"}
            >
              {count}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}
