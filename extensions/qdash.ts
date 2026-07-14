import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { QDashClient, defaultConfigPath } from "@oqtopus-team/qdash-client";
import { Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

type QDashQueryParams = {
  profile?: string;
  configPath?: string;
  useEnv?: boolean;
  action:
    | "chips"
    | "default_chip"
    | "metrics_config"
    | "chip_metrics"
    | "chip_qubits"
    | "chip_qubit"
    | "chip_couplings"
    | "chip_coupling"
    | "timeseries"
    | "task_results"
    | "task_result"
    | "task_note"
    | "task_result_issues"
    | "qubit_latest"
    | "qubit_history"
    | "coupling_latest"
    | "coupling_history"
    | "tasks"
    | "task_knowledge"
    | "task_knowledge_markdown"
    | "projects"
    | "project"
    | "files_tree"
    | "file_content"
    | "git_status"
    | "issues"
    | "issue_knowledge"
    | "flows"
    | "flow"
    | "flow_templates"
    | "flow_template"
    | "flow_helper_files"
    | "flow_helper_file"
    | "executions"
    | "execution"
    | "ai_reviews"
    | "ai_review_runs"
    | "ai_review_run"
    | "forum_posts"
    | "provenance_stats"
    | "provenance_history"
    | "provenance_changes"
    | "provenance_lineage"
    | "provenance_impact";
  chipId?: string;
  qid?: string;
  couplingId?: string;
  taskId?: string;
  taskName?: string;
  task?: string;
  projectId?: string;
  path?: string;
  flowName?: string;
  templateId?: string;
  filename?: string;
  executionId?: string;
  reviewRunId?: string;
  entityId?: string;
  parameter?: string;
  parameterName?: string;
  tag?: string;
  date?: string;
  backend?: string;
  status?: string;
  decision?: string;
  username?: string;
  messageContains?: string;
  startAt?: string;
  endAt?: string;
  startFrom?: string;
  startTo?: string;
  isClosed?: boolean;
  latestOnly?: boolean;
  withinHours?: number;
  limit?: number;
  skip?: number;
  offset?: number;
};

type RawGetParams = {
  profile?: string;
  configPath?: string;
  useEnv?: boolean;
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
};

type ConfirmableParams = {
  confirmWrite?: boolean;
};

type QDashContextState = {
  profile?: string;
  chipId?: string;
  agentSessionId?: string;
};

const CONTEXT_ENTRY_TYPE = "qdash-context";
const WRITE_TOOL_NAMES = new Set([
  "qdash_create_agent_session",
  "qdash_submit_agent_action",
  "qdash_commit_agent_candidate",
  "qdash_create_forum_post",
  "qdash_update_forum_post",
]);
let currentContext: QDashContextState = {};

function applyQDashContext<T extends { profile?: string; chipId?: string; sessionId?: string }>(params: T): T {
  return {
    ...params,
    profile: params.profile ?? currentContext.profile,
    chipId: params.chipId ?? currentContext.chipId,
    sessionId: params.sessionId ?? currentContext.agentSessionId,
  };
}

function contextSummary(): string {
  const profile = currentContext.profile ?? "env/default";
  const chip = currentContext.chipId ?? "auto-chip";
  const session = currentContext.agentSessionId ? ` session:${shortId(currentContext.agentSessionId)}` : "";
  return `qdash ${profile} ${chip}${session}`;
}

function shortId(value: string, length = 10): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

const QueryAction = Type.Union([
  Type.Literal("chips"),
  Type.Literal("default_chip"),
  Type.Literal("metrics_config"),
  Type.Literal("chip_metrics"),
  Type.Literal("chip_qubits"),
  Type.Literal("chip_qubit"),
  Type.Literal("chip_couplings"),
  Type.Literal("chip_coupling"),
  Type.Literal("timeseries"),
  Type.Literal("task_results"),
  Type.Literal("task_result"),
  Type.Literal("task_note"),
  Type.Literal("task_result_issues"),
  Type.Literal("qubit_latest"),
  Type.Literal("qubit_history"),
  Type.Literal("coupling_latest"),
  Type.Literal("coupling_history"),
  Type.Literal("tasks"),
  Type.Literal("task_knowledge"),
  Type.Literal("task_knowledge_markdown"),
  Type.Literal("projects"),
  Type.Literal("project"),
  Type.Literal("files_tree"),
  Type.Literal("file_content"),
  Type.Literal("git_status"),
  Type.Literal("issues"),
  Type.Literal("issue_knowledge"),
  Type.Literal("flows"),
  Type.Literal("flow"),
  Type.Literal("flow_templates"),
  Type.Literal("flow_template"),
  Type.Literal("flow_helper_files"),
  Type.Literal("flow_helper_file"),
  Type.Literal("executions"),
  Type.Literal("execution"),
  Type.Literal("ai_reviews"),
  Type.Literal("ai_review_runs"),
  Type.Literal("ai_review_run"),
  Type.Literal("forum_posts"),
  Type.Literal("provenance_stats"),
  Type.Literal("provenance_history"),
  Type.Literal("provenance_changes"),
  Type.Literal("provenance_lineage"),
  Type.Literal("provenance_impact"),
]);

const connectionParams = {
  profile: Type.Optional(Type.String({ description: "QDash profile name. Defaults to env when QDASH_BASE_URL is set, otherwise 'default'." })),
  configPath: Type.Optional(Type.String({ description: "Optional path to qdash config.ini." })),
  useEnv: Type.Optional(Type.Boolean({ description: "Force QDASH_* environment variables instead of a profile." })),
};

const paginationParams = {
  limit: Type.Optional(Type.Number()),
  skip: Type.Optional(Type.Number()),
  offset: Type.Optional(Type.Number()),
};

const chipScopedParams = {
  chipId: Type.Optional(Type.String({ description: "Chip ID. Defaults to the active/default chip when omitted." })),
};

const querySchema = Type.Object({
  ...connectionParams,
  action: QueryAction,
  chipId: Type.Optional(Type.String({ description: "Chip ID. Defaults to the active/default chip for chip-scoped actions when omitted." })),
  qid: Type.Optional(Type.String()),
  couplingId: Type.Optional(Type.String()),
  taskId: Type.Optional(Type.String()),
  taskName: Type.Optional(Type.String()),
  task: Type.Optional(Type.String({ description: "Task parameter used by latest/history endpoints." })),
  projectId: Type.Optional(Type.String()),
  path: Type.Optional(Type.String({ description: "Project file path for file_content." })),
  flowName: Type.Optional(Type.String()),
  templateId: Type.Optional(Type.String()),
  filename: Type.Optional(Type.String()),
  executionId: Type.Optional(Type.String()),
  reviewRunId: Type.Optional(Type.String()),
  entityId: Type.Optional(Type.String()),
  parameter: Type.Optional(Type.String({ description: "Metric/parameter name for timeseries." })),
  parameterName: Type.Optional(Type.String()),
  tag: Type.Optional(Type.String()),
  date: Type.Optional(Type.String({ description: "History date, usually YYYYMMDD." })),
  backend: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  decision: Type.Optional(Type.String()),
  username: Type.Optional(Type.String()),
  messageContains: Type.Optional(Type.String()),
  startAt: Type.Optional(Type.String()),
  endAt: Type.Optional(Type.String()),
  startFrom: Type.Optional(Type.String()),
  startTo: Type.Optional(Type.String()),
  isClosed: Type.Optional(Type.Boolean()),
  latestOnly: Type.Optional(Type.Boolean()),
  withinHours: Type.Optional(Type.Number()),
  limit: Type.Optional(Type.Number()),
  skip: Type.Optional(Type.Number()),
  offset: Type.Optional(Type.Number()),
});

function shouldUseEnv(params: { useEnv?: boolean; profile?: string; configPath?: string }): boolean {
  if (params.useEnv !== undefined) return params.useEnv;
  return !params.profile && !params.configPath && Boolean(process.env.QDASH_BASE_URL);
}

async function makeClient(params: { useEnv?: boolean; profile?: string; configPath?: string }): Promise<QDashClient> {
  params = applyQDashContext(params);
  if (shouldUseEnv(params)) return QDashClient.fromEnv();
  return QDashClient.fromProfile(params.profile ?? "default", params.configPath);
}

async function defaultChipId(client: QDashClient, chipId?: string): Promise<string> {
  return chipId ?? currentContext.chipId ?? client.getDefaultChipId();
}

async function rawGet<T>(client: QDashClient, path: string, query?: Record<string, unknown>): Promise<T> {
  return (client as unknown as { get<T>(path: string, query?: Record<string, unknown>): Promise<T> }).get(path, cleanQuery(query));
}

function cleanQuery(values: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null));
}

