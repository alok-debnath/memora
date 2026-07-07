/**
 * Incrementally extracts one string field's value out of a JSON object
 * literal as raw text deltas arrive (e.g. streaming tool-call arguments),
 * without waiting for the whole object to parse. Used to stream a
 * structured tool argument (like a `message` field) to the user as if it
 * were plain text content.
 *
 * Scope: finds the first `"<fieldName>":` key at any depth and streams its
 * string value, handling standard JSON escapes (including \uXXXX) split
 * across chunk boundaries. Not a general JSON streamer — if the key isn't
 * found or its value isn't a string, it simply never emits anything.
 */
export function createJsonStringFieldExtractor(fieldName: string) {
  const keyToken = `"${fieldName}"`;
  let raw = "";
  let scanFrom = 0;
  let mode: "seeking" | "in-value" | "done" = "seeking";

  function unescape(ch: string): string | null {
    switch (ch) {
      case '"':
        return '"';
      case "\\":
        return "\\";
      case "/":
        return "/";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      default:
        return null;
    }
  }

  return {
    push(delta: string): string {
      if (mode === "done" || !delta) return "";
      raw += delta;

      if (mode === "seeking") {
        const keyIdx = raw.indexOf(keyToken, scanFrom);
        if (keyIdx === -1) {
          scanFrom = Math.max(0, raw.length - keyToken.length);
          return "";
        }
        let i = keyIdx + keyToken.length;
        while (i < raw.length && /[\s:]/.test(raw[i])) i++;
        if (i >= raw.length) {
          scanFrom = keyIdx;
          return "";
        }
        if (raw[i] !== '"') {
          mode = "done";
          return "";
        }
        scanFrom = i + 1;
        mode = "in-value";
      }

      let out = "";
      let i = scanFrom;
      while (i < raw.length) {
        const ch = raw[i];
        if (ch === "\\") {
          if (i + 1 >= raw.length) break; // wait for the rest of the escape
          const next = raw[i + 1];
          if (next === "u") {
            if (i + 6 > raw.length) break; // wait for full \uXXXX
            out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16));
            i += 6;
            continue;
          }
          const unescaped = unescape(next);
          out += unescaped ?? next;
          i += 2;
        } else if (ch === '"') {
          mode = "done";
          i++;
          break;
        } else {
          out += ch;
          i++;
        }
      }
      scanFrom = i;
      return out;
    },
  };
}
