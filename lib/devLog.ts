export function logDevError(scope: string, error: unknown, extra?: Record<string, unknown>) {
  if (!__DEV__) return;

  const details = extra ? ` ${JSON.stringify(extra)}` : "";

  if (error instanceof Error) {
    console.error(`[${scope}] ${error.message}${details}`, error);
    return;
  }

  console.error(`[${scope}]`, error, extra ?? "");
}
