import type { ChatTool } from "./toolTypes";

/**
 * Terminal tool — every turn must end by calling this instead of returning
 * plain text. Forcing the final answer through a tool call (tool_choice:
 * "required") means the model can no longer "forget" to report which
 * memories it used: used_ids is a mandatory argument alongside the message,
 * not a voluntary follow-up. The model still writes a normal free-text
 * `message`, which streams to the user via a live JSON-argument extractor
 * (see providers/openai.ts) so this reads no differently than plain
 * streamed content.
 */
export const respondTool: ChatTool = {
  name: "respond",
  label: "Respond",
  definition: {
    type: "function",
    function: {
      name: "respond",
      description:
        "End the turn with your final answer. You MUST call this exactly once to finish — never reply with plain text instead. message is the natural-language reply shown to the user verbatim. used_ids lists every memory and/or diary entry ID you actually referenced to produce message (empty array if none).",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Natural-language reply shown to the user, exactly as written here.",
          },
          used_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "IDs of memories/diary entries referenced in message. Empty array if none were used.",
          },
        },
        required: ["message", "used_ids"],
        additionalProperties: false,
      },
    },
  },
  buildStatus: () => ({
    phase: "finalizing",
    detail: "Composing final answer",
    source: "assistant",
    events: [{ label: "Operation", value: "respond" }],
  }),
  handler: async (tc, fnArgs) => {
    const message = typeof fnArgs.message === "string" ? fnArgs.message : "";
    const ids = Array.isArray(fnArgs.used_ids)
      ? (fnArgs.used_ids as unknown[]).filter((id): id is string => typeof id === "string")
      : [];
    for (const id of ids) tc.state.pendingCardIds.add(id);
    tc.state.respondCalled = true;
    tc.state.finalMessage = message;
    await tc.setStreamingStatus({
      phase: "finalizing",
      toolName: "respond",
      detail: "Finalizing response",
      source: "assistant",
      resultCount: ids.length,
      events: [{ label: "Cards", value: `${ids.length}` }],
      step: 4,
      totalSteps: 4,
    });
    return JSON.stringify({ success: true });
  },
};
