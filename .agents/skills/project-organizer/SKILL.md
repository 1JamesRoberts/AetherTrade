---
name: project-organizer
description: Manages, refactors, and organizes AetherTrade codebase files and modules into highly conventional, clean, and modular folder structures.
---

# Project Organizer Skill

This skill provides a standardized, conventional directory structure for AetherTrade terminals (and modern web applications), along with guidelines and automated scripts to restructure the workspace safely without disrupting server operations or asset routes.

## Conventional Codebase Structure

A highly modular, professional structure is designed to separate concerns between styling, client-side script engines, templates, and backend proxy servers:

```text
├── assets/
│   ├── css/
│   │   └── styles.css          # Unified stylesheet containing design tokens, animations, and elements
│   ├── js/
│   │   └── app.js              # Client-side core logic, multi-portfolio databases, and API chart renders
│   └── images/                 # SVG icons, visual mockup assets, and banners
├── server/
│   └── server.py               # Python HTTP backend, rotated API key proxies, and Twelve Data routers
├── index.html                  # Core single-page interface layout and HTML document structure
├── .gitignore                  # Git tracking exclusions
└── .agents/                    # Agent capabilities, custom skills, and diagnostic testers
```

---

## Restructuring Guidelines

To migrate a flat codebase layout into this modular structure, the following operations must be performed in sequence:

### 1. Backend Server Directory Shift
- **Path**: Move `server.py` to `server/server.py`.
- **Working Directory Correction**: Python's `SimpleHTTPRequestHandler` serves assets relative to the current active directory. When shifted into `server/`, the working directory must be pinned to the parent directory (root) to continue serving `index.html` correctly:
  ```python
  # Correct way to pin working directory to project root:
  script_dir = os.path.dirname(os.path.abspath(__file__))
  project_root = os.path.abspath(os.path.join(script_dir, '..'))
  os.chdir(project_root)
  ```

### 2. Client Static Asset Shifts
- **CSS Styles**: Move `styles.css` to `assets/css/styles.css`.
- **JS Core Engine**: Move `app.js` to `assets/js/app.js`.

### 3. Template URL Re-mapping
- **Styles Route**: Update `index.html` to point to the new CSS path:
  ```html
  <link rel="stylesheet" href="assets/css/styles.css">
  ```
- **Script Route**: Update `index.html` to point to the new modular JS path:
  ```html
  <script src="assets/js/app.js"></script>
  ```

---

## Provided Automated Migration Tool

An automated Python migrator script is provided at [scripts/organize.py](file:///.agents/skills/project-organizer/scripts/organize.py) to execute the folder creation, file copy, relative path updates, and server directory adjustments in a single safe, atomic step.
