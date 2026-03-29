import React from "react";
import { Text, StyleSheet, type ViewStyle, ActivityIndicator, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "./PressableScale";
import { gradients } from "@/constants/colors";
import { FontFamily } from "@/constants/fonts";
import { Feather } from "@expo/vector-icons";

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  style?: ViewStyle;
  loading?: boolean;
  disabled?: boolean;
  variant?: "warm" | "golden";
}

export function GradientButton({
  title,
  onPress,
  icon,
  style,
  loading,
  disabled,
  variant = "warm",
}: GradientButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.shadowWrap, style || {}]}
    >
      <View style={[styles.clipWrap, (disabled || loading) && styles.disabledWrap]}>
        <LinearGradient
          colors={[...gradients[variant]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              {icon && (
                <Feather
                  name={icon}
                  size={18}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
              )}
              <Text style={styles.text}>{title}</Text>
            </>
          )}
        </LinearGradient>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    shadowColor: "#E8911B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  clipWrap: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  disabledWrap: {
    opacity: 0.6,
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 24,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: FontFamily.semiBold,
    fontWeight: "600" as const,
    letterSpacing: 0.2,
  },
});
