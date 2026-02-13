import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { runOnRecieveHook } from "../src/hooks/runOnRecieveHook";

describe("runOnRecieveHook", () => {
  it("skips when hook script is missing", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-hook-missing-"));

    try {
      const result = await runOnRecieveHook(
        {
          mailbox: "INBOX",
          messageDir: tempRoot,
          metadata: {
            uid: 1,
            messageId: "m-1",
            from: ["alice@example.com"],
            to: ["agent@marvinkleinpass.dev"],
            subject: "Hello",
            date: "2026-02-13T00:00:00.000Z",
            flags: [],
            savedAt: "2026-02-13T00:00:01.000Z",
            attachments: []
          }
        },
        {
          hookFilePath: path.join(tempRoot, "hooks", "on_recieve.sh")
        }
      );

      expect(result.executed).toBeFalse();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("executes hook and provides message env vars", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentmail-hook-run-"));
    const hookDir = path.join(tempRoot, "hooks");
    const hookFile = path.join(hookDir, "on_recieve.sh");
    const outputFile = path.join(tempRoot, "hook-output.txt");

    try {
      await mkdir(hookDir, { recursive: true });

      await writeFile(
        hookFile,
        `#!/usr/bin/env bash\nset -euo pipefail\nprintf "%s\\n%s\\n%s\\n" "$AGENTMAIL_HOOK_EVENT" "$AGENTMAIL_MESSAGE_UID" "$AGENTMAIL_MESSAGE_SUBJECT" > "$AGENTMAIL_MESSAGE_DIR/hook-output.txt"\n`,
        "utf8"
      );
      await chmod(hookFile, 0o755);

      const result = await runOnRecieveHook(
        {
          mailbox: "INBOX",
          messageDir: tempRoot,
          metadata: {
            uid: 42,
            messageId: "m-42",
            from: ["Alice <alice@example.com>"],
            to: ["agent@marvinkleinpass.dev"],
            subject: "Hook me",
            date: "2026-02-13T00:00:00.000Z",
            flags: [],
            savedAt: "2026-02-13T00:00:01.000Z",
            attachments: []
          }
        },
        {
          hookFilePath: hookFile
        }
      );

      expect(result.executed).toBeTrue();

      const output = await readFile(outputFile, "utf8");
      const lines = output.trim().split("\n");
      expect(lines[0]).toBe("on_recieve");
      expect(lines[1]).toBe("42");
      expect(lines[2]).toBe("Hook me");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
