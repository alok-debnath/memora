import type { FeatherIconName } from "@/lib/icons";

export type Mood =
  | "happy"
  | "sad"
  | "anxious"
  | "excited"
  | "neutral"
  | "grateful"
  | "frustrated"
  | "hopeful"
  | "nostalgic"
  | "motivated";

export type Importance = "critical" | "high" | "normal" | "low";

export type LifeArea =
  | "career"
  | "family"
  | "health"
  | "finance"
  | "social"
  | "hobbies"
  | "education"
  | "travel"
  | "self-care"
  | "relationships";

export const moodIcons: Record<Mood, FeatherIconName> = {
  happy: "smile",
  sad: "frown",
  anxious: "alert-circle",
  excited: "zap",
  neutral: "minus-circle",
  grateful: "gift",
  frustrated: "cloud-lightning",
  hopeful: "sunrise",
  nostalgic: "clock",
  motivated: "trending-up",
};

export const moodLabels: Record<Mood, string> = {
  happy: "Happy",
  sad: "Sad",
  anxious: "Anxious",
  excited: "Excited",
  neutral: "Neutral",
  grateful: "Grateful",
  frustrated: "Frustrated",
  hopeful: "Hopeful",
  nostalgic: "Nostalgic",
  motivated: "Motivated",
};

export const importanceLabels: Record<Importance, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export const lifeAreaLabels: Record<LifeArea, string> = {
  career: "Career",
  family: "Family",
  health: "Health",
  finance: "Finance",
  social: "Social",
  hobbies: "Hobbies",
  education: "Education",
  travel: "Travel",
  "self-care": "Self-care",
  relationships: "Relationships",
};