function pathPart(value: string): string {
  return encodeURIComponent(value);
}

function requireValue(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for this QDash action`);
  return value;
}

function safeConfig(client: QDashClient, source: string) {
  const config = client.config;
  return {
    source,
    baseUrl: config.baseUrl,
    projectId: config.projectId ?? null,
    timeoutSeconds: config.timeoutSeconds,
    verifyTls: config.verifyTls,
    proxyConfigured: Boolean(config.proxy),
    apiTokenConfigured: Boolean(config.apiToken),
    cloudflareAccessConfigured: Boolean(config.cfAccessClientId || config.cfAccessClientSecret),
    userAgent: config.userAgent,
    retry: config.retry,
  };
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (/token|password|secret|authorization|api[_-]?key/i.test(key)) return [key, "[redacted]"];
        return [key, redact(item)];
      }),
    );
  }
  return value;
}

function toToolResult(data: unknown, details: Record<string, unknown> = {}) {
  const safeData = redact(data);
  let text = JSON.stringify(safeData, null, 2);
  if (text.length > 20_000) text = `${text.slice(0, 20_000)}\n... [truncated]`;
  return {
    content: [{ type: "text" as const, text }],
    details: { ...details, data: safeData },
  };
}

function toTextToolResult(text: string, data: unknown, details: Record<string, unknown> = {}) {
  const safeData = redact(data);
  return {
    content: [{ type: "text" as const, text }],
    details: { ...details, data: safeData },
  };
}

function configProfiles(configPath = defaultConfigPath()): { path: string; exists: boolean; profiles: string[] } {
  if (!existsSync(configPath)) return { path: configPath, exists: false, profiles: [] };
  const contents = readFileSync(configPath, "utf8");
  const profiles = [...contents.matchAll(/^\s*\[([^\]]+)]\s*$/gm)].map((m) => m[1]);
  return { path: configPath, exists: true, profiles };
}

function arrayFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const object = payload as Record<string, unknown>;
    for (const key of ["items", "results", "data", "issues", "executions", "chips", "tasks"]) {
      if (Array.isArray(object[key])) return object[key];
    }
  }
  return [];
}

function compactItems(payload: unknown, keys: string[], limit: number): Record<string, unknown>[] {
  return arrayFromPayload(payload).slice(0, limit).map((item) => {
    if (!item || typeof item !== "object") return { value: item };
    const object = item as Record<string, unknown>;
    return Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, object[key]]));
  });
}

function payloadTotal(payload: unknown): number {
  const fallback = arrayFromPayload(payload).length;
  if (!payload || typeof payload !== "object") return fallback;
  const object = payload as Record<string, unknown>;
  for (const key of ["total", "total_count", "count", "total_items"]) {
    const value = object[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

function firstString(object: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function statusIcon(status: string | undefined): string {
  const normalized = status?.toLowerCase() ?? "";
  if (["completed", "success", "succeeded", "active", "applied"].includes(normalized)) return "✓";
  if (["failed", "error", "crashed"].includes(normalized)) return "✗";
  if (["running", "pending", "queued", "in_progress"].includes(normalized)) return "…";
  if (["cancelled", "canceled"].includes(normalized)) return "-";
  return "•";
}

function formatItem(item: Record<string, unknown>, fallbackId: string): string {
  const id = firstString(item, ["issue_id", "execution_id", "flow_run_id", "task_id", "id"]) ?? fallbackId;
  const title = firstString(item, ["title", "task_name", "flow_name", "name"]);
  const status = firstString(item, ["status", "execution_status", "activity_status"]);
  const target = firstString(item, ["qid", "coupling_id"]);
  return [statusIcon(status), shortId(id, 14), title, target ? `(${target})` : undefined, status ? `[${status}]` : undefined]
    .filter(Boolean)
    .join(" ");
}

async function buildDashboard(params: { profile?: string; configPath?: string; useEnv?: boolean; chipId?: string; limit?: number }) {
  params = applyQDashContext(params);
  const limit = params.limit ?? 5;
  const client = await makeClient(params);
  const chipId = await defaultChipId(client, params.chipId);
  const [chips, openIssues, recentExecutions, failedTaskResults, provenanceStats] = await Promise.allSettled([
    client.listChips(),
    rawGet(client, "/issues", { is_closed: false, limit }),
    rawGet(client, "/executions", { chip_id: chipId, limit }),
    rawGet(client, "/task-results", { chip_id: chipId, status: "failed", limit }),
    client.getProvenanceStats(),
  ]);
  const value = <T>(result: PromiseSettledResult<T>): T | { error: string } => result.status === "fulfilled" ? result.value : { error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
  const issuesPayload = value(openIssues);
  const executionsPayload = value(recentExecutions);
  const failedTasksPayload = value(failedTaskResults);
  return {
    context: { ...currentContext, profile: params.profile ?? currentContext.profile, chipId },
    chips: value(chips),
    openIssues: {
      count: payloadTotal(issuesPayload),
      shown: arrayFromPayload(issuesPayload).length,
      items: compactItems(issuesPayload, ["issue_id", "id", "title", "task_id", "is_closed", "severity", "created_at"], limit),
      raw: issuesPayload,
    },
    recentExecutions: {
      count: payloadTotal(executionsPayload),
      shown: arrayFromPayload(executionsPayload).length,
      items: compactItems(executionsPayload, ["execution_id", "flow_run_id", "flow_name", "status", "created_at", "started_at", "finished_at"], limit),
      raw: executionsPayload,
    },
    failedTaskResults: {
      count: payloadTotal(failedTasksPayload),
      shown: arrayFromPayload(failedTasksPayload).length,
      items: compactItems(failedTasksPayload, ["task_id", "task_name", "status", "qid", "coupling_id", "start_at", "created_at"], limit),
      raw: failedTasksPayload,
    },
    provenanceStats: value(provenanceStats),
  };
}

function ansi(code: string, text: string): string {
  return `\u001b[${code}m${text}\u001b[0m`;
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function displayWidth(text: string): number {
  return visibleWidth(stripAnsi(text));
}

function padAnsi(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

function truncateDisplay(text: string, width: number): string {
  if (displayWidth(text) <= width) return text;
  const ellipsis = "…";
  const target = Math.max(0, width - visibleWidth(ellipsis));
  let out = "";
  let used = 0;
  for (const char of Array.from(text)) {
    const charWidth = visibleWidth(char);
    if (used + charWidth > target) break;
    out += char;
    used += charWidth;
  }
  return out + ellipsis;
}

function boxed(title: string, body: string[], color = false): string[] {
  const plainTitle = ` ${title} `;
  const contentWidth = Math.min(
    92,
    Math.max(36, ...body.map((line) => displayWidth(line)), visibleWidth(plainTitle)),
  );
  const innerWidth = contentWidth + 2;
  const borderColor = (text: string) => color ? ansi("90", text) : text;
  const titleText = color ? ansi("1;36", plainTitle) : plainTitle;
  const top = borderColor("╭") + titleText + borderColor("─".repeat(Math.max(0, innerWidth - plainTitle.length))) + borderColor("╮");
  const bottom = borderColor("╰" + "─".repeat(innerWidth) + "╯");
  return [
    top,
    ...body.map((line) => {
      const clipped = color ? truncateToWidth(line, contentWidth) : truncateDisplay(line, contentWidth);
      return `${borderColor("│")} ${padAnsi(clipped, contentWidth)} ${borderColor("│")}`;
    }),
    bottom,
  ];
}

function dashboardLines(dashboard: Awaited<ReturnType<typeof buildDashboard>>, color = false): string[] {
  const chips = arrayFromPayload(dashboard.chips);
  const profile = dashboard.context.profile ?? "env/default";
  const session = dashboard.context.agentSessionId ? shortId(dashboard.context.agentSessionId) : "none";
  const accent = (text: string) => color ? ansi("1;36", text) : text;
  const muted = (text: string) => color ? ansi("90", text) : text;
  const dim = (text: string) => color ? ansi("2", text) : text;
  const success = (text: string) => color ? ansi("32", text) : text;
  const warning = (text: string) => color ? ansi("33", text) : text;
  const error = (text: string) => color ? ansi("31", text) : text;
  const issueCount = dashboard.openIssues.count > 0 ? warning(String(dashboard.openIssues.count)) : success(String(dashboard.openIssues.count));
  const failedCount = dashboard.failedTaskResults.count > 0 ? error(`${dashboard.failedTaskResults.shown}/${dashboard.failedTaskResults.count}`) : success(`${dashboard.failedTaskResults.shown}/${dashboard.failedTaskResults.count}`);
  return boxed("QDash Harness", [
    `${muted("profile")} ${accent(profile)}   ${muted("chip")} ${accent(dashboard.context.chipId)}   ${muted("session")} ${dim(session)}`,
    `${muted("chips")} ${success(String(chips.length))}   ${muted("open issues")} ${issueCount}   ${muted("executions")} ${accent(`${dashboard.recentExecutions.shown}/${dashboard.recentExecutions.count}`)}   ${muted("failed tasks")} ${failedCount}`,
    "",
    accent("Open issues"),
    ...(dashboard.openIssues.items.length > 0 ? dashboard.openIssues.items.map((item, index) => `  ${warning(formatItem(item, `issue-${index + 1}`))}`) : [`  ${dim("none")}`]),
    "",
    accent("Recent executions"),
    ...(dashboard.recentExecutions.items.length > 0 ? dashboard.recentExecutions.items.map((item, index) => `  ${muted(formatItem(item, `exec-${index + 1}`))}`) : [`  ${dim("none")}`]),
    "",
    accent("Failed task results"),
    ...(dashboard.failedTaskResults.items.length > 0 ? dashboard.failedTaskResults.items.map((item, index) => `  ${error(formatItem(item, `task-${index + 1}`))}`) : [`  ${dim("none")}`]),
  ], color);
}

function styledDashboardLines(dashboard: Awaited<ReturnType<typeof buildDashboard>>, theme: Theme): string[] {
  const chips = arrayFromPayload(dashboard.chips);
  const profile = dashboard.context.profile ?? "env/default";
  const session = dashboard.context.agentSessionId ? shortId(dashboard.context.agentSessionId) : "none";
  const issueColor = dashboard.openIssues.count > 0 ? "warning" : "success";
  const failedColor = dashboard.failedTaskResults.count > 0 ? "error" : "success";
  return [
    theme.fg("accent", theme.bold("QDash Harness")),
    `${theme.fg("muted", "profile")} ${theme.fg("accent", profile)}  ${theme.fg("muted", "chip")} ${theme.fg("accent", dashboard.context.chipId)}  ${theme.fg("muted", "session")} ${theme.fg("dim", session)}`,
    "",
    [
      `${theme.fg("muted", "chips")} ${theme.fg("success", String(chips.length))}`,
      `${theme.fg("muted", "open issues")} ${theme.fg(issueColor, String(dashboard.openIssues.count))}`,
      `${theme.fg("muted", "executions")} ${theme.fg("accent", `${dashboard.recentExecutions.shown}/${dashboard.recentExecutions.count}`)}`,
      `${theme.fg("muted", "failed tasks")} ${theme.fg(failedColor, `${dashboard.failedTaskResults.shown}/${dashboard.failedTaskResults.count}`)}`,
    ].join("   "),
    "",
    theme.fg("borderAccent", "Open issues"),
    ...(dashboard.openIssues.items.length > 0
      ? dashboard.openIssues.items.map((item, index) => `  ${theme.fg("warning", formatItem(item, `issue-${index + 1}`))}`)
      : [`  ${theme.fg("dim", "none")}`]),
    "",
    theme.fg("borderAccent", "Recent executions"),
    ...(dashboard.recentExecutions.items.length > 0
      ? dashboard.recentExecutions.items.map((item, index) => `  ${theme.fg("muted", formatItem(item, `exec-${index + 1}`))}`)
      : [`  ${theme.fg("dim", "none")}`]),
    "",
    theme.fg("borderAccent", "Failed task results"),
    ...(dashboard.failedTaskResults.items.length > 0
      ? dashboard.failedTaskResults.items.map((item, index) => `  ${theme.fg("error", formatItem(item, `task-${index + 1}`))}`)
      : [`  ${theme.fg("dim", "none")}`]),
  ];
}

function dashboardComponent(dashboard: Awaited<ReturnType<typeof buildDashboard>>, theme: Theme) {
  return {
    render(width: number) {
      const border = theme.fg("borderMuted", "─".repeat(Math.max(0, Math.min(width, 80))));
      return [border, ...styledDashboardLines(dashboard, theme), border].map((line) => truncateToWidth(line, width));
    },
    invalidate() {},
  };
}

function forumPostsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  if (payload && typeof payload === "object") {
    const object = payload as Record<string, unknown>;
    for (const key of ["posts", "items", "results", "data"]) {
      if (Array.isArray(object[key])) return object[key].filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }
  }
  return [];
}

function forumPostId(post: Record<string, unknown>): string {
  return firstString(post, ["post_id", "id", "forum_post_id"]) ?? "unknown";
}

function forumPostTitle(post: Record<string, unknown>): string {
  return firstString(post, ["title", "subject", "summary"]) ?? firstString(post, ["content", "body", "text"])?.slice(0, 60) ?? "(untitled)";
}

function forumPostLine(post: Record<string, unknown>): string {
  const id = shortId(forumPostId(post), 18);
  const title = forumPostTitle(post);
  const status = firstString(post, ["status"]);
  const category = firstString(post, ["category"]);
  const target = firstString(post, ["target_id", "chip_id", "task_id", "qid"]);
  return ["•", id, title, category ? `[${category}]` : undefined, status ? `[${status}]` : undefined, target ? `(${target})` : undefined]
    .filter(Boolean)
    .join(" ");
}

function forumListLines(payload: unknown, title = "QDash Forum", color = false): string[] {
  const posts = forumPostsFromPayload(payload);
  const total = payloadTotal(payload);
  const accent = (text: string) => color ? ansi("1;36", text) : text;
  const dim = (text: string) => color ? ansi("2", text) : text;
  return boxed(title, [
    `posts ${accent(`${posts.length}/${total}`)}`,
    "",
    ...(posts.length > 0 ? posts.map((post) => `  ${forumPostLine(post)}`) : [`  ${dim("none")}`]),
  ], color);
}

function forumDetailLines(post: unknown, title = "QDash Forum Post", color = false): string[] {
  const object = post && typeof post === "object" ? post as Record<string, unknown> : {};
  const accent = (text: string) => color ? ansi("1;36", text) : text;
  const muted = (text: string) => color ? ansi("90", text) : text;
  const content = firstString(object, ["content", "body", "text", "message", "description"]);
  return boxed(title, [
    `${muted("id")} ${accent(forumPostId(object))}`,
    `${muted("title")} ${forumPostTitle(object)}`,
    firstString(object, ["status"]) ? `${muted("status")} ${firstString(object, ["status"])}` : undefined,
    firstString(object, ["category"]) ? `${muted("category")} ${firstString(object, ["category"])}` : undefined,
    "",
    ...(content ? content.split("\n").slice(0, 8).map((line) => `  ${line}`) : ["  (no content)"]),
  ].filter((line): line is string => typeof line === "string"), color);
}

function textComponent(lines: string[], theme: Theme) {
  return {
    render(width: number) {
      return lines.map((line) => truncateToWidth(line, width));
    },
    invalidate() {},
  };
}

async function executeQuery(params: QDashQueryParams) {
  params = applyQDashContext(params);
  const client = await makeClient(params);
  switch (params.action) {
    case "chips": return client.listChips();
    case "default_chip": return client.getDefaultChip();
    case "metrics_config": return client.getMetricsConfig();
    case "chip_metrics": return client.getChipMetrics(await defaultChipId(client, params.chipId));
    case "chip_qubits": return client.listChipQubits(await defaultChipId(client, params.chipId), { limit: params.limit, offset: params.offset });
    case "chip_qubit": return client.getChipQubit(await defaultChipId(client, params.chipId), requireValue(params.qid, "qid"));
    case "chip_couplings": return client.listChipCouplings(await defaultChipId(client, params.chipId), { limit: params.limit, offset: params.offset });
    case "chip_coupling": return client.getChipCoupling(await defaultChipId(client, params.chipId), requireValue(params.couplingId, "couplingId"));
    case "timeseries": return client.getTaskResultsTimeseries({ chipId: await defaultChipId(client, params.chipId), parameter: requireValue(params.parameter, "parameter"), tag: params.tag, qid: params.qid, startAt: requireValue(params.startAt, "startAt"), endAt: requireValue(params.endAt, "endAt") });
    case "task_results": return rawGet(client, "/task-results", { chip_id: params.chipId, task_name: params.taskName, qid: params.qid, coupling_id: params.couplingId, execution_id: params.executionId, username: params.username, status: params.status, start_from: params.startFrom ?? params.startAt, start_to: params.startTo ?? params.endAt, message_contains: params.messageContains, limit: params.limit, skip: params.skip });
    case "task_result": return client.getTaskResult(requireValue(params.taskId, "taskId"));
    case "task_note": return rawGet(client, `/task-results/${pathPart(requireValue(params.taskId, "taskId"))}/note`);
    case "task_result_issues": return rawGet(client, `/task-results/${pathPart(requireValue(params.taskId, "taskId"))}/issues`);
    case "qubit_latest": return rawGet(client, "/task-results/qubits/latest", { chip_id: await defaultChipId(client, params.chipId), task: requireValue(params.task ?? params.taskName, "task") });
    case "qubit_history": return rawGet(client, `/task-results/qubits/${pathPart(requireValue(params.qid, "qid"))}/history`, { chip_id: await defaultChipId(client, params.chipId), task: requireValue(params.task ?? params.taskName, "task"), date: requireValue(params.date, "date") });
    case "coupling_latest": return rawGet(client, "/task-results/couplings/latest", { chip_id: await defaultChipId(client, params.chipId), task: requireValue(params.task ?? params.taskName, "task") });
    case "coupling_history": return rawGet(client, `/task-results/couplings/${pathPart(requireValue(params.couplingId, "couplingId"))}/history`, { chip_id: await defaultChipId(client, params.chipId), task: requireValue(params.task ?? params.taskName, "task"), date: requireValue(params.date, "date") });
    case "tasks": return client.listTasks(params.backend);
    case "task_knowledge": return params.taskName ? client.getTaskKnowledge(params.taskName) : client.listTaskKnowledge();
    case "task_knowledge_markdown": return client.getTaskKnowledgeMarkdown(requireValue(params.taskName, "taskName"));
    case "projects": return client.listProjects();
    case "project": return client.getProject(requireValue(params.projectId, "projectId"));
    case "files_tree": return client.getFilesTree();
    case "file_content": return client.getFileContent(requireValue(params.path, "path"));
    case "git_status": return client.getGitStatus();
    case "issues": return rawGet(client, "/issues", { task_id: params.taskId, is_closed: params.isClosed, limit: params.limit, skip: params.skip });
    case "issue_knowledge": return rawGet(client, "/issue-knowledge", { status: params.status, task_name: params.taskName, limit: params.limit, skip: params.skip });
    case "flows": return client.listFlows();
    case "flow": return client.getFlow(requireValue(params.flowName, "flowName"));
    case "flow_templates": return client.listFlowTemplates();
    case "flow_template": return client.getFlowTemplate(requireValue(params.templateId, "templateId"));
    case "flow_helper_files": return rawGet(client, "/flows/helpers");
    case "flow_helper_file": return rawGet(client, `/flows/helpers/${pathPart(requireValue(params.filename, "filename"))}`);
    case "executions": return rawGet(client, "/executions", { chip_id: params.chipId, flow_name: params.flowName, status: params.status, skip: params.skip, limit: params.limit });
    case "execution": return client.getExecution(requireValue(params.executionId, "executionId"));
    case "ai_reviews": return rawGet(client, "/task-results/ai-review", { chip_id: params.chipId, task_name: params.taskName, status: params.status, decision: params.decision, latest_only: params.latestOnly, skip: params.skip, limit: params.limit });
    case "ai_review_runs": return rawGet(client, "/task-results/ai-review/runs", { chip_id: params.chipId, task_name: params.taskName, skip: params.skip, limit: params.limit });
    case "ai_review_run": return rawGet(client, `/task-results/ai-review/runs/${pathPart(requireValue(params.reviewRunId, "reviewRunId"))}`);
    case "forum_posts": return client.listForumPosts({ status: params.status, chipId: params.chipId, limit: params.limit, skip: params.skip });
    case "provenance_stats": return client.getProvenanceStats();
    case "provenance_history": return rawGet(client, "/provenance/history", { parameter_name: params.parameterName ?? params.parameter, qid: params.qid, limit: params.limit });
    case "provenance_changes": return rawGet(client, "/provenance/changes", { parameter_names: params.parameterName ?? params.parameter, within_hours: params.withinHours, limit: params.limit });
    case "provenance_lineage": return client.getProvenanceLineage(requireValue(params.entityId, "entityId"));
    case "provenance_impact": return client.getProvenanceImpact(requireValue(params.entityId, "entityId"));
  }
}

export default function qdashExtension(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!WRITE_TOOL_NAMES.has(event.toolName)) return;
    const input = event.input as { confirmWrite?: boolean };
    if (input.confirmWrite === true) return;

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `${event.toolName} is a QDash write operation and requires confirmWrite: true in non-interactive mode.`,
      };
    }

    const ok = await ctx.ui.confirm(
      "Approve QDash write operation?",
      `${event.toolName} will create or modify data in QDash. Continue?`,
    );
    if (!ok) return { block: true, reason: "QDash write operation rejected by user" };
    input.confirmWrite = true;
  });

  pi.registerTool({
    name: "qdash_config_info",
    label: "QDash Config Info",
    description: "Show non-secret QDash client configuration and available local profiles.",
    promptSnippet: "Inspect QDash profile availability and non-secret connection settings",
    promptGuidelines: ["Use qdash_config_info before QDash queries when profile or configuration is unclear. Never expose QDash secrets."],
    parameters: Type.Object(connectionParams),
    async execute(_toolCallId, params: { profile?: string; configPath?: string; useEnv?: boolean }) {
      const profiles = configProfiles(params.configPath);
      try {
        const client = await makeClient(params);
        return toToolResult({ profiles, active: safeConfig(client, shouldUseEnv(params) ? "env" : `profile:${params.profile ?? "default"}`) });
      } catch (error) {
        return toToolResult({ profiles, error: error instanceof Error ? error.message : String(error) });
      }
    },
  });

  pi.registerTool({
    name: "qdash_query",
    label: "QDash Query",
    description: "Run common read-only QDash queries via @oqtopus-team/qdash-client.",
    promptSnippet: "Query QDash chips, metrics, tasks, files, flows, executions, projects, forum posts, and provenance",
    promptGuidelines: [
      "Prefer dedicated QDash tools such as qdash_list_chips, qdash_get_chip_metrics, qdash_list_task_results, qdash_list_issues, qdash_list_flows, and qdash_list_executions when they match the task.",
      "Use qdash_query for read-only QDash data access not covered by a dedicated tool, instead of curl or scraping the UI.",
      "Ask for confirmation before using operational or write APIs; qdash_query intentionally exposes read-only operations only.",
      "Never expose QDash tokens, passwords, or Cloudflare Access secrets.",
    ],
    parameters: querySchema,
    async execute(_toolCallId, params: QDashQueryParams) {
      const data = await executeQuery(params);
      return toToolResult(data, { action: params.action });
    },
  });

  const registerQueryTool = (tool: {
    name: string;
    label: string;
    description: string;
    promptSnippet: string;
    action: QDashQueryParams["action"];
    parameters: ReturnType<typeof Type.Object>;
  }) => {
    pi.registerTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      promptSnippet: tool.promptSnippet,
      promptGuidelines: [
        `Prefer ${tool.name} for this specific read-only QDash operation instead of qdash_query or qdash_raw_get.`,
        "Never expose QDash tokens, passwords, or Cloudflare Access secrets.",
      ],
      parameters: tool.parameters,
      async execute(_toolCallId, params: Omit<QDashQueryParams, "action">) {
        const data = await executeQuery({ ...params, action: tool.action });
        return toToolResult(data, { action: tool.action, tool: tool.name });
      },
    });
  };

  registerQueryTool({
    name: "qdash_list_chips",
    label: "QDash List Chips",
    description: "List QDash chips through qdash-client.",
    promptSnippet: "List QDash chips and their status",
    action: "chips",
    parameters: Type.Object(connectionParams),
  });

  registerQueryTool({
    name: "qdash_get_default_chip",
    label: "QDash Default Chip",
    description: "Get the active/default QDash chip.",
    promptSnippet: "Get the default active QDash chip",
    action: "default_chip",
    parameters: Type.Object(connectionParams),
  });

  registerQueryTool({
    name: "qdash_get_chip_metrics",
    label: "QDash Chip Metrics",
    description: "Get metrics for a chip. If chipId is omitted, the default chip is used.",
    promptSnippet: "Get QDash chip metrics for the default or specified chip",
    action: "chip_metrics",
    parameters: Type.Object({ ...connectionParams, ...chipScopedParams }),
  });

  registerQueryTool({
    name: "qdash_list_chip_qubits",
    label: "QDash List Chip Qubits",
    description: "List qubits for a chip. If chipId is omitted, the default chip is used.",
    promptSnippet: "List qubits for a QDash chip",
    action: "chip_qubits",
    parameters: Type.Object({ ...connectionParams, ...chipScopedParams, ...paginationParams }),
  });

  registerQueryTool({
    name: "qdash_list_chip_couplings",
    label: "QDash List Chip Couplings",
    description: "List couplings for a chip. If chipId is omitted, the default chip is used.",
    promptSnippet: "List couplings for a QDash chip",
    action: "chip_couplings",
    parameters: Type.Object({ ...connectionParams, ...chipScopedParams, ...paginationParams }),
  });

  registerQueryTool({
    name: "qdash_get_timeseries",
    label: "QDash Timeseries",
    description: "Get task-result timeseries for a parameter and time range.",
    promptSnippet: "Get QDash task-result timeseries for a parameter over a time range",
    action: "timeseries",
    parameters: Type.Object({
      ...connectionParams,
      ...chipScopedParams,
      parameter: Type.String(),
      startAt: Type.String({ description: "Start timestamp, preferably UTC ISO with Z." }),
      endAt: Type.String({ description: "End timestamp, preferably UTC ISO with Z." }),
      qid: Type.Optional(Type.String()),
      tag: Type.Optional(Type.String()),
    }),
  });

  registerQueryTool({
    name: "qdash_list_task_results",
    label: "QDash List Task Results",
    description: "List task results with common filters.",
    promptSnippet: "List QDash task results with filters such as chip, task, status, qubit, coupling, or time range",
    action: "task_results",
    parameters: Type.Object({
      ...connectionParams,
      chipId: Type.Optional(Type.String()),
      taskName: Type.Optional(Type.String()),
      qid: Type.Optional(Type.String()),
      couplingId: Type.Optional(Type.String()),
      executionId: Type.Optional(Type.String()),
      username: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
      startAt: Type.Optional(Type.String()),
      endAt: Type.Optional(Type.String()),
      startFrom: Type.Optional(Type.String()),
      startTo: Type.Optional(Type.String()),
      messageContains: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Number()),
      skip: Type.Optional(Type.Number()),
    }),
  });

  registerQueryTool({
    name: "qdash_get_task_result",
    label: "QDash Task Result",
    description: "Get a single task result by taskId.",
    promptSnippet: "Get a QDash task result by task ID",
    action: "task_result",
    parameters: Type.Object({ ...connectionParams, taskId: Type.String() }),
  });

  registerQueryTool({
    name: "qdash_list_issues",
    label: "QDash List Issues",
    description: "List QDash issues with optional task/closed filters.",
    promptSnippet: "List QDash issues",
    action: "issues",
    parameters: Type.Object({ ...connectionParams, taskId: Type.Optional(Type.String()), isClosed: Type.Optional(Type.Boolean()), limit: Type.Optional(Type.Number()), skip: Type.Optional(Type.Number()) }),
  });

  registerQueryTool({
    name: "qdash_list_flows",
    label: "QDash List Flows",
    description: "List QDash flows.",
    promptSnippet: "List QDash flows",
    action: "flows",
    parameters: Type.Object(connectionParams),
  });

  registerQueryTool({
    name: "qdash_get_flow",
    label: "QDash Get Flow",
    description: "Get a QDash flow by name.",
    promptSnippet: "Get a QDash flow definition by name",
    action: "flow",
    parameters: Type.Object({ ...connectionParams, flowName: Type.String() }),
  });

  registerQueryTool({
    name: "qdash_list_executions",
    label: "QDash List Executions",
    description: "List QDash executions with optional chip, flow, status, and pagination filters.",
    promptSnippet: "List QDash executions",
    action: "executions",
    parameters: Type.Object({ ...connectionParams, chipId: Type.Optional(Type.String()), flowName: Type.Optional(Type.String()), status: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()), skip: Type.Optional(Type.Number()) }),
  });

  registerQueryTool({
    name: "qdash_get_execution",
    label: "QDash Get Execution",
    description: "Get a QDash execution by executionId.",
    promptSnippet: "Get QDash execution details by execution ID",
    action: "execution",
    parameters: Type.Object({ ...connectionParams, executionId: Type.String() }),
  });

  registerQueryTool({
    name: "qdash_list_ai_reviews",
    label: "QDash List AI Reviews",
    description: "List task-result AI reviews with optional filters.",
    promptSnippet: "List QDash task-result AI reviews",
    action: "ai_reviews",
    parameters: Type.Object({ ...connectionParams, chipId: Type.Optional(Type.String()), taskName: Type.Optional(Type.String()), status: Type.Optional(Type.String()), decision: Type.Optional(Type.String()), latestOnly: Type.Optional(Type.Boolean()), limit: Type.Optional(Type.Number()), skip: Type.Optional(Type.Number()) }),
  });

  pi.registerTool({
    name: "qdash_create_agent_session",
    label: "QDash Create Agent Session",
    description: "Create a QDash agent calibration session. This is a write operation and requires confirmation.",
    promptSnippet: "Create a QDash agent calibration session after explicit user confirmation",
    promptGuidelines: [
      "Use qdash_create_agent_session only after the user explicitly asks to start an agent calibration workflow.",
      "qdash_create_agent_session is a write operation; set confirmWrite only after user confirmation.",
    ],
    parameters: Type.Object({
      ...connectionParams,
      ...chipScopedParams,
      policy: Type.Any({ description: "Agent session policy object accepted by QDash." }),
      expiresInSeconds: Type.Optional(Type.Number()),
      skillName: Type.Optional(Type.String()),
      skillVersion: Type.Optional(Type.String()),
      skillHash: Type.Optional(Type.String()),
      modelName: Type.Optional(Type.String()),
      confirmWrite: Type.Optional(Type.Boolean({ description: "Required for non-interactive execution. Set true only after explicit user confirmation." })),
    }),
    async execute(_toolCallId, params: ConfirmableParams & {
      profile?: string;
      configPath?: string;
      useEnv?: boolean;
      chipId?: string;
      policy: unknown;
      expiresInSeconds?: number;
      skillName?: string;
      skillVersion?: string;
      skillHash?: string;
      modelName?: string;
    }, _signal, _onUpdate, ctx) {
      if (!params.confirmWrite) {
        if (!ctx.hasUI || !(await ctx.ui.confirm("Create QDash agent session?", "This will create an agent session in QDash."))) {
          throw new Error("qdash_create_agent_session requires explicit confirmation");
        }
      }
      const client = await makeClient(params);
      const chipId = await defaultChipId(client, params.chipId);
      const data = await client.createAgentSession({
        chipId,
        policy: params.policy as never,
        expiresInSeconds: params.expiresInSeconds,
        skillName: params.skillName ?? "pi-qdash",
        skillVersion: params.skillVersion,
        skillHash: params.skillHash,
        modelName: params.modelName,
      });
      return toToolResult(data, { tool: "qdash_create_agent_session", chipId });
    },
  });

  pi.registerTool({
    name: "qdash_get_agent_session",
    label: "QDash Get Agent Session",
    description: "Get a QDash agent calibration session by sessionId.",
    promptSnippet: "Get QDash agent calibration session details",
    promptGuidelines: ["Use qdash_get_agent_session to inspect QDash agent session state."],
    parameters: Type.Object({ ...connectionParams, sessionId: Type.String() }),
    async execute(_toolCallId, params: { profile?: string; configPath?: string; useEnv?: boolean; sessionId: string }) {
      const client = await makeClient(params);
      return toToolResult(await client.getAgentSession(params.sessionId), { tool: "qdash_get_agent_session" });
    },
  });

  pi.registerTool({
    name: "qdash_submit_agent_action",
    label: "QDash Submit Agent Action",
    description: "Submit an action to a QDash agent session. This is a write operation and requires confirmation.",
    promptSnippet: "Submit an action to a QDash agent session after explicit user confirmation",
    promptGuidelines: [
      "Use qdash_submit_agent_action only after the user confirms the exact agent action.",
      "Set confirmWrite only after explicit user confirmation.",
    ],
    parameters: Type.Object({
      ...connectionParams,
      sessionId: Type.String(),
      idempotencyKey: Type.Optional(Type.String()),
      expectedStateVersion: Type.Number(),
      actionType: Type.String(),
      taskName: Type.Optional(Type.String()),
      qids: Type.Optional(Type.Array(Type.String())),
      parameterOverrides: Type.Optional(Type.Record(Type.String(), Type.Number())),
      diagnosis: Type.Optional(Type.String()),
      confirmWrite: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params: ConfirmableParams & {
      profile?: string;
      configPath?: string;
      useEnv?: boolean;
      sessionId: string;
      idempotencyKey?: string;
      expectedStateVersion: number;
      actionType: string;
      taskName?: string;
      qids?: string[];
      parameterOverrides?: Record<string, number>;
      diagnosis?: string;
    }, _signal, _onUpdate, ctx) {
      if (!params.confirmWrite) {
        if (!ctx.hasUI || !(await ctx.ui.confirm("Submit QDash agent action?", `Submit action '${params.actionType}' to session '${params.sessionId}'?`))) {
          throw new Error("qdash_submit_agent_action requires explicit confirmation");
        }
      }
      const client = await makeClient(params);
      const data = await client.submitAgentAction(params.sessionId, {
        idempotencyKey: params.idempotencyKey ?? randomUUID(),
        expectedStateVersion: params.expectedStateVersion,
        actionType: params.actionType as never,
        taskName: params.taskName,
        qids: params.qids,
        parameterOverrides: params.parameterOverrides,
        diagnosis: params.diagnosis,
      });
      return toToolResult(data, { tool: "qdash_submit_agent_action" });
    },
  });

  pi.registerTool({
    name: "qdash_get_agent_action",
    label: "QDash Get Agent Action",
    description: "Get one QDash agent action by sessionId and actionId.",
    promptSnippet: "Get QDash agent action details",
    promptGuidelines: ["Use qdash_get_agent_action to inspect a submitted QDash agent action."],
    parameters: Type.Object({ ...connectionParams, sessionId: Type.String(), actionId: Type.String() }),
    async execute(_toolCallId, params: { profile?: string; configPath?: string; useEnv?: boolean; sessionId: string; actionId: string }) {
      const client = await makeClient(params);
      return toToolResult(await client.getAgentAction(params.sessionId, params.actionId), { tool: "qdash_get_agent_action" });
    },
  });

  pi.registerTool({
    name: "qdash_list_agent_actions",
    label: "QDash List Agent Actions",
    description: "List QDash agent actions for a session.",
    promptSnippet: "List QDash agent actions for an agent session",
    promptGuidelines: ["Use qdash_list_agent_actions to inspect actions in a QDash agent session."],
    parameters: Type.Object({ ...connectionParams, sessionId: Type.String() }),
    async execute(_toolCallId, params: { profile?: string; configPath?: string; useEnv?: boolean; sessionId: string }) {
      const client = await makeClient(params);
      return toToolResult(await client.listAgentActions(params.sessionId), { tool: "qdash_list_agent_actions" });
    },
  });

  pi.registerTool({
    name: "qdash_wait_agent_action",
    label: "QDash Wait Agent Action",
    description: "Wait for a QDash agent action to be dispatched or linked to an execution.",
    promptSnippet: "Poll QDash until an agent action is dispatched or linked to execution",
    promptGuidelines: ["Use qdash_wait_agent_action after submitting an agent action when the user wants polling."],
    parameters: Type.Object({
      ...connectionParams,
      sessionId: Type.String(),
      actionId: Type.String(),
      waitForExecution: Type.Optional(Type.Boolean({ description: "If true, wait for execution_id; otherwise wait for operation_id." })),
      timeoutSeconds: Type.Optional(Type.Number()),
      pollIntervalSeconds: Type.Optional(Type.Number()),
    }),
    async execute(_toolCallId, params: { profile?: string; configPath?: string; useEnv?: boolean; sessionId: string; actionId: string; waitForExecution?: boolean; timeoutSeconds?: number; pollIntervalSeconds?: number }) {
      const client = await makeClient(params);
      const options = { timeoutSeconds: params.timeoutSeconds, pollIntervalSeconds: params.pollIntervalSeconds };
      const data = params.waitForExecution
        ? await client.waitForAgentActionExecution(params.sessionId, params.actionId, options)
        : await client.waitForAgentAction(params.sessionId, params.actionId, options);
      return toToolResult(data, { tool: "qdash_wait_agent_action" });
    },
  });

  pi.registerTool({
    name: "qdash_list_agent_action_candidates",
    label: "QDash List Agent Action Candidates",
    description: "List candidate parameter updates produced by a QDash agent action.",
    promptSnippet: "List QDash agent action candidates",
    promptGuidelines: ["Use qdash_list_agent_action_candidates before committing or applying candidates."],
    parameters: Type.Object({ ...connectionParams, sessionId: Type.String(), actionId: Type.String() }),
    async execute(_toolCallId, params: { profile?: string; configPath?: string; useEnv?: boolean; sessionId: string; actionId: string }) {
      const client = await makeClient(params);
      return toToolResult(await client.listAgentActionCandidates(params.sessionId, params.actionId), { tool: "qdash_list_agent_action_candidates" });
    },
  });

  pi.registerTool({
    name: "qdash_commit_agent_candidate",
    label: "QDash Commit Agent Candidate",
    description: "Commit a QDash agent action candidate. This is a write operation and requires confirmation.",
    promptSnippet: "Commit a QDash agent candidate after explicit user confirmation",
    promptGuidelines: ["Use qdash_commit_agent_candidate only after showing the candidate and receiving explicit confirmation."],
    parameters: Type.Object({
      ...connectionParams,
      sessionId: Type.String(),
      actionId: Type.String(),
      parameterName: Type.String(),
      taskId: Type.String(),
      idempotencyKey: Type.Optional(Type.String()),
      expectedStateVersion: Type.Number(),
      confirmWrite: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params: ConfirmableParams & { profile?: string; configPath?: string; useEnv?: boolean; sessionId: string; actionId: string; parameterName: string; taskId: string; idempotencyKey?: string; expectedStateVersion: number }, _signal, _onUpdate, ctx) {
      if (!params.confirmWrite) {
        if (!ctx.hasUI || !(await ctx.ui.confirm("Commit QDash agent candidate?", `Commit candidate '${params.parameterName}' for task '${params.taskId}'?`))) {
          throw new Error("qdash_commit_agent_candidate requires explicit confirmation");
        }
      }
      const client = await makeClient(params);
      const data = await client.commitAgentActionCandidate(params.sessionId, params.actionId, params.parameterName, {
        idempotencyKey: params.idempotencyKey ?? randomUUID(),
        expectedStateVersion: params.expectedStateVersion,
        taskId: params.taskId,
      });
      return toToolResult(data, { tool: "qdash_commit_agent_candidate" });
    },
  });

  pi.registerTool({
    name: "qdash_list_forum_posts",
    label: "QDash List Forum Posts",
    description: "List QDash forum posts with optional category/status/chip/target filters.",
    promptSnippet: "List QDash forum posts",
    promptGuidelines: ["Use qdash_list_forum_posts instead of qdash_query when the user asks for QDash forum posts."],
    parameters: Type.Object({
      ...connectionParams,
      category: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
      chipId: Type.Optional(Type.String()),
      targetType: Type.Optional(Type.String()),
      targetId: Type.Optional(Type.String()),
      skip: Type.Optional(Type.Number()),
      limit: Type.Optional(Type.Number()),
      color: Type.Optional(Type.Boolean({ description: "Emit ANSI colors in text output for terminal display." })),
    }),
    async execute(_toolCallId, params: { profile?: string; configPath?: string; useEnv?: boolean; category?: string; status?: string; chipId?: string; targetType?: string; targetId?: string; skip?: number; limit?: number; color?: boolean }) {
      const client = await makeClient(params);
      const data = await client.listForumPosts({
        category: params.category,
        status: params.status,
        chipId: params.chipId ?? currentContext.chipId,
        targetType: params.targetType,
        targetId: params.targetId,
        skip: params.skip,
        limit: params.limit,
      });
      return toTextToolResult(forumListLines(data, "QDash Forum", params.color).join("\n"), data, { tool: "qdash_list_forum_posts" });
    },
    renderResult(result, _options, theme) {
      const data = (result.details as { data?: unknown } | undefined)?.data;
      return textComponent(forumListLines(data, "QDash Forum"), theme);
    },
  });

  pi.registerTool({
    name: "qdash_get_forum_post",
    label: "QDash Get Forum Post",
    description: "Get a QDash forum post by postId.",
    promptSnippet: "Get QDash forum post details",
    promptGuidelines: ["Use qdash_get_forum_post to inspect one QDash forum post."],
    parameters: Type.Object({ ...connectionParams, postId: Type.String(), color: Type.Optional(Type.Boolean({ description: "Emit ANSI colors in text output for terminal display." })) }),
    async execute(_toolCallId, params: { profile?: string; configPath?: string; useEnv?: boolean; postId: string; color?: boolean }) {
      const client = await makeClient(params);
      const data = await client.getForumPost(params.postId);
      return toTextToolResult(forumDetailLines(data, "QDash Forum Post", params.color).join("\n"), data, { tool: "qdash_get_forum_post" });
    },
    renderResult(result, _options, theme) {
      const data = (result.details as { data?: unknown } | undefined)?.data;
      return textComponent(forumDetailLines(data, "QDash Forum Post"), theme);
    },
  });

  pi.registerTool({
    name: "qdash_list_forum_replies",
    label: "QDash List Forum Replies",
    description: "List replies for a QDash forum post by postId.",
    promptSnippet: "List replies for a QDash forum post",
    promptGuidelines: ["Use qdash_list_forum_replies to inspect replies on a QDash forum post."],
    parameters: Type.Object({ ...connectionParams, postId: Type.String(), color: Type.Optional(Type.Boolean({ description: "Emit ANSI colors in text output for terminal display." })) }),
    async execute(_toolCallId, params: { profile?: string; configPath?: string; useEnv?: boolean; postId: string; color?: boolean }) {
      const client = await makeClient(params);
      const data = await client.getForumPostReplies(params.postId);
      return toTextToolResult(forumListLines(data, "QDash Forum Replies", params.color).join("\n"), data, { tool: "qdash_list_forum_replies" });
    },
    renderResult(result, _options, theme) {
      const data = (result.details as { data?: unknown } | undefined)?.data;
      return textComponent(forumListLines(data, "QDash Forum Replies"), theme);
    },
  });

  pi.registerTool({
    name: "qdash_create_forum_post",
    label: "QDash Create Forum Post",
    description: "Create a QDash forum post. This is a write operation and requires confirmation.",
    promptSnippet: "Create a QDash forum post after explicit user confirmation",
    promptGuidelines: ["Use qdash_create_forum_post only after the user confirms the exact post contents."],
    parameters: Type.Object({
      ...connectionParams,
      request: Type.Any({ description: "ForumPostCreate request body accepted by QDash." }),
      confirmWrite: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params: ConfirmableParams & { profile?: string; configPath?: string; useEnv?: boolean; request: unknown }, _signal, _onUpdate, ctx) {
      if (!params.confirmWrite) {
        if (!ctx.hasUI || !(await ctx.ui.confirm("Create QDash forum post?", "This will create a forum post in QDash."))) {
          throw new Error("qdash_create_forum_post requires explicit confirmation");
        }
      }
      const client = await makeClient(params);
      return toToolResult(await client.createForumPost(params.request as never), { tool: "qdash_create_forum_post" });
    },
  });

  pi.registerTool({
    name: "qdash_update_forum_post",
    label: "QDash Update Forum Post",
    description: "Update a QDash forum post. This is a write operation and requires confirmation.",
    promptSnippet: "Update a QDash forum post after explicit user confirmation",
    promptGuidelines: ["Use qdash_update_forum_post only after the user confirms the exact post update."],
    parameters: Type.Object({
      ...connectionParams,
      postId: Type.String(),
      request: Type.Any({ description: "ForumPostUpdate request body accepted by QDash." }),
      confirmWrite: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params: ConfirmableParams & { profile?: string; configPath?: string; useEnv?: boolean; postId: string; request: unknown }, _signal, _onUpdate, ctx) {
      if (!params.confirmWrite) {
        if (!ctx.hasUI || !(await ctx.ui.confirm("Update QDash forum post?", `Update forum post '${params.postId}'?`))) {
          throw new Error("qdash_update_forum_post requires explicit confirmation");
        }
      }
      const client = await makeClient(params);
      return toToolResult(await client.updateForumPost(params.postId, params.request as never), { tool: "qdash_update_forum_post" });
    },
  });

  registerQueryTool({
    name: "qdash_get_provenance_stats",
    label: "QDash Provenance Stats",
    description: "Get QDash provenance statistics.",
    promptSnippet: "Get QDash provenance stats",
    action: "provenance_stats",
    parameters: Type.Object(connectionParams),
  });

  pi.registerTool({
    name: "qdash_dashboard",
    label: "QDash Dashboard",
    description: "Build a compact read-only QDash dashboard for the current profile/chip context.",
    promptSnippet: "Show QDash harness dashboard: chips, open issues, recent executions, failed task results, and provenance stats",
    promptGuidelines: [
      "Use qdash_dashboard when the user asks for QDash status, overview, triage, or a dashboard.",
      "Summarize dashboard data instead of dumping large raw payloads.",
    ],
    parameters: Type.Object({ ...connectionParams, ...chipScopedParams, limit: Type.Optional(Type.Number()), color: Type.Optional(Type.Boolean({ description: "Emit ANSI colors in text output for terminal display." })) }),
    async execute(_toolCallId, params: { profile?: string; configPath?: string; useEnv?: boolean; chipId?: string; limit?: number; color?: boolean }) {
      const dashboard = await buildDashboard(params);
      return toTextToolResult(dashboardLines(dashboard, params.color).join("\n"), dashboard, { tool: "qdash_dashboard", lines: dashboardLines(dashboard) });
    },
    renderCall(args, theme) {
      const profile = args.profile ?? currentContext.profile ?? "context";
      return new Text(theme.fg("toolTitle", theme.bold("qdash_dashboard ")) + theme.fg("muted", profile), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as { data?: Awaited<ReturnType<typeof buildDashboard>> } | undefined;
      if (details?.data) return dashboardComponent(details.data, theme);
      return new Text(theme.fg("dim", "QDash dashboard unavailable"), 0, 0);
    },
  });

  pi.registerTool({
    name: "qdash_triage_overview",
    label: "QDash Triage Overview",
    description: "Create a read-only triage overview from open issues and failed task results for the current QDash context.",
    promptSnippet: "Summarize QDash open issues and failed task results for triage",
    promptGuidelines: ["Use qdash_triage_overview when the user asks what to investigate next in QDash."],
    parameters: Type.Object({ ...connectionParams, ...chipScopedParams, limit: Type.Optional(Type.Number()), color: Type.Optional(Type.Boolean({ description: "Emit ANSI colors in text output for terminal display." })) }),
    async execute(_toolCallId, params: { profile?: string; configPath?: string; useEnv?: boolean; chipId?: string; limit?: number; color?: boolean }) {
      const dashboard = await buildDashboard(params);
      const triage = {
        context: dashboard.context,
        openIssues: dashboard.openIssues,
        failedTaskResults: dashboard.failedTaskResults,
        suggestedFocus: [
          dashboard.failedTaskResults.count > 0 ? "Review failed task results first." : undefined,
          dashboard.openIssues.count > 0 ? "Review open issues and correlate with recent executions." : undefined,
        ].filter(Boolean),
      };
      const accent = (text: string) => params.color ? ansi("1;36", text) : text;
      const dim = (text: string) => params.color ? ansi("2", text) : text;
      const success = (text: string) => params.color ? ansi("32", text) : text;
      const error = (text: string) => params.color ? ansi("31", text) : text;
      const lines = boxed("QDash Triage", [
        `open issues ${triage.openIssues.count > 0 ? ansi("33", String(triage.openIssues.count)) : success(String(triage.openIssues.count))}`,
        `failed tasks ${triage.failedTaskResults.count > 0 ? error(`${triage.failedTaskResults.shown}/${triage.failedTaskResults.count}`) : success(`${triage.failedTaskResults.shown}/${triage.failedTaskResults.count}`)}`,
        "",
        accent("Suggested focus"),
        ...(triage.suggestedFocus.length > 0 ? triage.suggestedFocus.map((item) => `  - ${params.color ? ansi("33", item ?? "") : item}`) : [`  ${dim("none")}`]),
        "",
        accent("Failed task results"),
        ...(dashboard.failedTaskResults.items.length > 0 ? dashboard.failedTaskResults.items.map((item, index) => `  ${params.color ? error(formatItem(item, `task-${index + 1}`)) : formatItem(item, `task-${index + 1}`)}`) : [`  ${dim("none")}`]),
      ], params.color);
      return toTextToolResult(lines.join("\n"), triage, { tool: "qdash_triage_overview" });
    },
    renderResult(result, _options, theme) {
      const data = (result.details as { data?: { openIssues?: { count?: number }; failedTaskResults?: { count?: number }; suggestedFocus?: string[] } } | undefined)?.data;
      if (!data) return new Text(theme.fg("dim", "QDash triage unavailable"), 0, 0);
      const lines = [
        theme.fg("accent", theme.bold("QDash Triage")),
        `${theme.fg("muted", "open issues")} ${theme.fg((data.openIssues?.count ?? 0) > 0 ? "warning" : "success", String(data.openIssues?.count ?? 0))}`,
        `${theme.fg("muted", "failed tasks")} ${theme.fg((data.failedTaskResults?.count ?? 0) > 0 ? "error" : "success", String(data.failedTaskResults?.count ?? 0))}`,
        "",
        theme.fg("borderAccent", "Suggested focus"),
        ...(data.suggestedFocus?.length ? data.suggestedFocus.map((item) => `  ${theme.fg("warning", item)}`) : [`  ${theme.fg("dim", "none")}`]),
      ];
      return new Text(lines.join("\n"), 0, 0);
    },
  });

  pi.registerTool({
    name: "qdash_raw_get",
    label: "QDash Raw GET",
    description: "Run a read-only raw GET request through qdash-client transport for endpoints not covered by qdash_query.",
    promptSnippet: "Call a read-only QDash GET endpoint through qdash-client",
    promptGuidelines: ["Use qdash_raw_get only for read-only QDash endpoints not covered by qdash_query. Do not use it for operationally sensitive endpoints without user confirmation."],
    parameters: Type.Object({
      ...connectionParams,
      path: Type.String({ description: "API path, e.g. /task-results/timeseries" }),
      query: Type.Optional(Type.Record(Type.String(), Type.Any())),
    }),
    async execute(_toolCallId, params: RawGetParams) {
      if (!params.path.startsWith("/")) throw new Error("path must start with '/'");
      if (/\/files\/git\/(pull|push)|\/flows\/[^/]+\/execute|\/executions\/[^/]+\/re-execute|\/admin\b|\/auth\b/i.test(params.path)) {
        throw new Error("This endpoint is operationally sensitive; ask the user for explicit confirmation and use an appropriate dedicated workflow.");
      }
      const client = await makeClient(params);
      const data = await (client as unknown as { get<T>(path: string, query?: unknown): Promise<T> }).get(params.path, params.query ?? {});
      return toToolResult(data, { path: params.path });
    },
  });

  const persistContext = () => {
    pi.appendEntry(CONTEXT_ENTRY_TYPE, { ...currentContext });
  };

  const refreshContextUi = (ctx: { ui: { setStatus: (key: string, value: string) => void; setWidget?: (key: string, lines: string[]) => void } }) => {
    ctx.ui.setStatus("qdash", contextSummary());
  };

  pi.registerCommand("qdash-use-profile", {
    description: "Set the current QDash profile for this pi session",
    handler: async (args, ctx) => {
      const profile = args.trim();
      if (!profile) {
        ctx.ui.notify("Usage: /qdash-use-profile <profile>", "warning");
        return;
      }
      const client = await makeClient({ profile });
      currentContext = { ...currentContext, profile };
      persistContext();
      refreshContextUi(ctx);
      ctx.ui.notify(`QDash profile set to ${profile}`, "info");
    },
  });

  pi.registerCommand("qdash-use-chip", {
    description: "Set the current QDash chip ID for this pi session; omit the argument to use the default chip",
    handler: async (args, ctx) => {
      const requested = args.trim() || undefined;
      const client = await makeClient({});
      const chipId = requested ?? await client.getDefaultChipId();
      currentContext = { ...currentContext, chipId };
      persistContext();
      refreshContextUi(ctx);
      ctx.ui.notify(`QDash chip set to ${chipId}`, "info");
    },
  });

  pi.registerCommand("qdash-use-agent-session", {
    description: "Set the current QDash agent session ID for this pi session",
    handler: async (args, ctx) => {
      const agentSessionId = args.trim();
      if (!agentSessionId) {
        ctx.ui.notify("Usage: /qdash-use-agent-session <session_id>", "warning");
        return;
      }
      currentContext = { ...currentContext, agentSessionId };
      persistContext();
      refreshContextUi(ctx);
      ctx.ui.notify(`QDash agent session set to ${agentSessionId}`, "info");
    },
  });

  pi.registerCommand("qdash-clear-context", {
    description: "Clear the current QDash profile/chip/agent-session context",
    handler: async (_args, ctx) => {
      currentContext = {};
      persistContext();
      refreshContextUi(ctx);
      ctx.ui.setWidget("qdash", ["QDash context cleared", "profile env/default", "chip auto-chip", "session none"]);
      ctx.ui.notify("QDash context cleared", "info");
    },
  });

  pi.registerCommand("qdash-dashboard", {
    description: "Show a compact QDash dashboard for the current context",
    handler: async (args, ctx) => {
      const limit = args.trim() ? Number(args.trim()) : undefined;
      const dashboard = await buildDashboard({ limit: Number.isFinite(limit) ? limit : undefined });
      refreshContextUi(ctx);
      ctx.ui.setWidget("qdash", (_tui, theme) => dashboardComponent(dashboard, theme));
      ctx.ui.notify(`QDash dashboard updated: ${dashboard.openIssues.count} open issues, ${dashboard.failedTaskResults.count} failed tasks`, "info");
    },
  });

  pi.registerCommand("qdash-refresh", {
    description: "Refresh the QDash dashboard widget for the current context",
    handler: async (args, ctx) => {
      const limit = args.trim() ? Number(args.trim()) : undefined;
      const dashboard = await buildDashboard({ limit: Number.isFinite(limit) ? limit : undefined });
      refreshContextUi(ctx);
      ctx.ui.setWidget("qdash", (_tui, theme) => dashboardComponent(dashboard, theme));
      ctx.ui.notify("QDash widget refreshed", "info");
    },
  });

  pi.registerCommand("qdash-context", {
    description: "Show the current QDash context",
    handler: async (_args, ctx) => {
      refreshContextUi(ctx);
      ctx.ui.setWidget("qdash", [
        "QDash Context",
        `profile ${currentContext.profile ?? "env/default"}`,
        `chip ${currentContext.chipId ?? "auto-chip"}`,
        `agent session ${currentContext.agentSessionId ?? "none"}`,
      ]);
      ctx.ui.notify(contextSummary(), "info");
    },
  });

  pi.registerCommand("qdash-config", {
    description: "Show non-secret QDash config/profile information",
    handler: async (args, ctx) => {
      const profile = args.trim() || undefined;
      const profiles = configProfiles();
      try {
        const client = await makeClient({ profile });
        ctx.ui.setWidget("qdash", JSON.stringify({ profiles, active: safeConfig(client, profile ? `profile:${profile}` : shouldUseEnv({}) ? "env" : "profile:default") }, null, 2).split("\n"));
        ctx.ui.notify("QDash config shown in widget", "info");
      } catch (error) {
        ctx.ui.notify(`QDash config error: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });

  pi.on("session_start", (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries() as Array<{ type?: string; customType?: string; data?: unknown }>) {
      if (entry.type === "custom" && entry.customType === CONTEXT_ENTRY_TYPE && entry.data && typeof entry.data === "object") {
        currentContext = { ...(entry.data as QDashContextState) };
      }
    }
    refreshContextUi(ctx);
  });
}
