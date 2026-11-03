import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function interruptExtension(pi: ExtensionAPI) {
  pi.registerCommand("interrupt", {
    description:
      "Stop the current prompt, optionally redirecting with a new one",
    handler: async (args, ctx) => {
      const prompt = args.trim();
      const running = !ctx.isIdle() || ctx.hasPendingMessages();

      if (!running) {
        if (prompt) {
          pi.sendUserMessage(prompt);
        } else {
          ctx.ui.notify("Nothing is running", "info");
        }
        return;
      }

      if (prompt) {
        pi.sendUserMessage(prompt, { deliverAs: "steer" });
        ctx.ui.notify("Interrupted — redirecting", "info");
      } else {
        ctx.abort();
        ctx.ui.notify("Interrupted", "info");
      }
    },
  });
}
