const sourceGlob = new Bun.Glob("{app,components}/**/*.{ts,tsx}");

const forbiddenPatterns = [
  {
    pattern: /Touchable(?:Opacity|Highlight|WithoutFeedback)/g,
    message: "Use Pressable or a shared AppPressable-based primitive.",
  },
  {
    pattern: /(?:GradientButton|SegmentedControl)/g,
    message: "Use AppButton or SelectionTabs from the shared UI system.",
  },
  {
    pattern: /(?:components\/ui\/Card|["']\.\/?ui\/Card["'])/g,
    message: "Use SurfaceCard or SectionCard instead of the retired Card alias.",
  },
  {
    pattern: /function\s+(?:TabPill|ModePill|CompactRangeSelector|DesktopRangeSelector)\b/g,
    message: "Use SelectionTabs or FilterChipGroup instead of a screen-local selector.",
  },
] as const;

const rawColorPattern = /(?:#[0-9a-fA-F]{3,8}\b|rgba?\s*\()/g;
const rawColorAllowlist = new Set([
  "components/ui/HexColorPicker.tsx",
  "components/admin/charts/palette.ts",
]);

const violations: string[] = [];

for await (const path of sourceGlob.scan({ cwd: process.cwd(), onlyFiles: true })) {
  const source = await Bun.file(path).text();
  const lines = source.split("\n");

  for (const rule of forbiddenPatterns) {
    if (rule.pattern.source.startsWith("Touchable") && source.includes("@gorhom/bottom-sheet")) {
      continue;
    }
    for (const match of source.matchAll(rule.pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${path}:${line} ${rule.message}`);
    }
  }

  if (!rawColorAllowlist.has(path)) {
    lines.forEach((lineText, index) => {
      if (lineText.trimStart().startsWith("//") || lineText.trimStart().startsWith("*")) return;
      if (rawColorPattern.test(lineText)) {
        violations.push(
          `${path}:${index + 1} Use a semantic theme token or centralized palette color.`,
        );
      }
      rawColorPattern.lastIndex = 0;
    });
  }
}

if (violations.length > 0) {
  console.error(
    `UI consistency check failed:\n${violations.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exit(1);
}

console.log("UI consistency check passed.");
