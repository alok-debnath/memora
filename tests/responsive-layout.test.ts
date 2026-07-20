import { describe, expect, test } from "bun:test";

import {
  getNavigationContext,
  isNavigationItemActive,
  PRIMARY_NAVIGATION,
} from "@/constants/appNavigation";
import {
  getAdaptiveColumnCount,
  getNavigationMode,
  getNavigationWidth,
  shouldSplitWorkspace,
  getWidthClass,
} from "@/lib/responsiveLayout";

describe("responsive layout", () => {
  test("resolves every width boundary deterministically", () => {
    expect(getWidthClass(599)).toBe("compact");
    expect(getWidthClass(600)).toBe("medium");
    expect(getWidthClass(1023)).toBe("medium");
    expect(getWidthClass(1024)).toBe("expanded");
    expect(getWidthClass(1279)).toBe("expanded");
    expect(getWidthClass(1280)).toBe("wide");
  });

  test("maps width classes to the intended navigation shell", () => {
    expect(getNavigationMode("compact")).toBe("bottom");
    expect(getNavigationMode("medium")).toBe("rail");
    expect(getNavigationMode("expanded")).toBe("sidebar");
    expect(getNavigationMode("wide")).toBe("sidebar");
    expect(getNavigationWidth("compact")).toBe(0);
    expect(getNavigationWidth("medium")).toBe(72);
    expect(getNavigationWidth("expanded")).toBe(248);
    expect(getNavigationWidth("wide")).toBe(272);
  });

  test("adapts grids without producing zero columns", () => {
    expect(getAdaptiveColumnCount(320, 156, 5, 10)).toBe(1);
    expect(getAdaptiveColumnCount(328, 156, 5, 10)).toBe(2);
    expect(getAdaptiveColumnCount(780, 156, 5, 10)).toBe(4);
    expect(getAdaptiveColumnCount(1200, 156, 5, 10)).toBe(5);
    expect(getAdaptiveColumnCount(0, 156, 5, 10)).toBe(1);
  });

  test("composes workspaces from available container width", () => {
    expect(shouldSplitWorkspace(819)).toBe(false);
    expect(shouldSplitWorkspace(820)).toBe(true);
    // A wide window can still collapse after sidebar and docked-chat resizing.
    expect(shouldSplitWorkspace(740)).toBe(false);
    expect(shouldSplitWorkspace(960)).toBe(true);
  });
});

describe("application navigation", () => {
  test("keeps nested routes associated with their parent destination", () => {
    expect(isNavigationItemActive("/", "/")).toBe(true);
    expect(isNavigationItemActive("/diary/entry-id", "/diary")).toBe(true);
    expect(isNavigationItemActive("/admin/analytics", "/admin")).toBe(true);
    expect(isNavigationItemActive("/documents", "/diary")).toBe(false);
    expect(getNavigationContext("/diary/entry-id")?.sectionLabel).toBe("Primary");
    expect(getNavigationContext("/documents")?.sectionLabel).toBe("Library");
  });

  test("uses the Living Timeline primary hierarchy", () => {
    expect(PRIMARY_NAVIGATION.map((item) => item.label)).toEqual(["Today", "Timeline", "Journal"]);
    expect(PRIMARY_NAVIGATION.map((item) => item.href)).toEqual(["/", "/timeline", "/diary"]);
  });
});
