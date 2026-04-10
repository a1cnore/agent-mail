# AgentMail

AgentMail is a local mail runtime for agents. It sends mail via SMTP, polls IMAP inboxes, stores raw mail on disk, indexes conversations in SQLite, and can bridge inbound mail into OpenClaw for automated handling.

## What Exists Today

- Profile-scoped mailbox config under `~/.agentmail/profiles/<profile>/`
- Shared SQLite index at `~/.agentmail/agentmail.db`
- Local persistence for inbound mail, outbound mail, attachments, and metadata
- IMAP polling with one-shot and long-running watch modes
- Receive hooks that run after each newly saved inbound message
- Conversation lookup by sender or session
- A shared OpenClaw dispatch bridge for handing inbound mail to agents
- macOS `launchd` helpers for watchers and the dispatcher
- A local inbox web UI for conversations, queue state, bridge logs, and config editing

## Architecture

### 1. Profiles and Storage

Each mailbox lives in an AgentMail profile.

- Default profile: `~/.agentmail/*`
- Named profile: `~/.agentmail/profiles/<profile>/*`
- Shared database: `~/.agentmail/agentmail.db`

Per profile, AgentMail keeps:

- `.env` with SMTP and IMAP credentials
- `polling.json` with mailbox and interval
- `messages/` for inbound mail
- `sent/` for outbound mail
- `hooks/on_recieve.sh`
- `receive-watch.lock`

### 2. Receive Pipeline

`agentmail receive once` and `agentmail receive watch` do the same core work:

1. Load profile credentials from `.env`
2. Poll the configured IMAP mailbox for unseen messages
3. Save each message locally as:
   - `raw.eml`
   - `body.txt`
   - `body.html`
   - `attachments/*`
   - `metadata.json`
4. Insert or update the shared SQLite index
5. Mark the IMAP message as seen
6. Run `hooks/on_recieve.sh` if present

Inbound mail is indexed into a stable local session id:

```text
mail:<profileId>:<sha1(normalized-sender)>
```

### 3. Send Pipeline

`agentmail send` sends mail through SMTP and also writes a local sent-message copy into the profile's `sent/` directory. Outbound mail is indexed into the same SQLite session graph so local conversation history stays complete.

Reply threading is preserved through:

- `In-Reply-To`
- `References`
- sender/session matching in the local index

### 4. OpenClaw Bridge

The bridge is the shared dispatcher that turns newly indexed inbound mail into OpenClaw turns.

Flow:

1. `receiveOnce()` saves the inbound message and records it in SQLite with dispatch status `pending`
2. `agentmail dispatch run` or `agentmail dispatch once` loads the shared bridge config from `~/.openclaw/mail-dispatch/config.json`
3. The dispatcher claims pending or failed rows from SQLite
4. It builds an OpenClaw payload from:
   - sender/recipient metadata
   - subject and threading headers
   - attachment list and saved file paths
   - local message directory
   - body text or stripped HTML fallback
5. It sends the turn into OpenClaw with:

```bash
openclaw gateway call chat.send --json --timeout 20000 --params '{...}'
```

OpenClaw session isolation is explicit and per sender:

```text
agent:<agentId>:mail:<normalized-sender-email>
```

That means one mailbox profile can be bound to one agent, while each external sender still gets their own OpenClaw session stream.

### 5. Optional Workspace Automation

If the bound OpenClaw agent workspace contains all of the following files, AgentMail switches from a generic "reply with agentmail" prompt to the structured sales automation flow:

- `prose/inbound_intake.prose`
- `lobster/reply_guarded_send.lobster.yaml`
- `lobster/no_reply.lobster.yaml`
- `scripts/agentmail_reply_guard.py`

When that automation stack exists, AgentMail writes:

- `openclaw-inbound-context.json`
- `sales_work_item.json`

into the saved message directory and instructs the agent to use the guarded Lobster flow instead of calling `agentmail send` directly.

If those workspace files do not exist, the bridge falls back to direct reply instructions using `agentmail --profile <profile> send ...`.

### 6. Operations Layer

- Bridge log: `~/.agentmail/logs/bridge.log`
- Receive logs: `~/.agentmail/logs/receive-<profile>.log`
- Dispatcher log: `~/.agentmail/logs/dispatch.log`
- Dispatcher health check: `agentmail dispatch doctor`
- Queue status: `agentmail dispatch status --verbose`
- Deadletter or failed retry: `agentmail dispatch retry --include-deadletter`

Retry schedule for failed dispatches:

