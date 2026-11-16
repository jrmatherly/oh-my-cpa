#!/usr/bin/env python3
"""Re-apply this fork's English wording to the backend's hardcoded Chinese strings.

Upstream writes quota labels, reset and expiry phrases and recommendation reasons in Chinese,
in Go source, and its tests and golden files expect them. This fork writes them in English.
After an upstream merge, new or conflicted files carry the Chinese again; this rewrites every
known phrase, in source, tests and golden files alike, and drops the Chinese half of the
demonstration's recordings. It is idempotent.

It is also the fork's gate. The fork holds no Chinese character outside ALLOWED, so anything
this script cannot rewrite is listed and fails the run: a new upstream phrase gets a row in
PHRASES, and other Chinese text is rewritten in English by hand, or written as Unicode
escapes where a test has to feed Chinese data to a parser.

Usage: english-strings.py [--check]   (--check changes nothing; either form exits 1 while
Chinese remains outside ALLOWED)
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
# Files that may hold Chinese. This table is one. The rest are the docs and the public site,
# which the docs phase of the English-only work removes; delete their rows with it.
ALLOWED = [
    re.compile(r"^\.claude/skills/upstream-review/scripts/english-strings\.py$"),
    re.compile(r"^docs/"),
    re.compile(r"^deploy/site/"),
    re.compile(r"^README(\.zh-CN)?\.md$"),
    re.compile(r"^scripts/(sync-docs-site|render-social-cards)\.mjs$"),
    re.compile(r"^\.github/ISSUE_TEMPLATE/"),
]
HAN = re.compile(r"[一-鿿]")

# Whole phrases, longest first so a phrase is never rewritten through one of its parts.
PHRASES = {
    "5小时用量上限 (5-Hour)": "5-hour usage limit",
    "每日用量上限 (Daily)": "Daily usage limit",
    "每周用量上限 (Weekly)": "Weekly usage limit",
    "月度用量上限 (Monthly)": "Monthly usage limit",
    "5小时限制 (5-Hour)": "5-hour limit",
    "每日限制 (Daily)": "Daily limit",
    "每周限制 (Weekly)": "Weekly limit",
    "每月限制 (Monthly)": "Monthly limit",
    "5小时滚动用量 (5-Hour)": "5-hour rolling usage",
    "每周总用量上限 (Weekly)": "Weekly usage limit",
    "第三方应用 每周用量": "Third-party apps weekly usage",
    "Cowork 协作每周用量": "Cowork weekly usage",
    "额度总使用率 (Credit Usage)": "Credit usage",
    "未知套餐": "Unknown plan",
    "未知来源": "Unknown source",
    "代码审查": "Code review",
    "已恢复": "Recovered",
    "已到期": "expired",
    "刚刚": "just now",
    "窗口重置后": "after window reset",
    "最近一次额度刷新认证失败，凭据可能已失效，建议重新授权": "The last quota refresh failed authentication. The credential may have expired; sign in again.",
    "最近一次额度刷新失败，正在显示上一次成功读取的数据，可尝试重新刷新": "The last quota refresh failed. Showing the last successful reading; try refreshing again.",
    "最近一次额度刷新失败，尚未取得额度读数，可尝试重新刷新": "The last quota refresh failed and no reading is available yet; try refreshing again.",
    "读数已超过其窗口的重置时间，刷新以获取当前额度": "This reading is older than its window's reset time. Refresh for the current quota.",
    "CPA 冷却保护生效中": "CPA cooldown protection is active",
    "凭据已禁用": "Credential disabled",
    "上游认证失败或凭据失效，建议重新配置密钥或登录授权": "Upstream authentication failed or the credential expired. Reconfigure the key or sign in again.",
    "上游刷新超时或响应异常，已保留最近快照，可尝试重新刷新": "The upstream refresh timed out or returned an invalid response. The last snapshot is kept; try refreshing again.",
    "当前窗口配额已耗尽，有可用 Codex 重置积分，可立即重置恢复容量": "This window's quota is exhausted. A Codex reset credit is available; reset now to restore capacity.",
    "配额已耗尽，请等待重置时间窗口或切换其他可用凭据": "Quota exhausted. Wait for the window to reset or switch to another credential.",
    "配额余量低于 20%，检测到有可用重置积分储备": "Less than 20% of the quota remains. Reset credits are available.",
    "配额余量偏低（不足 20%），请注意流量消耗": "Quota is running low (under 20% left). Watch usage.",
    "配额健康充足，服务运行正常": "Quota is healthy and the service is running normally.",
    "上游未发布配额窗口，读取本身已成功": "The upstream publishes no quota windows; the read itself succeeded.",
    "暂无实时配额数据，可点击刷新获取上游最新额度": "No live quota data yet. Refresh to fetch the latest from upstream.",
    "配额已耗尽": "Quota exhausted",
}

# Composed phrases, applied in order: labels first, then the durations they contain.
PERIOD = {"5小时": "5-hour", "每日": "daily", "每周": "weekly", "每月": "monthly"}
PATTERNS = [
    (re.compile(r"(5小时|每日|每周|每月)(?:配额)"), lambda m: PERIOD[m.group(1)] + " limit"),
    (re.compile(r"(\d+(?:\.\d+)?)分钟配额"), r"\1-minute limit"),
    (re.compile(r"(\d+(?:\.\d+)?)小时配额"), r"\1-hour limit"),
    (re.compile(r"(\S+) (5小时|每日|每周|每月)用量"), lambda m: f"{m.group(1)} {PERIOD[m.group(2)]} usage"),
    (re.compile(r"(\d+)天(\d+)小时"), r"\1d \2h"),
    (re.compile(r"(\d+)小时(\d+)分(?!钟)"), r"\1h \2m"),
    (re.compile(r"(\d+)分钟"), r"\1m"),
    (re.compile(r"(\d+)小时"), r"\1h"),
    (re.compile(r"(\d+)天"), r"\1d"),
    (re.compile(r"\(([^()\n]*?)后恢复\)"), r"(in \1)"),
    (re.compile(r"(\d+d(?: \d+h)?|\d+h(?: \d+m)?|\d+m|just now)后到期"), r"expires in \1"),
]


def rewrite(text: str) -> str:
    for old in sorted(PHRASES, key=len, reverse=True):
        text = text.replace(old, PHRASES[old])
    for pattern, replacement in PATTERNS:
        text = pattern.sub(replacement, text)
    return text


# The demonstration's recordings write each sentence once per language, as {"zh": ..., "en": ...}
# with one string per line. This fork replays English only, so the Chinese line goes.
RECORDINGS = ["web/src/demo/agentRecording.json", "web/src/demo/playgroundRecording.json"]
RECORDED_CHINESE = re.compile(r'^[ \t]*"zh": ".*",\n(?=[ \t]*"en": ")', re.M)


def strip_recordings(check: bool) -> list:
    changed = []
    for name in RECORDINGS:
        path = ROOT / name
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        new = RECORDED_CHINESE.sub("", text)
        if new == text:
            continue
        json.loads(new)
        changed.append(name)
        if not check:
            path.write_text(new, encoding="utf-8")
    return changed


def main() -> int:
    check = "--check" in sys.argv[1:]
    files = subprocess.check_output(["git", "ls-files"], text=True, cwd=ROOT).split("\n")
    changed, unknown = strip_recordings(check), []
    for name in filter(None, files):
        path = ROOT / name
        if not path.is_file() or any(rule.search(name) for rule in ALLOWED):
            continue
        try:
            with open(path, encoding="utf-8", newline="") as handle:
                text = handle.read()
        except UnicodeDecodeError:
            continue
        if not HAN.search(text):
            continue
        new = rewrite(text)
        if new != text:
            changed.append(name)
            if not check:
                with open(path, "w", encoding="utf-8", newline="") as handle:
                    handle.write(new)
        left = sum(1 for line in new.split("\n") if HAN.search(line))
        if left:
            unknown.append((left, name))
    for name in changed:
        print(("would rewrite " if check else "rewrote ") + name)
    if unknown:
        print("Chinese text this fork must not carry (add a PHRASES row, rewrite it in English, or escape test data):")
        for left, name in sorted(unknown, reverse=True):
            print(f"  {left:4d} lines  {name}")
    return 1 if unknown or (check and changed) else 0


if __name__ == "__main__":
    sys.exit(main())
