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
import codecs
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], encoding="utf-8").strip())
# Files that may hold Chinese: this one, whose phrase table names what it rewrites.
ALLOWED = [
    re.compile(r"^\.claude/skills/upstream-review/scripts/english-strings\.py$"),
]
# Chinese ideographs with every extension and the compatibility blocks, radicals, bopomofo and
# strokes, plus CJK and full-width punctuation (kana and Hangul are not Chinese and pass), so a half-rewritten phrase that keeps its
# brackets or comma still fails.
HAN = re.compile(
    r"[\u2e80-\u2fdf\u3000-\u303f\u3100-\u312f\u31a0-\u31ef\u3400-\u4dbf\u4e00-\u9fff"
    r"\uf900-\ufaff\uff00-\uffef\U00020000-\U0003ffff]"
)
UTF16_BOMS = (codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)

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
        if '"zh":' in new:
            sys.exit(f"{name}: a \"zh\" entry is not in the shape this script strips; strip it by hand")
        if new == text:
            continue
        json.loads(new)
        changed.append(name)
        if not check:
            path.write_text(new, encoding="utf-8")
    return changed


# What the table and the patterns must produce. Checked on every run, so a reordered pattern or a
# gate that stopped seeing Chinese fails here instead of passing quietly.
EXPECTED = {
    "02:46 (2小时47分后恢复)": "02:46 (in 2h 47m)",
    "01-05 15:06 (4天15小时后恢复)": "01-05 15:06 (in 4d 15h)",
    "3天4小时后到期": "expires in 3d 4h",
    "GPT-5.3-Codex-Spark 5小时配额": "GPT-5.3-Codex-Spark 5-hour limit",
    "X 1.5小时配额": "X 1.5-hour limit",
    "X 45分钟配额": "X 45-minute limit",
    "Sonnet 每周用量": "Sonnet weekly usage",
    "每周用量上限 (Weekly)": "Weekly usage limit",
}


def self_check() -> None:
    for source, wanted in EXPECTED.items():
        got = rewrite(source)
        assert got == wanted, f"rewrite({source!r}) = {got!r}, want {wanted!r}"
        assert rewrite(got) == got, f"rewrite is not idempotent on {source!r}"
    assert HAN.search(rewrite("每日限额")), "the gate no longer sees an untranslated phrase"
    assert HAN.search("\U00020000"), "the gate no longer sees an ideograph outside the basic plane"


def main() -> int:
    if any(argument != "--check" for argument in sys.argv[1:]):
        sys.exit(__doc__)
    self_check()
    check = "--check" in sys.argv[1:]
    # -z: git quotes a path with non-ASCII characters otherwise, and a quoted path is not a file.
    # Paths are decoded as UTF-8 whatever the locale, or a Chinese file name reads as mojibake.
    files = subprocess.check_output(["git", "ls-files", "-z"], encoding="utf-8", cwd=ROOT).split("\0")
    changed, unknown = strip_recordings(check), []
    for name in filter(None, files):
        path = ROOT / name
        if not path.is_file() or any(rule.search(name) for rule in ALLOWED):
            continue
        if HAN.search(name):
            unknown.append((0, name + "  (the file name)"))
        raw = path.read_bytes()
        if raw.startswith(UTF16_BOMS):
            # UTF-16 text is full of NUL bytes, so it would pass below as binary.
            if HAN.search(raw.decode("utf-16", errors="replace")):
                unknown.append((0, name + "  (UTF-16, rewrite it by hand as UTF-8)"))
            continue
        if b"\0" in raw:
            continue  # binary
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            unknown.append((0, name + "  (not UTF-8, cannot be checked)"))
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
