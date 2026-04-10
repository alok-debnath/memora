const MONTH_PATTERN =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_PATTERN = `(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|${MONTH_PATTERN}\\s+\\d{1,2}(?:,\\s*\\d{4})?)`;
const TIME_PATTERN = "(?:\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)|\\d{1,2}:\\d{2})";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripScheduleFromTitle(title: string) {
  let result = normalizeWhitespace(title);
  if (!result) return result;

  result = result
    .replace(
      new RegExp(
        `\\s*(?:[-,:|]|\\()\\s*(?:on\\s+)?${DATE_PATTERN}(?:\\s+(?:at\\s+)?${TIME_PATTERN})?(?:\\s*[A-Z]{2,4})?\\)?$`,
        "i"
      ),
      ""
    )
    .replace(
      new RegExp(
        `\\s+(?:on\\s+)?${DATE_PATTERN}(?:\\s+(?:at\\s+)?${TIME_PATTERN})?(?:\\s*[A-Z]{2,4})?$`,
        "i"
      ),
      ""
    )
    .replace(
      new RegExp(`\\s+at\\s+${TIME_PATTERN}(?:\\s*[A-Z]{2,4})?$`, "i"),
      ""
    )
    .replace(/\s*[-,:|]+\s*$/, "")
    .trim();

  return result;
}

function deriveTopicFromContent(content: string) {
  let value = normalizeWhitespace(
    content.replace(/\[[^\]]*time capsule[^\]]*\]/gi, "")
  );
  if (!value) return "";

  value = value
    .replace(/^remind\s+me\s+to\s+/i, "")
    .replace(/^remember\s+(?:that\s+)?/i, "")
    .replace(/^note\s+(?:that\s+)?/i, "")
    .trim();

  value = value.split(/[.\n]/)[0]?.trim() ?? value;

  value = value
    .replace(
      new RegExp(
        `\\s+(?:on\\s+)?${DATE_PATTERN}(?:\\s+(?:at\\s+)?${TIME_PATTERN})?.*$`,
        "i"
      ),
      ""
    )
    .replace(new RegExp(`\\s+at\\s+${TIME_PATTERN}.*$`, "i"), "")
    .trim();

  return value.slice(0, 70).trim();
}

export function getReminderTitleWithoutSchedule(
  title: string | undefined,
  content: string
) {
  const trimmedTitle = normalizeWhitespace(title ?? "");
  const stripped = stripScheduleFromTitle(trimmedTitle);
  if (stripped.length >= 3) {
    return stripped;
  }

  const fromContent = deriveTopicFromContent(content);
  if (fromContent.length >= 3) {
    return fromContent;
  }

  return trimmedTitle || "Reminder";
}

