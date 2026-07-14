import { existsSync, readFileSync } from "node:fs";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { QDashClient, defaultConfigPath } from "@oqtopus-team/qdash-client";
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
  if (shouldUseEnv(params)) return QDashClient.fromEnv();
  return QDashClient.fromProfile(params.profile ?? "default", params.configPath);
}

async function defaultChipId(client: QDashClient, chipId?: string): Promise<string> {
  return chipId ?? client.getDefaultChipId();
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

function configProfiles(configPath = defaultConfigPath()): { path: string; exists: boolean; profiles: string[] } {
  if (!existsSync(configPath)) return { path: configPath, exists: false, profiles: [] };
  const contents = readFileSync(configPath, "utf8");
  const profiles = [...contents.matchAll(/^\s*\[([^\]]+)]\s*$/gm)].map((m) => m[1]);
  return { path: configPath, exists: true, profiles };
}

async function executeQuery(params: QDashQueryParams) {
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

  registerQueryTool({
    name: "qdash_get_provenance_stats",
    label: "QDash Provenance Stats",
    description: "Get QDash provenance statistics.",
    promptSnippet: "Get QDash provenance stats",
    action: "provenance_stats",
    parameters: Type.Object(connectionParams),
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
    ctx.ui.setStatus("qdash", "qdash extension ready");
  });
}
