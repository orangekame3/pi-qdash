# pi-qdash

A pi extension for querying QDash from pi. It uses `@oqtopus-team/qdash-client` and reuses existing `QDASH_*` environment variables or profiles from `~/.config/qdash/config.ini` / `$XDG_CONFIG_HOME/qdash/config.ini`.

## Usage

Install dependencies in this repository:

```bash
npm install
```

Try it temporarily:

```bash
pi -e /Users/orangekame3/src/github.com/orangekame3/pi-qdash
```

Install it for regular use:

```bash
pi install /Users/orangekame3/src/github.com/orangekame3/pi-qdash
```

## Tools

- `qdash_config_info`: inspect profiles and non-secret connection settings
- Dedicated read-only tools:
  - `qdash_list_chips`, `qdash_get_default_chip`
  - `qdash_get_chip_metrics`, `qdash_list_chip_qubits`, `qdash_list_chip_couplings`
  - `qdash_get_timeseries`
  - `qdash_list_task_results`, `qdash_get_task_result`
  - `qdash_list_issues`
  - `qdash_list_flows`, `qdash_get_flow`
  - `qdash_list_executions`, `qdash_get_execution`
  - `qdash_list_ai_reviews`, `qdash_get_provenance_stats`
- `qdash_query`: fallback for read-only queries that do not yet have a dedicated tool
- `qdash_raw_get`: call read-only GET endpoints not covered by `qdash_query` through the qdash-client transport

Secrets such as `api_token`, passwords, and Cloudflare Access secrets are redacted from tool output.

## Skill

This package also provides `/skill:qdash`, which guides pi to choose the right QDash tools, avoid exposing secrets, and prefer read-only operations.

## Command

```text
/qdash-config [profile]
```

Shows non-secret QDash configuration details in a pi widget.

## Development

```bash
npm run check
```
