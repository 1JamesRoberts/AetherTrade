---
name: project-planner
description: Establishes a highly efficient, conventional technical planning framework. Automates the generation of standardized implementation plans, task checklists, and verification walkthroughs.
---

# Project Planner Skill

This skill provides a standardized, professional, and conventional framework to research, plan, track, execute, and verify technical feature rollouts. It establishes strict rules for codebase architectural integrity, backwards-compatibility, code quality, and automated checkmarks.

---

## The Core Planning Triad

Every complex change or architectural feature rollout must follow the **Core Planning Triad**, which organizes the project life cycle into three structured Markdown templates:

```text
├── [Design]         implementation_plan.md   # Architectural design, open questions, file diff mapping
├── [Execution]      task.md                  # Granular check-list tracking active/completed tasks
└── [Verification]   walkthrough.md           # Validation checklist, test runs, and manual UX results
```

---

## Architectural & Coding Standards

When planning and implementing features, the planner framework enforces the following strict conventions:

### 1. Safety & Robustness First
- **Floating-point Safeties**: Never use strict equality (`==` or `===`) for comparing float balances. Always integrate delta boundaries (e.g. `Math.abs(A - B) < 1e-9` or `A + 1e-9 < B`).
- **Input Cleaning**: Always clean commas and spaces from user/file numeric inputs before parsing floats (e.g., `parseFloat(String(val).replace(/,/g, '').trim())`).
- **Null / Undefined Fallbacks**: Never assume API or object properties exist. Always chain optional property checks or fallbacks (e.g., `metadata.price || avgCost || 0`).

### 2. Backwards Compatibility
- **Database & Storage Migrations**: When updating database structures (like adding trading fees or portfolios), write proactive fallback migrations (e.g., reading older key formats and upgrading them on initial load).
- **Graceful Fail-softs**: If imported CSVs or APIs lack newly added fields, fall back to safe default parameters (like `0` or `"Default"`) rather than crashing.

### 3. Modularity & DRY (Don't Repeat Yourself)
- **Reusable Core Renders**: When updating displays or lists, reuse single, authoritative, sorted rendering helpers (`updatePortfolioDashboard()`, `rebuildSpecificPortfolio()`) rather than writing ad-hoc local computations.
- **Scope Isolation**: Avoid global variable creep. Pack modular logic into specific helper functions or closure parameters.

---

## Provided Planning Generator Tool

An automated Python script is provided at [scripts/generate_plan.py](file:///.agents/skills/project-planner/scripts/generate_plan.py) to instantly seed the workspace with customized, pre-formatted implementation plans, tasks, and walkthroughs, accelerating the dev loop.
