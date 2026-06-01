#!/usr/bin/env python3
import os
import shutil
import re

def organize_project():
    print("=========================================")
    print("       AetherTrade Code Organizer        ")
    print("=========================================\n")

    # Locate project root (assuming running from root or .agents/skills/project-organizer/scripts)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Climb up if inside skills folder
    project_root = os.path.abspath(os.path.join(script_dir, '../../../../')) if '.agents' in script_dir else os.getcwd()
    os.chdir(project_root)

    print(f"Project root directory: {project_root}")
    
    # 1. Verify existence of primary flat files
    has_app = os.path.exists("app.js")
    has_css = os.path.exists("styles.css")
    has_server = os.path.exists("server.py")
    has_html = os.path.exists("index.html")

    if not (has_app or has_css or has_server or has_html):
        print("Error: Could not locate AetherTrade terminal files in the current folder.")
        print("Please ensure you run this script from the project root directory.")
        return False

    # 2. Create conventional directories
    dirs_to_create = [
        "assets/css",
        "assets/js",
        "server"
    ]
    for d in dirs_to_create:
        os.makedirs(d, exist_ok=True)
        print(f"Created directory: {d}/")

    # 3. Migrate Stylesheet
    if os.path.exists("styles.css"):
        shutil.move("styles.css", "assets/css/styles.css")
        print("Moved styles.css -> assets/css/styles.css")
    
    # 4. Migrate Client Script
    if os.path.exists("app.js"):
        shutil.move("app.js", "assets/js/app.js")
        print("Moved app.js -> assets/js/app.js")

    # 5. Migrate Backend Server
    if os.path.exists("server.py"):
        # Shift server script
        shutil.move("server.py", "server/server.py")
        print("Moved server.py -> server/server.py")

        # Read and correct working directory alignment in server.py
        server_path = "server/server.py"
        with open(server_path, "r", encoding="utf-8") as f:
            server_code = f.read()

        old_chdir_block = """    # Pin working directory to script location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)"""

        new_chdir_block = """    # Pin working directory to project root (parent directory of server/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, '..'))
    os.chdir(project_root)"""

        if old_chdir_block in server_code:
            server_code = server_code.replace(old_chdir_block, new_chdir_block)
            with open(server_path, "w", encoding="utf-8") as f:
                f.write(server_code)
            print("Updated server/server.py with relative project root path correction!")
        else:
            # Fallback regex replacement if formatting differed
            pattern = r"os\.chdir\(script_dir\)"
            if re.search(pattern, server_code):
                server_code = re.sub(
                    r"script_dir = os\.path\.dirname\(os\.path\.abspath\(__file__\)\)\s+os\.chdir\(script_dir\)",
                    "script_dir = os.path.dirname(os.path.abspath(__file__))\n    project_root = os.path.abspath(os.path.join(script_dir, '..'))\n    os.chdir(project_root)",
                    server_code
                )
                with open(server_path, "w", encoding="utf-8") as f:
                    f.write(server_code)
                print("Applied regex path correction to server/server.py!")

    # 6. Update index.html script & css references
    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            html_code = f.read()

        # Update CSS reference
        html_code = re.sub(
            r'href="styles\.css"',
            'href="assets/css/styles.css"',
            html_code
        )

        # Update JS reference
        html_code = re.sub(
            r'src="app\.js"',
            'src="assets/js/app.js"',
            html_code
        )

        with open("index.html", "w", encoding="utf-8") as f:
            f.write(html_code)
        print("Updated index.html asset links successfully!")

    print("\n=========================================")
    print("        Reorganization Complete!        ")
    print("=========================================")
    print("Files have been moved to standard conventional structures.")
    print("Run your server from the root with: python3 server/server.py")
    return True

if __name__ == "__main__":
    organize_project()
