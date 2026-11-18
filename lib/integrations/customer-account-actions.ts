import { getDbPool } from "@/lib/db";
import {
  decryptCustomerOAuthValue,
  refreshCustomerOAuthConnection,
  type CustomerOAuthTokenSet,
} from "@/lib/integrations/customer-oauth";

type AccountAction = {
  id: string;
  label: string;
  requiresQuery?: boolean;
};

const ACTIONS: Record<string, AccountAction[]> = {
  google: [
    { id: "gmail.search", label: "Search Gmail", requiresQuery: true },
    { id: "drive.list_files", label: "List Drive files" },
    { id: "calendar.list_events", label: "List Calendar events" },
  ],
  microsoft: [
    { id: "mail.list_messages", label: "List Outlook messages" },
    { id: "drive.list_files", label: "List OneDrive files" },
    { id: "calendar.list_events", label: "List Calendar events" },
  ],
  slack: [
    { id: "channels.list", label: "List public channels" },
    { id: "messages.search", label: "Search messages", requiresQuery: true },
  ],
  dropbox: [{ id: "files.list_folder", label: "List Dropbox files" }],
  box: [{ id: "files.list_root", label: "List Box files" }],
  github: [{ id: "profile.read", label: "Read GitHub profile" }],
  gitlab: [{ id: "projects.list", label: "List GitLab projects" }],
  notion: [{ id: "workspace.search", label: "Search Notion", requiresQuery: true }],
};

export function listCustomerAccountActions(providerId: string): AccountAction[] {
  return ACTIONS[providerId] ?? [];
}

type ConnectionRow = {
  id: string;
  provider_id: string;
  encrypted_tokens: string;
  token_expires_at: string | null;
  status: string;
};

async function loadOwnedConnection(userId: string, connectionId: string): Promise<ConnectionRow> {
  const result = await getDbPool().query<ConnectionRow>(
    `SELECT id, provider_id, encrypted_tokens, token_expires_at, status
       FROM public.balmz_customer_oauth_connections
      WHERE id = $1 AND user_id = $2 AND status = 'connected'
      LIMIT 1`,
    [connectionId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("CUSTOMER_CONNECTION_NOT_FOUND");
  return row;
}

async function readTokens(userId: string, connectionId: string): Promise<{ row: ConnectionRow; tokens: CustomerOAuthTokenSet }> {
  let row = await loadOwnedConnection(userId, connectionId);
  let tokens = JSON.parse(decryptCustomerOAuthValue(row.encrypted_tokens)) as CustomerOAuthTokenSet;
  if (row.token_expires_at && Date.parse(row.token_expires_at) <= Date.now() + 60_000) {
    if (!tokens.refreshToken) throw new Error("CUSTOMER_CONNECTION_REAUTH_REQUIRED");
    await refreshCustomerOAuthConnection(userId, connectionId);
    row = await loadOwnedConnection(userId, connectionId);
    tokens = JSON.parse(decryptCustomerOAuthValue(row.encrypted_tokens)) as CustomerOAuthTokenSet;
  }
  if (!tokens.accessToken) throw new Error("CUSTOMER_CONNECTION_TOKEN_INVALID");
  return { row, tokens };
}

async function providerJson(
  providerId: string,
  url: string,
  token: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: "Bearer " + token,
    Accept: "application/json",
  };
  if (method === "POST") headers["Content-Type"] = "application/json";
  if (providerId === "github") {
    headers["X-GitHub-Api-Version"] = "2022-11-28";
    headers["User-Agent"] = "BALMZ-AI";
  }
  if (providerId === "notion") headers["Notion-Version"] = "2022-06-28";
  if (providerId === "dropbox") headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("CUSTOMER_PROVIDER_UNAVAILABLE");
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error("CUSTOMER_PROVIDER_INVALID_RESPONSE"); }
  if (!response.ok || !payload || typeof payload !== "object") {
    if (response.status === 401 || response.status === 403) throw new Error("CUSTOMER_CONNECTION_REAUTH_REQUIRED");
    if (response.status === 429) throw new Error("CUSTOMER_PROVIDER_RATE_LIMITED");
    throw new Error("CUSTOMER_PROVIDER_REQUEST_FAILED");
  }
  if (Array.isArray(payload)) {
    if (providerId === "gitlab") return { data: payload };
    throw new Error("CUSTOMER_PROVIDER_INVALID_RESPONSE");
  }
  const result = payload as Record<string, unknown>;
  if (providerId === "slack" && result.ok === false) throw new Error("CUSTOMER_PROVIDER_REQUEST_FAILED");
  return result;
}

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function safeList(value: unknown, maxItems = 30): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).slice(0, maxItems)
    : [];
}

function queryUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export async function executeCustomerAccountAction(input: {
  userId: string;
  connectionId: string;
  actionId: string;
  query?: string;
}) {
  const { row, tokens } = await readTokens(input.userId, input.connectionId);
  const action = listCustomerAccountActions(row.provider_id).find((item) => item.id === input.actionId);
  if (!action) throw new Error("CUSTOMER_ACTION_NOT_ALLOWED");
  const query = (input.query ?? "").trim().slice(0, 1200);
  if (action.requiresQuery && query.length < 2) throw new Error("CUSTOMER_ACTION_QUERY_REQUIRED");
  const token = tokens.accessToken;
  let data: Record<string, unknown>[] = [];

  switch (row.provider_id) {
    case "google": {
      if (input.actionId === "gmail.search") {
        const list = await providerJson("google", queryUrl("https://gmail.googleapis.com/gmail/v1/users/me/messages", { q: query, maxResults: "10" }), token);
        const messages = safeList(list.messages, 10);
        const details = await Promise.all(messages.map(async (message) => {
          const id = text(message.id, 200);
          if (!id) return null;
          const detail = await providerJson("google", "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(id), token);
          const payload = detail.payload && typeof detail.payload === "object" ? detail.payload as Record<string, unknown> : {};
          const headers = safeList(payload.headers, 100);
          const header = (name: string) => text(headers.find((item) => text(item.name).toLowerCase() === name.toLowerCase())?.value, 300);
          return { id, threadId: text(detail.threadId, 200), snippet: text(detail.snippet, 1000), subject: header("subject"), from: header("from"), date: header("date") };
        }));
        data = details.filter((item): item is NonNullable<typeof item> => item !== null);
      } else if (input.actionId === "drive.list_files") {
        const result = await providerJson("google", queryUrl("https://www.googleapis.com/drive/v3/files", {
          pageSize: "20",
          orderBy: "modifiedTime desc",
          fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
          q: "trashed = false",
        }), token);
        data = safeList(result.files, 20).map((file) => ({
          id: text(file.id, 200), name: text(file.name, 300), mimeType: text(file.mimeType, 200),
          modifiedTime: text(file.modifiedTime, 80), webViewLink: text(file.webViewLink, 1000),
        }));
      } else if (input.actionId === "calendar.list_events") {
        const result = await providerJson("google", queryUrl("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          maxResults: "20", orderBy: "startTime", singleEvents: "true", timeMin: new Date().toISOString(),
        }), token);
        data = safeList(result.items, 20).map((event) => ({
          id: text(event.id, 200), summary: text(event.summary, 300), status: text(event.status, 50),
          start: event.start, end: event.end, htmlLink: text(event.htmlLink, 1000),
        }));
      }
      break;
    }
    case "microsoft": {
      if (input.actionId === "mail.list_messages") {
        const result = await providerJson("microsoft", queryUrl("https://graph.microsoft.com/v1.0/me/messages", {
          "$top": "20", "$select": "id,subject,from,receivedDateTime,bodyPreview,webLink",
          "$orderby": "receivedDateTime desc",
        }), token);
        data = safeList(result.value, 20).map((message) => {
          const from = message.from && typeof message.from === "object" ? message.from as Record<string, unknown> : {};
          const email = from.emailAddress && typeof from.emailAddress === "object" ? from.emailAddress as Record<string, unknown> : {};
          return {
            id: text(message.id, 300), subject: text(message.subject, 300),
            from: text(email.name, 200) || text(email.address, 200),
            receivedDateTime: text(message.receivedDateTime, 80),
            bodyPreview: text(message.bodyPreview, 700), webLink: text(message.webLink, 1000),
          };
        });
      } else if (input.actionId === "drive.list_files") {
        const result = await providerJson("microsoft", queryUrl("https://graph.microsoft.com/v1.0/me/drive/root/children", {
          "$top": "20", "$select": "id,name,size,lastModifiedDateTime,webUrl,file,folder",
        }), token);
        data = safeList(result.value, 20).map((file) => ({
          id: text(file.id, 300), name: text(file.name, 300), size: file.size,
          lastModifiedDateTime: text(file.lastModifiedDateTime, 80), webUrl: text(file.webUrl, 1000),
          type: file.folder ? "folder" : "file",
        }));
      } else if (input.actionId === "calendar.list_events") {
        const result = await providerJson("microsoft", queryUrl("https://graph.microsoft.com/v1.0/me/events", {
          "$top": "20", "$select": "id,subject,start,end,webLink",
          "$orderby": "start/dateTime",
        }), token);
        data = safeList(result.value, 20).map((event) => ({
          id: text(event.id, 300), subject: text(event.subject, 300),
          start: event.start, end: event.end, webLink: text(event.webLink, 1000),
        }));
      }
      break;
    }
    case "slack": {
      if (input.actionId === "channels.list") {
        const result = await providerJson("slack", queryUrl("https://slack.com/api/conversations.list", {
          types: "public_channel", limit: "50", exclude_archived: "true",
        }), token);
        data = safeList(result.channels, 50).map((channel) => ({
          id: text(channel.id, 100), name: text(channel.name, 200), is_member: channel.is_member === true,
          num_members: typeof channel.num_members === "number" ? channel.num_members : undefined,
        }));
      } else if (input.actionId === "messages.search") {
        const result = await providerJson("slack", queryUrl("https://slack.com/api/search.messages", { query, count: "20", sort: "timestamp", sort_dir: "desc" }), token);
        const matches = result.messages && typeof result.messages === "object" ? result.messages as Record<string, unknown> : {};
        data = safeList(matches.matches, 20).map((message) => ({
          text: text(message.text, 1200), user: text(message.username, 120),
          channel: message.channel && typeof message.channel === "object" ? text((message.channel as Record<string, unknown>).name, 200) : "",
          timestamp: text(message.ts, 80), permalink: text(message.permalink, 1000),
        }));
      }
      break;
    }
    case "dropbox": {
      if (input.actionId === "files.list_folder") {
        const result = await providerJson("dropbox", "https://api.dropboxapi.com/2/files/list_folder", token, "POST", { path: "", recursive: false, limit: 50 });
        data = safeList(result.entries, 50).map((entry) => ({
          id: text(entry.id, 300), name: text(entry.name, 300), path: text(entry.path_display, 500),
          type: entry[".tag"] === "folder" ? "folder" : "file", size: entry.size,
          modified: text(entry.server_modified, 80),
        }));
      }
      break;
    }
    case "box": {
      if (input.actionId === "files.list_root") {
        const result = await providerJson("box", queryUrl("https://api.box.com/2.0/folders/0/items", { limit: "50", fields: "id,name,type,size,modified_at,web_url" }), token);
        data = safeList(result.entries, 50).map((entry) => ({
          id: text(entry.id, 300), name: text(entry.name, 300), type: text(entry.type, 40),
          size: entry.size, modifiedAt: text(entry.modified_at, 80), webUrl: text(entry.web_url, 1000),
        }));
      }
      break;
    }
    case "github": {
      if (input.actionId === "profile.read") {
        const result = await providerJson("github", "https://api.github.com/user", token);
        data = [{
          id: text(result.id, 40), login: text(result.login, 100),
          name: text(result.name, 200), publicRepos: result.public_repos,
          profileUrl: text(result.html_url, 1000),
        }];
      }
      break;
    }
    case "gitlab": {
      if (input.actionId === "projects.list") {
        const result = await providerJson("gitlab", queryUrl("https://gitlab.com/api/v4/projects", {
          membership: "true", simple: "true", per_page: "20", order_by: "last_activity_at",
        }), token);
        const projects = Array.isArray(result.data) ? result.data : [];
        data = safeList(projects, 20).map((project) => ({
          id: project.id, name: text(project.name, 300), pathWithNamespace: text(project.path_with_namespace, 400),
          visibility: text(project.visibility, 40), webUrl: text(project.web_url, 1000),
        }));
      }
      break;
    }
    case "notion": {
      if (input.actionId === "workspace.search") {
        const result = await providerJson("notion", "https://api.notion.com/v1/search", token, "POST", {
          query, page_size: 20, sort: { direction: "descending", timestamp: "last_edited_time" },
        });
        data = safeList(result.results, 20).map((entry) => ({
          id: text(entry.id, 100), url: text(entry.url, 1000), object: text(entry.object, 40),
          title: (() => {
            const title = Array.isArray(entry.title) ? entry.title : Object.values(entry).flatMap((value) => {
              if (!value || typeof value !== "object" || Array.isArray(value)) return [];
              const props = value as Record<string, unknown>;
              return Array.isArray(props.title) ? props.title : [];
            });
            return title.map((part) => part && typeof part === "object" ? text((part as Record<string, unknown>).plain_text, 300) : "").join("").slice(0, 400);
          })(),
        }));
      }
      break;
    }
    default:
      throw new Error("CUSTOMER_ACTION_NOT_ALLOWED");
  }

  const encoded = JSON.stringify(data);
  if (Buffer.byteLength(encoded, "utf8") > 256 * 1024) throw new Error("CUSTOMER_ACTION_RESULT_TOO_LARGE");
  return {
    providerId: row.provider_id,
    actionId: input.actionId,
    count: data.length,
    data,
  };
}
