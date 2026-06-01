#!/usr/bin/env python3
import os
import sys

def generate_templates(title="New Feature Rollout"):
    print("=========================================")
    print("        AetherTrade Plan Generator       ")
    print("=========================================\n")

    # Target folder (default to current active folder)
    target_dir = os.getcwd()
    print(f"Generating planning templates in: {target_dir}")

    # 1. Seeding implementation_plan.md
    plan_path = os.path.join(target_dir, "implementation_plan.md")
    plan_template = f"""# Implementation Plan - {title}

Provide a brief description of the goal, user requirements, background context, and what the changes accomplish.

## User Review Required

> [!IMPORTANT]
> List critical design choices, breaking changes, or cost-basis impacts requiring explicit developer review.

## Open Questions

- Clarifying questions about ambiguous requirements, UX parameters, or edge-case constraints.

---

## Proposed Changes

Group file modifications by feature area or architectural layer (e.g. backend proxy, asset rendering, database logic).

### [Component Name]
Summary of changes in this component.

#### [MODIFY] [file_basename](file:///absolute/path/to/file)
- Concrete description of changes to apply.
- Specific function or variable names to modify.

---

## Verification Plan

### Automated Tests
- Describe testing commands (e.g. proxy request validity checks, unit test commands).

### Manual Verification Checklist
- [ ] Test Case 1: describe steps and expected outcomes.
- [ ] Test Case 2: describe steps and expected outcomes.
"""

    with open(plan_path, "w", encoding="utf-8") as f:
        f.write(plan_template)
    print("Created template: implementation_plan.md")

    # 2. Seeding task.md
    task_path = os.path.join(target_dir, "task.md")
    task_template = f"""# Task Checklist - {title}

Organize the execution path into sequential, component-level tasks. Mark items as `[/]` when in-progress, and `[x]` when completed.

- [ ] Task 1: Research, inspect, and confirm baseline functions
- [ ] Task 2: Implement UI layout and HTML form fields
- [ ] Task 3: Implement core business logic and database updates
- [ ] Task 4: Remap template url assets and background loaders
- [ ] Task 5: Execute validation runs and perform manual checklists
"""

    with open(task_path, "w", encoding="utf-8") as f:
        f.write(task_template)
    print("Created template: task.md")

    # 3. Seeding walkthrough.md
    walkthrough_path = os.path.join(target_dir, "walkthrough.md")
    walkthrough_template = f"""# Walkthrough - {title}

Summarize what was accomplished, architectural design choices applied, and verification test results.

---

## 1. Core Accomplishments
- **Summary**: Brief description of the finished feature.
- **Components Updated**: List basenames of modified files and scripts.

---

## 2. Design & Architecture
- Highlight clean-code patterns, modular separations, and backwards-compatibility safeties implemented.

---

## 3. Verification & Testing

### Automated Test Runs
```bash
# Insert commands and log outputs demonstrating complete compiler correctness
```

### Manual Verification Checklist Results
- **BUY Trades**: Verified cost metrics.
- **SELL Trades**: Verified realized P&L.
- **CSV Imports**: Verified dynamic account mapping.
"""

    with open(walkthrough_path, "w", encoding="utf-8") as f:
        f.write(walkthrough_template)
    print("Created template: walkthrough.md")

    print("\n=========================================")
    print("         Generation Complete!           ")
    print("=========================================")
    print("Pre-formatted templates are ready for use.")
    return True

if __name__ == "__main__":
    title_arg = sys.argv[1] if len(sys.argv) > 1 else "New Feature Rollout"
    generate_templates(title_arg)