- 1 minute
- 5 minutes
- 15 minutes
- 60 minutes
- then `deadletter`

### 7. Inbox UI

`agentmail inbox` starts a local HTTP server that exposes:

- profiles and sessions
- message bodies and attachments
- dispatch queue state
- bridge logs
- OpenClaw mail sessions
- dispatch bindings
- service status
- profile env editing
- polling config editing
- hook editing

The helper script `./start-ui.sh` can run that UI in the foreground or background.

## New Machine Setup

### Prerequisites

- `git`
- `bun`
- an IMAP/SMTP mailbox
- `openclaw` CLI if you want the bridge
- macOS if you want `agentmail service install` (`launchd` only)

Recommended check:

```bash
git --version
bun --version
openclaw --help
```

### Install AgentMail

Recommended install:

```bash
curl -fsSL https://raw.githubusercontent.com/a1cnore/agent-mail/master/setup.sh | bash
```

What `setup.sh` does:

- clones or updates the repo into `~/.local/src/agent-mail`
- runs `bun install`
- builds `dist/agentmail`
- installs `~/.local/bin/agentmail`
- adds `~/.local/bin` to `PATH` when needed
- creates `~/.agentmail/.env` from `.env.example` if missing

If you already have a local checkout:

```bash
cd /path/to/agent-mail
./setup-local.sh
```

Manual build:

```bash
bun install
bun run build:standalone
./dist/agentmail --help
```

### Create a Mailbox Profile

Create a profile and write its `.env` and `polling.json` in one step:

```bash
agentmail account create \
  --name work \
  --email you@example.com \
  --smtp-host smtp.example.com \
  --smtp-port 465 \
  --smtp-secure true \
  --smtp-user you@example.com \
  --smtp-pass 'smtp-password' \
  --imap-host imap.example.com \
  --imap-port 993 \
  --imap-secure true \
  --imap-user you@example.com \
  --imap-pass 'imap-password' \
  --mailbox INBOX \
  --interval 60
```

If you want the profile bound to an OpenClaw agent immediately:

```bash
agentmail account create \
  --name work \
  --email you@example.com \
  --smtp-host smtp.example.com \
  --smtp-user you@example.com \
  --smtp-pass 'smtp-password' \
  --imap-host imap.example.com \
  --imap-user you@example.com \
  --imap-pass 'imap-password' \
  --agent sales \
  --dispatch-config ~/.openclaw/mail-dispatch/config.json
```

Validate the result:

```bash
agentmail --profile work config validate
```

### Configure the OpenClaw Bridge

The bridge needs two things:

1. a profile-to-agent binding in `~/.openclaw/mail-dispatch/config.json`
2. a working OpenClaw installation that can accept `chat.send`

Create or update the binding manually:

```bash
agentmail dispatch bind --account work --agent sales
```

The dispatcher config looks like this:

```json
{
  "accounts": {
    "work": {
      "agentId": "sales",
      "enabled": true
    }
  },
  "worker": {
    "pollIntervalMs": 1000,
    "maxConcurrentSessions": 4
  }
}
```

AgentMail reads OpenClaw runtime details from `~/.openclaw/openclaw.json`. The important fields are:

- `gateway.port`
- `gateway.auth.token`
- `agents.list[].id`
- `agents.list[].workspace`

The workspace path is what enables the optional Lobster/prose automation stack described above.

### Smoke Test the Bridge

Use this sequence on a fresh machine:

```bash
agentmail --profile work receive once
agentmail dispatch once
agentmail dispatch status --verbose
agentmail dispatch doctor
```

What you should see:

- inbound mail saved into `~/.agentmail/profiles/work/messages/...`
- a row in SQLite with dispatch state updates
- bridge log entries in `~/.agentmail/logs/bridge.log`
- `dispatch doctor` reporting a valid env, polling config, binding, and watcher state

### Run It Continuously

Manual mode:

```bash
agentmail --profile work receive watch
agentmail dispatch run
```

macOS `launchd` mode:

```bash
agentmail service install
agentmail service status
```

`service install` creates:

- one watcher LaunchAgent per configured profile
- one shared dispatcher LaunchAgent

Everything is written under `~/Library/LaunchAgents/`.

### Start the Inbox UI

Foreground:

```bash
agentmail inbox --hostname 127.0.0.1 --port 8025
```

Background helper:

```bash
./start-ui.sh --background
```

Then open `http://127.0.0.1:8025`.

## Command Reference

### Top Level

```bash
agentmail [--profile <name>] <command>
```

Commands:

