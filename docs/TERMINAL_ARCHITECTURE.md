# BALMZ AI Termux-style Terminal Architecture

**Status: architecture and security specification — no shell execution is enabled by this document.**

## Product target

Provide a real interactive Linux command-line workspace that feels familiar to Termux on Android while remaining usable in desktop browsers. This is not a simulated terminal and must not execute commands inside the Next.js web process or on the Render application host.

Expected first-release capabilities:
- Interactive Bash-compatible shell, terminal resize, ANSI colors, Ctrl+C, Ctrl+D, Ctrl+L, command history, paste, and mobile keyboard support.
- Persistent per-user home directory and multiple isolated sessions.
- Linux utilities such as `ls`, `cd`, `pwd`, `mkdir`, `cp`, `mv`, `rm`, `cat`, `grep`, `find`, `sed`, `awk`, `tar`, `curl`, and `git`.
- Package management through a controlled Debian/Ubuntu user-space image (APT) or a curated package installer. Termux's `pkg` command may be provided as a compatibility wrapper; it is not the Android Termux package repository.
- Node.js/npm, Python/pip/venv, Git, OpenSSH client, and common build utilities in versioned images.
- Upload/download of workspace files, editor support (initially terminal editors such as nano), and documented resource limits.
- Per-user session listing, stop/restart, and workspace reset with explicit confirmation.

## Required architecture

1. **Next.js web app (Render):** authenticates users, checks plan entitlement and usage, issues short-lived session tickets, and displays the terminal UI.
2. **Terminal gateway:** separate service handling authenticated WebSocket connections, origin validation, rate limiting, session ownership, heartbeat, resize, and stream multiplexing.
3. **Sandbox orchestrator:** creates, resumes, stops, and destroys rootless isolated containers or microVMs. It must not run arbitrary user code in the web process.
4. **Workspace storage:** persistent per-user volume/object storage, mounted only into that user's sandbox with strict ownership and quotas.
5. **Audit/usage service:** records session start/stop, execution time, resource consumption, storage, and policy events without recording secret values or indiscriminately capturing command contents.

Render's standard web service alone is not an appropriate security boundary for multi-tenant arbitrary shell execution. Use a dedicated sandbox/container provider or separately managed isolated worker fleet. Do not mount the Docker socket into user workloads or expose host control-plane credentials.

## Isolation and threat model

- One user cannot see, signal, attach to, or read another user's process, files, environment, sockets, or session metadata.
- Use rootless containers or microVMs, user namespaces, seccomp, AppArmor/SELinux where available, read-only base images, and dropped Linux capabilities.
- Enforce CPU, memory, process-count, disk, session-count, wall-clock, and idle-time limits.
- Deny privileged mode, host networking, host PID/IPC namespaces, device mounts, arbitrary host paths, Docker socket, kernel modules, and nested virtualization unless a separately reviewed use case requires it.
- Apply default-deny outbound network policy with explicit DNS/HTTP(S)/Git allow-lists where feasible. Block cloud metadata endpoints, private infrastructure ranges, database networks, and internal control-plane endpoints.
- Never pass Render, Neon, Paystack, OpenAI, Gemini, X, or BALMZ platform master secrets into the sandbox environment.
- Sandbox API credentials must be scoped, short-lived, revocable, and limited to that user's approved resources.
- Protect the WebSocket with same-site authenticated session checks and a one-time, short-lived ticket bound to user, sandbox, origin, and expiry. Do not put long-lived bearer tokens in query strings.
- Validate terminal message types and payload sizes; enforce backpressure and per-connection rate limits.
- Keep immutable audit events for administrative actions and security-relevant lifecycle events. Avoid logging command output by default because it may contain secrets.

## Persistence and lifecycle

- Allocate a stable workspace ID per user; never derive storage paths from unchecked user input.
- Persist home files independently from the container lifecycle. Container images are disposable and reproducible.
- Support session stop/resume, graceful termination, idle expiry, storage snapshots/backups, user-requested export, and explicit destructive reset.
- File access APIs must resolve paths beneath the user's workspace root and reject traversal, symlink escapes, and cross-user IDs.
- Backups must be encrypted and periodically restore-tested.

## Mobile and desktop UX

- Responsive terminal canvas with dark theme, readable monospace font, copy/paste, touch-friendly Ctrl/Alt/Esc/Tab/arrow-key toolbar, virtual keyboard handling, and reconnect indicator.
- Multiple named tabs/sessions; show session status, current directory when available, resource use, and connection state.
- Distinguish shell output from gateway/system messages.
- Do not display a fake prompt or claim a command ran unless the sandbox actually returned output.
- Offer a file browser and upload/download interface tied to the active user's workspace.
- Clearly disclose ephemeral compute, persistent storage, idle timeouts, package availability, and resource limits.

## API contract (proposed)

- `POST /api/terminal/sessions`: authenticated create/resume request; server checks terminal entitlement, active account, quota, and policy.
- `GET /api/terminal/sessions`: list only the current user's sessions.
- `DELETE /api/terminal/sessions/:id`: stop only a session owned by the current user.
- `POST /api/terminal/sessions/:id/ticket`: mint one-time short-lived WebSocket ticket.
- `wss://<terminal-gateway>/sessions/:id`: interactive terminal stream; validate ticket and ownership before attach.
- `GET/PUT /api/terminal/files/*`: bounded file operations scoped to the current user's home; use streaming and path-safety checks.

Every endpoint must use server-side identity from Better Auth, never a user ID supplied as authorization.

## Usage and subscription policy

Define plan entitlements for concurrent sessions, CPU/memory, storage quota, session duration, monthly compute seconds, outbound network, and package build capability. Do not invent or seed numeric allowances. Missing entitlements deny session creation. Charge usage based on measured sandbox resource consumption and write idempotent usage events. Terminal access must fail closed if the user's subscription or limit cannot be resolved.

## Operational readiness

- Health checks for gateway and orchestrator; no health endpoint reveals environment variables or infrastructure addresses.
- Metrics: active sessions, startup latency, session failures, CPU/memory/disk, bytes streamed, quota rejections, idle shutdowns, and sandbox creation errors.
- Alerts for cross-tenant access attempts, sandbox escape indicators, excessive resource use, unexpected outbound traffic, and gateway error spikes.
- Versioned base images, vulnerability scanning, SBOM, signed image provenance, patch cadence, and emergency image revocation.
- Disaster recovery: persistent volume backup, restore test, orphaned sandbox cleanup, and documented incident response.

## Acceptance tests

- User A cannot list, attach to, stop, or read User B's session or files.
- Expired, reused, wrong-origin, or wrong-user WebSocket tickets are rejected.
- Shell runs in a sandbox and can execute allowed commands; Ctrl+C interrupts the process.
- CPU, memory, process, disk, session, and time limits are enforced.
- Network egress policy blocks cloud metadata and internal private ranges.
- Restarting a sandbox preserves the user's home directory but not the old process state.
- Workspace file APIs reject traversal and symlink escape.
- Revoking a user or entitlement prevents new sessions and closes active sessions according to policy.
- Secrets never appear in sandbox environment, terminal output, logs, or downloadable files.
- Load and isolation tests pass before enabling multiple public users.
