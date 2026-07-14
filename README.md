# pi-qdash

A pi extension for querying QDash from pi. It uses `@oqtopus-team/qdash-client` and reuses existing `QDASH_*` environment variables or profiles from `~/.config/qdash/config.ini` / `$XDG_CONFIG_HOME/qdash/config.ini`.

## Usage

Install from npm:

```bash
pi install npm:@orangekame3/pi-qdash
```

Try from npm without installing:

```bash
pi -e npm:@orangekame3/pi-qdash
```

For local development, install dependencies in this repository:

```bash
npm install
```

Try the local package temporarily from the repository root:

```bash
pi -e .
```

Install the local package for regular use:

```bash
pi install "$(pwd)"
```

Or install it from GitHub:

```bash
pi install git:github.com/orangekame3/pi-qdash
```

## Tools

- `qdash_config_info`: inspect profiles and non-secret connection settings
- Dedicated read-only tools:
  - `qdash_list_chips`, `qdash_get_default_chip`
  - `qdash_get_chip_metrics`, `qdash_list_chip_qubits`, `qdash_list_chip_couplings`
  - `qdash_get_timeseries`, `qdash_plot_timeseries`
  - `qdash_list_task_results`, `qdash_get_task_result`
  - `qdash_list_issues`
  - `qdash_list_flows`, `qdash_get_flow`
  - `qdash_list_executions`, `qdash_get_execution`
  - `qdash_list_ai_reviews`, `qdash_get_provenance_stats`
  - `qdash_list_forum_posts`, `qdash_get_forum_post`, `qdash_list_forum_replies`
  - `qdash_get_figure`, `qdash_get_task_figures`
- Harness overview and insight tools:
  - `qdash_dashboard`
  - `qdash_dashboard_insights`
  - `qdash_recent_calibration_summary`
  - `qdash_recommend_next_action`
  - `qdash_triage_overview`
- Agent calibration workflow tools:
  - `qdash_create_agent_session`
  - `qdash_get_agent_session`
  - `qdash_submit_agent_action`
  - `qdash_get_agent_action`, `qdash_list_agent_actions`, `qdash_wait_agent_action`
  - `qdash_list_agent_action_candidates`
  - `qdash_execute_agent_action`
  - `qdash_commit_agent_candidate`, `qdash_commit_agent_campaign_candidates`
  - `qdash_get_agent_candidate_commit`, `qdash_apply_agent_candidate_commit`, `qdash_wait_agent_candidate_apply`
- `qdash_query`: fallback for read-only queries that do not yet have a dedicated tool
- `qdash_raw_get`: call read-only GET endpoints not covered by `qdash_query` through the qdash-client transport

Secrets such as `api_token`, passwords, and Cloudflare Access secrets are redacted from tool output. Write-oriented agent/forum workflow tools are approval-gated: interactive pi shows a confirmation prompt, and non-interactive runs require `confirmWrite: true`.

Forum read tools render compact boxed summaries for list/detail/reply views. Figure tools fetch calibration PNG/JSON figures by path or task result through qdash-client helpers, and render images in interactive TUI. Forum write tools are available as confirmation-gated operations: `qdash_create_forum_post`, `qdash_update_forum_post`, and `qdash_create_forum_evidence_reply`. The evidence-reply helper builds a markdown reply from a task result, embeds figures so they are visible in the forum, links recent same-task history, and marks the reply with `— by pi-qdash`.

## Skill

This package also provides `/skill:qdash`, which guides pi to choose the right QDash tools, avoid exposing secrets, and prefer read-only operations.

## Commands

```text
/qdash-setup [profile] [chip_id]
/qdash-use-profile <profile>
/qdash-use-chip [chip_id]
/qdash-use-agent-session <session_id>
/qdash-context
/qdash-dashboard [limit]
/qdash-refresh [limit]
/qdash-clear-context
/qdash-config [profile]
```

For the common path, install the package and run `/qdash-setup mackerel 144Qv1` in interactive pi. The setup command stores the session-local profile/chip context, refreshes the footer status line, and opens the dashboard widget.

These commands manage session-local QDash context, update the pi status/widget, show or refresh a themed compact QDash dashboard, and show non-secret QDash configuration details. Tools use the current profile/chip context when their parameters are omitted. In interactive mode, the highlighted footer status line shows the active QDash profile, chip, and agent session.

`qdash_dashboard` and `qdash_triage_overview` provide boxed compact text output for non-interactive runs and custom TUI renderers for nicer interactive tool results. Pass `color: true` to emit ANSI-colored text output in terminal-oriented non-interactive usage.

## Development

```bash
npm run check
```