- `send`
- `account`
- `receive`
- `config`
- `index`
- `conversation`
- `dispatch`
- `service`
- `inbox`

### `agentmail send`

```bash
agentmail send --to <list> --subject <text> [options]
```

Key options:

- `--cc <list>`
- `--bcc <list>`
- `--text <text>`
- `--html <html>`
- `--in-reply-to <messageId>`
- `--references <list>`
- `--attach <path>`

### `agentmail receive`

```bash
agentmail receive setup [--mailbox <name>] [--interval <seconds>]
agentmail receive once [--mailbox <name>]
agentmail receive watch
agentmail receive watch-all
```

Behavior notes:

- `watch` uses the active profile
- `watch` without `--profile` auto-discovers configured profiles and watches them all
- `watch-all` is the explicit "all configured profiles" form

### `agentmail conversation`

```bash
agentmail conversation [--sender <email> | --session <id>] [--include-sent] [--json]
```

### `agentmail index`

```bash
agentmail index rebuild
```

Rebuilds the shared SQLite index from saved `messages/` and `sent/` folders.

### `agentmail dispatch`

```bash
agentmail dispatch bind --account <name> --agent <id> [--config <path>]
agentmail dispatch run [--config <path>]
agentmail dispatch once [--config <path>]
agentmail dispatch status [--verbose] [--json]
agentmail dispatch inspect [--account <name>] [--sender <email>] [--status <list>]
agentmail dispatch retry [--account <name>] [--sender <email>] [--include-deadletter]
agentmail dispatch doctor [--json]
```

Main operator commands:

- `agentmail dispatch status --verbose`
- `agentmail dispatch doctor`

### `agentmail service`

```bash
agentmail service install
agentmail service status
agentmail service uninstall
```

This layer is macOS-specific because it shells out to `launchctl`.

### `agentmail inbox`

```bash
agentmail inbox [--hostname <host>] [--port <port>]
```

## Receive Hooks

If this file exists, it runs after each newly saved inbound message:

- default profile: `~/.agentmail/hooks/on_recieve.sh`
- named profile: `~/.agentmail/profiles/<profile>/hooks/on_recieve.sh`

Helper script:

```bash
./setup-hook.sh
./setup-hook.sh --profile work
./setup-hook.sh --all-profiles
```

Hook environment variables include:

- `AGENTMAIL_HOOK_EVENT`
- `AGENTMAIL_PROFILE`
- `AGENTMAIL_ACCOUNT_EMAIL`
- `AGENTMAIL_MAILBOX`
- `AGENTMAIL_MESSAGE_UID`
- `AGENTMAIL_MESSAGE_ID`
- `AGENTMAIL_MESSAGE_SUBJECT`
- `AGENTMAIL_MESSAGE_FROM`
- `AGENTMAIL_MESSAGE_TO`
- `AGENTMAIL_MESSAGE_CC`
- `AGENTMAIL_MESSAGE_REPLY_TO`
- `AGENTMAIL_MESSAGE_METADATA_FILE`
- `AGENTMAIL_MESSAGE_DIR`

Hook failures are logged as warnings and do not stop receive processing.

## Local Storage Layout

Default profile:

- `~/.agentmail/.env`
- `~/.agentmail/polling.json`
- `~/.agentmail/messages/<timestamp>_uid-<uid>/...`
- `~/.agentmail/sent/<timestamp>_msg-<id>/...`
- `~/.agentmail/hooks/on_recieve.sh`
- `~/.agentmail/receive-watch.lock`

Named profile:

- `~/.agentmail/profiles/<profile>/.env`
- `~/.agentmail/profiles/<profile>/polling.json`
- `~/.agentmail/profiles/<profile>/messages/<timestamp>_uid-<uid>/...`
- `~/.agentmail/profiles/<profile>/sent/<timestamp>_msg-<id>/...`
- `~/.agentmail/profiles/<profile>/hooks/on_recieve.sh`
- `~/.agentmail/profiles/<profile>/receive-watch.lock`

Shared assets:

- `~/.agentmail/agentmail.db`
- `~/.agentmail/logs/bridge.log`
- `~/.agentmail/logs/dispatch.log`
- `~/.openclaw/mail-dispatch/config.json`
- `~/.openclaw/openclaw.json`

## Development

```bash
bun install
bun run typecheck
bun test
```

## Public Repo Hygiene

Do not commit:

- mailbox credentials
- `~/.agentmail/`
- `~/.openclaw/`
- generated local caches
- local log files
- local SQLite files
