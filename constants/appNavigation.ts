import type { FeatherIconName } from "@/lib/icons";

export type AppNavigationItem = {
  label: string;
  detail: string;
  href: string;
  icon: FeatherIconName;
  adminOnly?: boolean;
};

export type AppNavigationSection = {
  label: string;
  items: AppNavigationItem[];
};

export const APP_NAVIGATION: AppNavigationSection[] = [
  {
    label: "Core",
    items: [
      { label: "Home", detail: "Today and recall", href: "/", icon: "home" },
      { label: "Diary", detail: "Daily reflection", href: "/diary", icon: "book-open" },
      { label: "Review", detail: "Spaced repetition", href: "/review", icon: "refresh-cw" },
    ],
  },
  {
    label: "Library",
    items: [
      { label: "Timeline", detail: "Memories over time", href: "/timeline", icon: "clock" },
      { label: "Reminders", detail: "Upcoming follow-ups", href: "/reminders", icon: "bell" },
      { label: "Files", detail: "Images and documents", href: "/documents", icon: "paperclip" },
      {
        label: "Knowledge graph",
        detail: "Connected memories",
        href: "/knowledge-graph",
        icon: "share-2",
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        label: "Analytics",
        detail: "Patterns and usage",
        href: "/statistics",
        icon: "bar-chart-2",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        label: "App settings",
        detail: "Appearance and behavior",
        href: "/settings",
        icon: "settings",
      },
      { label: "Data", detail: "Trash and controls", href: "/data", icon: "archive" },
      { label: "Profile", detail: "Identity and AI", href: "/profile", icon: "user" },
      {
        label: "Admin console",
        detail: "Platform operations",
        href: "/admin",
        icon: "shield",
        adminOnly: true,
      },
    ],
  },
];

export function isNavigationItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/index";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getNavigationContext(pathname: string) {
  for (const section of APP_NAVIGATION) {
    const item = section.items.find((candidate) =>
      isNavigationItemActive(pathname, candidate.href),
    );
    if (item) return { sectionLabel: section.label, item };
  }
  return null;
}
