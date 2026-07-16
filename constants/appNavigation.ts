import type { FeatherIconName } from "@/lib/icons";

export type AppNavigationItem = {
  id: string;
  label: string;
  detail: string;
  href: string;
  icon: FeatherIconName;
  primary?: boolean;
  tabName?: "index" | "timeline" | "diary" | "review";
  adminOnly?: boolean;
};

export type AppNavigationSection = {
  label: string;
  items: AppNavigationItem[];
};

/** Shared identity for the command surface, which supports both recall and creation. */
export const COMMAND_ENTRY = {
  label: "Ask",
  icon: "message-circle",
  accessibilityLabel: "Ask Memora about your memories or save something new",
} as const satisfies {
  label: string;
  icon: FeatherIconName;
  accessibilityLabel: string;
};

export const APP_NAVIGATION: AppNavigationSection[] = [
  {
    label: "Primary",
    items: [
      {
        id: "today",
        label: "Today",
        detail: "Your daily memory rhythm",
        href: "/",
        icon: "sun",
        primary: true,
        tabName: "index",
      },
      {
        id: "timeline",
        label: "Timeline",
        detail: "Browse and recall memories",
        href: "/timeline",
        icon: "clock",
        primary: true,
        tabName: "timeline",
      },
      {
        id: "journal",
        label: "Journal",
        detail: "Reflect and notice patterns",
        href: "/diary",
        icon: "book-open",
        primary: true,
        tabName: "diary",
      },
      {
        id: "review",
        label: "Review",
        detail: "Strengthen important memories",
        href: "/review",
        icon: "refresh-cw",
        primary: true,
        tabName: "review",
      },
    ],
  },
  {
    label: "Library",
    items: [
      {
        id: "reminders",
        label: "Reminders",
        detail: "Upcoming follow-ups",
        href: "/reminders",
        icon: "bell",
      },
      {
        id: "files",
        label: "Files",
        detail: "Images and documents",
        href: "/documents",
        icon: "paperclip",
      },
      {
        id: "knowledge-graph",
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
        id: "analytics",
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
        id: "settings",
        label: "App settings",
        detail: "Appearance and behavior",
        href: "/settings",
        icon: "settings",
      },
      {
        id: "profile",
        label: "Profile",
        detail: "Identity and integrations",
        href: "/profile",
        icon: "user",
      },
      {
        id: "data",
        label: "Data",
        detail: "Trash and controls",
        href: "/data",
        icon: "archive",
      },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        id: "admin",
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

export const PRIMARY_NAVIGATION = APP_NAVIGATION.flatMap((section) => section.items).filter(
  (item) => item.primary,
);

export const SECONDARY_NAVIGATION = APP_NAVIGATION.filter((section) => section.label !== "Primary");
