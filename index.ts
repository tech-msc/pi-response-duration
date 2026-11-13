import { Text } from "@earendil-works/pi-tui";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getResponseDuration } from "./duration.js";

const ENTRY_TYPE = "response-duration";

export default function (pi: ExtensionAPI) {
  let startedAt: number | undefined;

  pi.on("before_agent_start", (event) => {
    // Ignore agent runs started internally by extensions.
    if (event.messageType !== "user") return;
    startedAt = performance.now();
  });

  pi.registerEntryRenderer<{ duration: string; completedAt?: number }>(ENTRY_TYPE, (entry, _options, theme) => {
    const duration = entry.data?.duration;
    if (!duration) return undefined;
    const completedAt = entry.data?.completedAt;
    const time = typeof completedAt === "number" && Number.isFinite(completedAt)
      ? ` • ${new Date(completedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : "";
    return new Text(theme.fg("dim", ` Worked for ${duration}${time}`), 0, 0);
  });

  pi.on("agent_before_settle", (event, ctx) => {
    const start = startedAt;
    startedAt = undefined;

    // Show completed user responses in the TUI transcript, not the footer.
    const duration = getResponseDuration(start, performance.now(), event.outcome, ctx.mode);
    if (!duration) return;

    return {
      entries: [{ type: "custom", customType: ENTRY_TYPE, data: { duration, completedAt: Date.now() } }],
    };
  });
}
