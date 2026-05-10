#!/usr/bin/env python3
"""Install the iDeer chatbot-first skill into InternShannon / A3S."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


SKILL_NAME = "ideer-daily-paper-chatbot"
SKILL_FILE = f"{SKILL_NAME}.md"
DEFAULT_APP = Path("/Applications/Intern Shannon.app")
DEFAULT_A3S_HOME = Path.home() / ".a3s"
SAFECLAW_BUNDLE_ID = "com.a3s.internshannon"


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    print("+ " + " ".join(cmd))
    return subprocess.run(cmd, check=check, text=True, capture_output=False)


def repo_root_from_script() -> Path:
    return Path(__file__).resolve().parents[3]


def split_frontmatter(text: str) -> tuple[str, str, str]:
    match = re.match(r"\A---\n(.*?)\n---\n(.*)\Z", text, flags=re.S)
    if not match:
        raise SystemExit("SKILL.md must contain YAML frontmatter.")
    return "---\n", match.group(1), "---\n" + match.group(2)


def concrete_allowed_tools(repo_root: Path) -> str:
    skill_dir = repo_root / "skills" / SKILL_NAME
    renderer = skill_dir / "scripts" / "render_chatbot_artifacts.py"
    return ", ".join(
        [
            f"read({repo_root}/**)",
            f"write({repo_root}/history/**)",
            f"write({repo_root}/chatbot_test_outputs/**)",
            "grep(*)",
            "glob(*)",
            f"bash(cd {repo_root} && .venv/bin/python -m pipeline.agent_bridge fetch:*)",
            f"bash(cd {repo_root} && .venv/bin/python -m pipeline.agent_bridge save-items:*)",
            f"bash(cd {repo_root} && .venv/bin/python -m pipeline.agent_bridge save-ideas:*)",
            f"bash(cd {repo_root} && .venv/bin/python {renderer}:*)",
            "bash(date:*)",
            f"bash(find {repo_root}/history:*)",
            f"bash(ls {repo_root}/history:*)",
            "web_fetch(*)",
            "web_search(*)",
        ]
    )


def materialize_skill(repo_root: Path) -> str:
    source = repo_root / "skills" / SKILL_NAME / "SKILL.md"
    text = source.read_text(encoding="utf-8")
    begin, frontmatter, rest = split_frontmatter(text)
    allowed = concrete_allowed_tools(repo_root)
    if re.search(r"^allowed-tools:", frontmatter, flags=re.M):
        frontmatter = re.sub(
            r"^allowed-tools:.*$",
            f'allowed-tools: "{allowed}"',
            frontmatter,
            count=1,
            flags=re.M,
        )
    else:
        frontmatter += f'\nallowed-tools: "{allowed}"'

    skill_dir = repo_root / "skills" / SKILL_NAME
    renderer = skill_dir / "scripts" / "render_chatbot_artifacts.py"
    replacements = {
        "- `PROJECT_DIR`: the current iDeer repository root. When installed by `scripts/install_internshannon_skill.py`, this becomes the absolute clone path.": f"- `PROJECT_DIR`: `{repo_root}`",
        "- `SKILL_DIR`: `skills/ideer-daily-paper-chatbot` inside the iDeer repository.": f"- `SKILL_DIR`: `{skill_dir}`",
        "`skills/ideer-daily-paper-chatbot/references/presets.md`": f"`{skill_dir / 'references' / 'presets.md'}`",
        "`skills/ideer-daily-paper-chatbot/references/automation.md`": f"`{skill_dir / 'references' / 'automation.md'}`",
        ".venv/bin/python skills/ideer-daily-paper-chatbot/scripts/render_chatbot_artifacts.py": f".venv/bin/python {renderer}",
    }
    for old, new in replacements.items():
        rest = rest.replace(old, new)

    stamp = (
        f"\n\n<!-- Installed skill materialized from {source} "
        f"for PROJECT_DIR={repo_root} at {time.strftime('%Y-%m-%d %H:%M:%S %z')}. -->\n"
    )
    return begin + frontmatter + "\n" + rest + stamp


def backup_file(path: Path, backup_dir: Path) -> None:
    if not path.exists():
        return
    backup_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, backup_dir / path.name)


def install_workspace_skill(skill_text: str, a3s_home: Path) -> Path:
    out_dir = a3s_home / "workspace" / "skills"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / SKILL_FILE
    out_file.write_text(skill_text, encoding="utf-8")
    print(f"Installed workspace skill: {out_file}")
    return out_file


def install_bundled_skill(skill_text: str, app_path: Path, backup_dir: Path) -> tuple[Path, Path]:
    resources = app_path / "Contents" / "Resources" / "skills"
    if not resources.exists():
        raise SystemExit(f"InternShannon skills directory not found: {resources}")

    target = resources / SKILL_FILE
    manifest = resources / "managed-skills.json"
    backup_file(target, backup_dir)
    backup_file(manifest, backup_dir)

    target.write_text(skill_text, encoding="utf-8")

    if manifest.exists():
        entries = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(entries, list):
            raise SystemExit(f"Unexpected managed-skills.json shape: {manifest}")
    else:
        entries = []
    if SKILL_FILE not in entries:
        entries.append(SKILL_FILE)
    manifest.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Installed bundled skill: {target}")
    print(f"Updated bundled manifest: {manifest}")
    return target, manifest


def restart_app(app_path: Path) -> None:
    run(["osascript", "-e", f'tell application id "{SAFECLAW_BUNDLE_ID}" to quit'], check=False)
    time.sleep(2)
    run(["open", "-n", "-a", str(app_path)])
    time.sleep(4)


def verify_skill_api() -> bool | None:
    url = "http://127.0.0.1:29653/api/agent/skills"
    try:
        with urllib.request.urlopen(url, timeout=3) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"InternShannon skill API not reachable yet: {exc}")
        return None
    found = any(item.get("name") == SKILL_NAME or item.get("id") == SKILL_NAME for item in data)
    print(f"InternShannon skill API contains {SKILL_NAME}: {found}")
    return found


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=repo_root_from_script())
    parser.add_argument("--a3s-home", type=Path, default=DEFAULT_A3S_HOME)
    parser.add_argument("--app-path", type=Path, default=DEFAULT_APP)
    parser.add_argument("--skip-app-bundle", action="store_true", help="Only install into ~/.a3s/workspace/skills")
    parser.add_argument("--resign", action="store_true", help="Ad-hoc re-sign InternShannon after modifying bundled skills")
    parser.add_argument("--restart", action="store_true", help="Restart InternShannon after installation")
    parser.add_argument("--verify", action="store_true", help="Check the local InternShannon skill API after installation")
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    if not (repo_root / "skills" / SKILL_NAME / "SKILL.md").exists():
        raise SystemExit(f"Could not find {SKILL_NAME}/SKILL.md under {repo_root}")

    skill_text = materialize_skill(repo_root)
    install_workspace_skill(skill_text, args.a3s_home.expanduser())

    app_modified = False
    if not args.skip_app_bundle:
        if args.app_path.exists():
            backup_dir = args.a3s_home.expanduser() / "workspace" / "backups" / f"{SKILL_NAME}-{int(time.time())}"
            install_bundled_skill(skill_text, args.app_path, backup_dir)
            print(f"Backups, if any, were written under: {backup_dir}")
            app_modified = True
        else:
            print(f"InternShannon app not found at {args.app_path}; workspace skill installed only.")

    if app_modified and args.resign:
        run(["codesign", "--force", "--deep", "--sign", "-", str(args.app_path)])
        run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(args.app_path)])
    elif app_modified:
        print("App bundle was modified. Run again with --resign to restore local codesign verification.")

    if args.restart:
        restart_app(args.app_path)

    if args.verify:
        ok = verify_skill_api()
        if ok is False:
            raise SystemExit(f"{SKILL_NAME} was not found by InternShannon skill API.")


if __name__ == "__main__":
    main()
