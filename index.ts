import { Text } from "@earendil-works/pi-tui";
import type { AgentActivityOutcome, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getResponseDuration } from "./duration.js";

const ENTRY_TYPE = "response-duration";

export default function (pi: ExtensionAPI) {
  let startedAt: number | undefined;
  let outcome: AgentActivityOutcome | undefined;

  const clearTiming = () => {
    startedAt = undefined;
    outcome = undefined;
  };

  pi.on("session_start", clearTiming);
  pi.on("session_tree", clearTiming);
  pi.on("session_shutdown", clearTiming);

  pi.on("before_agent_start", (event) => {
    // Ignore agent runs started internally by extensions.
    if (event.messageType !== "user") return;
    clearTiming();
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

  pi.on("agent_before_settle", (event) => {
    outcome = event.outcome;
  });

  pi.on("agent_settled", (event, ctx) => {
    const start = startedAt;
    const lastOutcome = outcome;
    clearTiming();

    // Show completed user responses in the TUI transcript, not the footer.
    if (event.aborted) return;
    const duration = getResponseDuration(start, performance.now(), lastOutcome, ctx.mode);
    if (!duration) return;
    pi.appendEntry(ENTRY_TYPE, { duration, completedAt: Date.now() });
  });
}
