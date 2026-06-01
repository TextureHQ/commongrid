# Knock Workflow Infrastructure

This directory contains email notification workflows for CommonGrid, deployed to Knock via Infrastructure-as-Code.

## Structure

```
knock/
  layouts/         # Email layouts (headers, footers, styling)
    default/       # CommonGrid default layout
  workflows/       # Individual notification workflows
    changes-requested/
    contribution-approved/
    contribution-returned/
    mod-new-contribution/
```

## Workflows

Each workflow is a directory containing:
- `workflow.json` — Workflow configuration (channels, triggers, categories)
- `email_1/visual_blocks.json` — Email template structure
- `email_1/visual_blocks/1.content.md` — Email content in Markdown

## Deployment

Workflows are automatically deployed via GitHub Actions:
- **PRs:** Validates workflows in Knock development environment
- **Main merges:** Pushes to development, commits, and promotes to production (non-interactive)

The GitHub Action runs on any change to the `knock/` directory.

**Production Status:** Workflows are deployed and active in Knock production environment.

## Creating a New Workflow

1. Create a new directory under `workflows/` with a kebab-case key (e.g., `entity-updated`)
2. Add `workflow.json` with workflow configuration
3. Create email template files following the existing pattern
4. Reference the workflow key in code via `lib/knock/workflows.ts`
5. Submit a PR — the workflow will be validated automatically

## Local Development

Install the Knock CLI:
```bash
npm install -g @knocklabs/cli
```

Push workflows to development:
```bash
knock layout push --all --layouts-dir=./knock/layouts --service-token=$KNOCK_SERVICE_TOKEN
knock workflow push --all --workflows-dir=./knock/workflows --service-token=$KNOCK_SERVICE_TOKEN
```

## Documentation

- [Knock CLI Docs](https://docs.knock.app/developer-tools/knock-cli)
- [Workflow Schema Reference](https://schemas.knock.app/cli/workflow.json)
- [Email Layout Schema](https://schemas.knock.app/cli/email-layout.json)
