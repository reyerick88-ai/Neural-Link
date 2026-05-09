## Neural-Link Vision

Neural-Link es la distribución enfocada en **clínicas dentales en México** (SaaS B2B) sobre el núcleo técnico OpenClaw.
El software sigue siendo el asistente multi-canal que ejecuta tareas reales en tus dispositivos y canales, con tus reglas.

This document explains the current state and direction of the project.
We are still early, so iteration is fast.
Project overview and developer docs: [`README.md`](README.md)
Contribution guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)

Neural-Link/OpenClaw started as a personal playground to learn AI and build something genuinely useful:
an assistant that can run real tasks on a real computer.
It evolved through several names and shells: Warelay -> Clawdbot -> Moltbot -> OpenClaw.

The goal: un **agente de IA local** útil para equipos clínicos — fácil de operar, amplio en plataformas, y con foco en privacidad y seguridad de datos de paciente.

The current focus is:

Priority:

- Security and safe defaults
- Bug fixes and stability
- Setup reliability and first-run UX

Next priorities:

- Supporting all major model providers
- Improving support for major messaging channels (and adding a few high-demand ones)
- Performance and test infrastructure
- Better computer-use and agent harness capabilities
- Ergonomics across CLI and web frontend
- Companion apps on macOS, iOS, Android, Windows, and Linux

Contribution rules:

- One PR = one issue/topic. Do not bundle multiple unrelated fixes/features.
- PRs over ~5,000 changed lines are reviewed only in exceptional circumstances.
- Do not open large batches of tiny PRs at once; each PR has review cost.
- For very small related fixes, grouping into one focused PR is encouraged.

## Security

Security in Neural-Link inherits OpenClaw's posture: a deliberate tradeoff of strong defaults without killing capability.
The goal is to stay powerful for real work while making risky paths explicit and operator-controlled.

Canonical security policy and reporting:

- [`SECURITY.md`](SECURITY.md)

We prioritize secure defaults, but also expose clear knobs for trusted high-power workflows.

## Plugins & Memory

Neural-Link tiene la misma API de plugins extensa que OpenClaw.
Core stays lean; optional capability should usually ship as plugins.
We are generally slimming down core while expanding what plugins can do.
If a useful feature cannot be built as a plugin yet, we welcome PRs and design discussions that extend the plugin API instead of adding one-off core behavior.

There are two broad plugin styles:

- Code plugins run OpenClaw plugin code and are appropriate for deeper runtime extension.
- Bundle-style plugins package stable external surfaces such as skills, MCP servers, and related configuration.

Prefer bundle-style plugins when they can express the capability.
They have a smaller, more stable interface and better security boundaries.
Use code plugins when the capability needs runtime hooks, providers, channels, tools, or other in-process extension points.

Preferred plugin path is npm package distribution plus local extension loading for development.
If you build a plugin, host and maintain it in your own repository.
The bar for adding optional plugins to core is intentionally high.
Plugin docs: [`docs/tools/plugin.md`](docs/tools/plugin.md)
Plugin discovery, official publisher status, provenance, and security review live in [ClawHub](https://clawhub.ai/).
Neural-Link docs (derived from OpenClaw) document core extension points; plugin promotion belongs in ClawHub, preferably under vetted org publishers for official plugins.

Memory is a special plugin slot where only one memory plugin can be active at a time.
Today we ship multiple memory options; over time we plan to converge on one recommended default path.

### Skills

We still ship some bundled skills for baseline UX.
New skills should be published through [ClawHub](https://clawhub.ai/) first, not added to core by default.
Official or bundled promotion should require a clear product, security, or maintainer-ownership reason.

### MCP Support

Neural-Link supports MCP as both a server and a runtime integration surface.
MCP details live in [`docs/cli/mcp.md`](docs/cli/mcp.md).

The project goal is pragmatic MCP support without duplicating existing agent,
tool, ACPX, plugin, or ClawHub paths.

### Setup

Neural-Link is currently terminal-first by design.
This keeps setup explicit: users see docs, auth, permissions, and security posture up front.

Long term, we want easier onboarding flows as hardening matures.
We do not want convenience wrappers that hide critical security decisions from users.

### Why TypeScript?

Neural-Link is primarily an orchestration system: prompts, tools, protocols, and integrations.
TypeScript was chosen to keep the stack hackable by default.
It is widely known, fast to iterate in, and easy to read, modify, and extend.

## What We Will Not Merge (For Now)

- New core skills when they can live on [ClawHub](https://clawhub.ai/)
- Full-doc translation sets for all docs (deferred; we plan AI-generated translations later)
- Commercial service integrations that do not clearly fit the model-provider category
- Wrapper channels around already supported channels without a clear capability or security gap
- MCP work that duplicates existing MCP, ACPX, plugin, or ClawHub paths without a clear product or security gap
- Agent-hierarchy frameworks (manager-of-managers / nested planner trees) as a default architecture
- Heavy orchestration layers that duplicate existing agent and tool infrastructure

This list is a roadmap guardrail, not a law of physics.
Strong user demand and strong technical rationale can change it.
