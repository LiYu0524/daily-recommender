import sys
import time
import threading
from pathlib import Path

import httpx
import uvicorn
import webview

import web_server as server_module

# PyInstaller --onefile 会解压到临时目录，退出后清除
# 将可写数据路径重定向到 exe 所在目录，避免每次运行数据丢失
if getattr(sys, "frozen", False):
    d = Path(sys.executable).parent
    _DATA_PATHS = {
        "HISTORY_DIR":              "history",
        "CONFIG_FILE":              ".web_config.json",
        "CLIENT_CONFIG_FILE":       ".client_config.json",
        "ENV_FILE":                 ".env",
        "DESCRIPTION_FILE":         "profiles/description.txt",
        "RESEARCHER_PROFILE_FILE":  "profiles/researcher_profile.md",
        "TWITTER_ACCOUNTS_FILE":    "profiles/x_accounts.txt",
        "SWIPE_FEEDBACK_FILE":      "profiles/swipe_feedback.json",
        "USERS_DIR":                "users",
    }
    for attr, rel in _DATA_PATHS.items():
        setattr(server_module, attr, d / rel)

    # 打包后 web_server 用 sys.executable 调用 main.py，实际会重启 exe
    # 检测到 "main.py" 参数时，直接调用 main() 函数
    if "main.py" in sys.argv:
        sys.argv.remove("main.py")
        from main import main as run_main
        run_main()
        sys.exit(0)


def start_server():
    uvicorn.run(server_module.app, host="127.0.0.1", port=8090)


def wait_for_server(url: str = "http://127.0.0.1:8090/health", timeout: int = 15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if httpx.get(url, timeout=1).status_code == 200:
                return
        except Exception:
            pass
        time.sleep(0.3)
    raise TimeoutError("Server did not start in time")


threading.Thread(target=start_server, daemon=True).start()
wait_for_server()

webview.create_window(
    "iDeer",
    "http://127.0.0.1:8090",
    width=1280,
    height=800,
    min_size=(960, 600),
)
# webview.start(debug=True)
webview.start()
