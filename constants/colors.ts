const amber = "#C98522";

export const brandGradients = {
  warm: ["#8F5A12", "#C98522", "#E9AD4A"] as const,
  golden: ["#D99C36", "#F2C66E"] as const,
  ember: ["#A96016", "#D99C36", "#F7D48A"] as const,
};

export const gradients = brandGradients;

export const moodColors: Record<string, string> = {
  happy: "#FBBF24",
  sad: "#60A5FA",
  anxious: "#F87171",
  excited: "#FB923C",
  neutral: "#9CA3AF",
  grateful: "#34D399",
  frustrated: "#EF4444",
  hopeful: "#A78BFA",
  nostalgic: "#818CF8",
  motivated: "#10B981",
};

export const navigationAccentColors = {
  timeline: "#6366F1",
  reminders: "#F59E0B",
  documents: "#3B82F6",
  knowledgeGraph: "#10B981",
  statistics: "#EC4899",
  data: "#D97706",
  profile: "#8B5CF6",
} as const;

export const statusAccentColors = {
  success: "#10B981",
  successStrong: "#16A34A",
  warning: "#F59E0B",
  warningStrong: "#D97706",
  error: "#EF4444",
  errorStrong: "#DC2626",
  info: "#3B82F6",
  neutral: "#6B7280",
} as const;

export const statAccentColors = {
  memories: statusAccentColors.info,
  reminders: statusAccentColors.warning,
  categories: statusAccentColors.success,
  topics: statusAccentColors.warning,
  words: statusAccentColors.success,
  diary: "#8B5CF6",
} as const;

export const reviewQualityColors = {
  again: statusAccentColors.error,
  hard: statusAccentColors.warning,
  good: statusAccentColors.info,
  easy: statusAccentColors.success,
} as const;

export const integrationAccentColors = {
  googleDrive: "#1A73E8",
  reasoning: "#7C3AED",
  openai: "#0F766E",
  mlkit: statusAccentColors.successStrong,
  pdfExtract: statusAccentColors.neutral,
} as const;

export default {
  primary: amber,
  gradients: brandGradients,
};
