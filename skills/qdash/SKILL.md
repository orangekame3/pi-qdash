---
name: qdash
description: Query a running QDash instance from pi via the pi-qdash extension and @oqtopus-team/qdash-client. Use when inspecting chips, metrics, task results, tasks, projects, files, flows, executions, forum posts, provenance, or QDash profile/configuration.
---

# QDash

Use the pi-qdash tools instead of scraping the UI or hand-writing auth headers.

## Preferred tools

1. `qdash_config_info` — check profile names and non-secret connection settings.
2. Prefer dedicated read-only tools when they match the task:
   - `qdash_list_chips`, `qdash_get_default_chip`
   - `qdash_get_chip_metrics`, `qdash_list_chip_qubits`, `qdash_list_chip_couplings`
   - `qdash_get_timeseries`
   - `qdash_list_task_results`, `qdash_get_task_result`
   - `qdash_list_issues`
   - `qdash_list_flows`, `qdash_get_flow`
   - `qdash_list_executions`, `qdash_get_execution`
   - `qdash_list_ai_reviews`, `qdash_get_provenance_stats`
3. Use `qdash_query` for common read-only QDash operations not covered by a dedicated tool:
   - `chips`, `default_chip`, `metrics_config`, `chip_metrics`
   - `chip_qubits`, `chip_qubit`, `chip_couplings`, `chip_coupling`
   - `timeseries`, `task_results`, `task_result`, `task_note`, `task_result_issues`
   - `qubit_latest`, `qubit_history`, `coupling_latest`, `coupling_history`
   - `tasks`, `task_knowledge`, `task_knowledge_markdown`
   - `projects`, `project`, `files_tree`, `file_content`, `git_status`
   - `issues`, `issue_knowledge`
   - `flows`, `flow`, `flow_templates`, `flow_template`, `flow_helper_files`, `flow_helper_file`
   - `executions`, `execution`, `ai_reviews`, `ai_review_runs`, `ai_review_run`
   - `forum_posts`, `provenance_stats`, `provenance_history`, `provenance_changes`, `provenance_lineage`, `provenance_impact`
4. `qdash_raw_get` — read-only GET endpoints not covered by `qdash_query`.

## Configuration

The extension uses `@oqtopus-team/qdash-client` and supports:

- `QDASH_*` environment variables (`QDASH_BASE_URL`, `QDASH_API_TOKEN`, `QDASH_PROJECT_ID`, etc.)
- `$XDG_CONFIG_HOME/qdash/config.ini`
- `~/.config/qdash/config.ini`
- explicit `profile` / `configPath` parameters

If `QDASH_BASE_URL` is set and no profile is specified, the tools default to environment variables. Otherwise they use profile `default`.

## Safety

- Never print tokens, passwords, Cloudflare Access secrets, or full profile contents.
- Treat write/operational endpoints (flow execute, git push/pull, re-execute, admin/auth APIs) as sensitive and ask the user before any write workflow.
- Prefer summarizing large responses with counts, IDs, time ranges, and notable values.
