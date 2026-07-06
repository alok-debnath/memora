import type { ChatTool } from "./toolTypes";

export const surfaceCardsTool: ChatTool = {
  name: "surface_cards",
  label: "Surface cards",
  definition: {
    type: "function",
    function: {
      name: "surface_cards",
      description:
        "Show specific memories and diary entries as interactive cards in the UI. Call this with only the IDs of items you actually used or referenced in your response — memory IDs and diary entry IDs are both accepted. Do NOT include items you searched but didn't use to answer.",
      parameters: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            items: { type: "string" },
            description: "IDs of memories and/or diary entries to surface as cards.",
          },
        },
        required: ["ids"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "finalizing",
    detail: "Preparing memory cards for the UI",
    source: "ui",
    events: [{ label: "Operation", value: "surface cards" }],
  }),
  handler: async (tc, fnArgs) => {
    const ids = Array.isArray(fnArgs.ids) ? (fnArgs.ids as string[]) : [];
    for (const id of ids) tc.state.pendingCardIds.add(id);
    tc.state.surfaceCardsCalled = true;
    await tc.setStreamingStatus({
      phase: "finalizing",
      toolName: "surface_cards",
      detail:
        ids.length > 0
          ? `Preparing ${ids.length} memory card${ids.length === 1 ? "" : "s"}`
          : "No memory cards needed for this reply",
      source: "ui",
      resultCount: ids.length,
      events: [{ label: "Operation", value: "surface cards" }],
      step: 3,
      totalSteps: 4,
    });
    return JSON.stringify({ success: true });
  },
};
