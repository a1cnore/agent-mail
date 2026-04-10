import { mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "../types";
import { consoleLogger } from "../types";
import { readPollingConfig } from "../config/polling";
import { RECEIVE_WATCH_LOCK_FILE } from "../config/paths";
import { receiveOnce } from "./receiveOnce";

export interface WatchLoopOptions {
  profileId?: string;
  pollingFilePath?: string;
  lockFilePath?: string;
  envFilePath?: string;
  messagesDir?: string;
  hookFilePath?: string;
  databaseFile?: string;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ESRCH") {
      return false;
    }

    if (ioError.code === "EPERM") {
      return true;
    }

    throw error;
  }
}

async function readPidFromLockFile(lockFilePath: string): Promise<number | null> {
  try {
    const contents = await readFile(lockFilePath, "utf8");
    const parsed = JSON.parse(contents) as { pid?: unknown };

    if (typeof parsed.pid === "number" && Number.isInteger(parsed.pid)) {
      return parsed.pid;
    }

    return null;
  } catch {
    return null;
  }
}

async function acquireWatchLock(lockFilePath: string): Promise<() => Promise<void>> {
  await mkdir(path.dirname(lockFilePath), { recursive: true });

  try {
    const handle = await open(lockFilePath, "wx");
    const payload = `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`;
    await handle.writeFile(payload, "utf8");
    await handle.close();

    return async () => {
      await rm(lockFilePath, { force: true });
    };
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code !== "EEXIST") {
      throw error;
    }

    const existingPid = await readPidFromLockFile(lockFilePath);
    if (existingPid !== null && isProcessAlive(existingPid)) {
      throw new Error(`Receive watch is already running with PID ${existingPid}.`);
    }

    await rm(lockFilePath, { force: true });
    return acquireWatchLock(lockFilePath);
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function sleepUntilStopOrTimeout(
  milliseconds: number,
  shouldStop: () => boolean
): Promise<void> {
  const stepMilliseconds = 250;
  let remainingMilliseconds = milliseconds;

  while (remainingMilliseconds > 0 && !shouldStop()) {
    const step = Math.min(stepMilliseconds, remainingMilliseconds);
    await sleep(step);
    remainingMilliseconds -= step;
  }
}

export async function watchLoop(
  logger: Logger = consoleLogger,
  options: WatchLoopOptions = {}
): Promise<void> {
  const pollingConfig = await readPollingConfig(options.pollingFilePath);
  const releaseLock = await acquireWatchLock(options.lockFilePath ?? RECEIVE_WATCH_LOCK_FILE);
  let shouldStop = false;

  const stop = (signal: NodeJS.Signals) => {
    if (!shouldStop) {
      shouldStop = true;
      logger.warn(`Received ${signal}. Stopping receive watch.`);
    }
  };

  const onSigInt = () => stop("SIGINT");
  const onSigTerm = () => stop("SIGTERM");

  process.on("SIGINT", onSigInt);
  process.on("SIGTERM", onSigTerm);

  logger.info(
    `Starting receive watch on mailbox ${pollingConfig.mailbox} every ${pollingConfig.intervalSeconds} second(s).`
  );

  try {
    while (!shouldStop) {
      try {
        const result = await receiveOnce({
          profileId: options.profileId,
          mailbox: pollingConfig.mailbox,
          logger,
          envFilePath: options.envFilePath,
          messagesDir: options.messagesDir,
          hookFilePath: options.hookFilePath,
          databaseFile: options.databaseFile
        });

        logger.info(
          `Receive cycle complete. Found=${result.found}, Saved=${result.saved}, SeenMarked=${result.seenMarked}, Failed=${result.failed}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Receive cycle failed: ${message}`);
      }

      if (!shouldStop) {
        await sleepUntilStopOrTimeout(pollingConfig.intervalSeconds * 1000, () => shouldStop);
      }
    }
  } finally {
    process.off("SIGINT", onSigInt);
    process.off("SIGTERM", onSigTerm);
    await releaseLock();
    logger.info("Receive watch stopped.");
  }
}
