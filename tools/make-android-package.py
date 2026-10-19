#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
一键生成「安卓打包材料」zip。

为什么要有这个脚本：
  以前每版都是手工挑文件、手工压缩，出过两类事故——
  ① 用了 Windows 自带 tar.exe 打 zip，中文文件名被写成 GBK 且没打 UTF-8 标志位，
     用户解压出来是乱码目录名，Gradle 直接找不到工程；
  ② www/ 与 android/app/src/main/assets/public/ 只更新了一处，
     打出来的 APK 里跑的还是上一版网页。
  这里把「同步 + 校验 + 压缩」一次做完，任何一步不符就报错退出，不出残包。

用法：
  python tools/make-android-package.py --version 1.11 --code 8
  python tools/make-android-package.py --version 1.11 --code 8 --out D:/tmp/xx.zip
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANDROID = ROOT / "source" / "linear-algebra-calculator" / "android"
AND_GRADLE_DIR = ANDROID / "android"
WWW = ANDROID / "www"
DOC = ROOT / "docs" / "安卓打包说明.md"
DESKTOP = Path.home() / "OneDrive" / "Desktop"

# 打进包里的顶层散装文件
FLAT_FILES = ["build-apk.bat", "build-apk.sh", "capacitor.config.json", "package.json"]
# Gradle 构建产物，绝不能进包
SKIP_DIRS = {"build", ".gradle", ".idea", "outputs", ".cxx"}


def die(msg: str) -> "NoReturn":  # type: ignore[valid-type]
    print(f"[失败] {msg}", file=sys.stderr)
    sys.exit(1)


def copy_tree(src: Path, dst: Path) -> int:
    """复制目录，跳过 Gradle 构建产物。返回复制的文件数。"""
    n = 0
    for p in src.rglob("*"):
        rel = p.relative_to(src)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        target = dst / rel
        if p.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, target)
            n += 1
    return n


def read_gradle_version(gradle: Path) -> tuple[int, str]:
    text = gradle.read_text(encoding="utf-8")
    code = re.search(r"versionCode\s+(\d+)", text)
    name = re.search(r'versionName\s+"([^"]+)"', text)
    if not code or not name:
        die(f"{gradle} 里找不到 versionCode / versionName")
    return int(code.group(1)), name.group(1)


def check_web_assets(web_dir: Path, label: str) -> None:
    """index.html 引用的每个资源都必须真的存在（历史上误删过 CSS）。"""
    index = web_dir / "index.html"
    if not index.is_file():
        die(f"{label} 缺少 index.html")
    html = index.read_text(encoding="utf-8")
    refs = re.findall(r'(?:src|href)="(?:\./)?(assets/[^"]+)"', html)
    if not refs:
        die(f"{label}/index.html 里没有引用任何 assets/ 资源，构建可能不对")
    for ref in refs:
        if not (web_dir / ref).is_file():
            die(f"{label} 引用了不存在的资源：{ref}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True, help="versionName，如 1.11")
    ap.add_argument("--code", required=True, type=int, help="versionCode，如 8")
    ap.add_argument("--out", help="输出 zip 路径（默认桌面）")
    ap.add_argument("--keep", action="store_true", help="保留临时 staging 目录")
    args = ap.parse_args()

    gradle = AND_GRADLE_DIR / "app" / "build.gradle"
    if not gradle.is_file():
        die(f"找不到 {gradle}")
    code, name = read_gradle_version(gradle)
    if code != args.code or name != args.version:
        die(
            f"build.gradle 里的版本是 {code}/{name}，与参数 {args.code}/{args.version} 不一致。"
            f"\n先改 build.gradle 再来打包，避免包名版本对不上。"
        )

    # 两处网页资源必须完全一致，否则 APK 里跑的是旧前端
    assets_public = AND_GRADLE_DIR / "app" / "src" / "main" / "assets" / "public"
    for label, d in (("www", WWW), ("assets/public", assets_public)):
        if not d.is_dir():
            die(f"找不到 {label}：{d}")
        check_web_assets(d, label)

    www_files = sorted(p.name for p in (WWW / "assets").iterdir())
    pub_files = sorted(p.name for p in (assets_public / "assets").iterdir())
    if www_files != pub_files:
        die(f"www/assets 与 assets/public/assets 不一致：\n  www: {www_files}\n  pub: {pub_files}")
    for f in www_files:
        if (WWW / "assets" / f).read_bytes() != (assets_public / "assets" / f).read_bytes():
            die(f"www/assets/{f} 与 assets/public/assets/{f} 内容不同，先同步再打包")

    pkg_name = f"线性代数计算器-安卓打包-v{args.version}"
    out = Path(args.out) if args.out else DESKTOP / f"{pkg_name}.zip"
    stage_root = Path(tempfile.mkdtemp(prefix="linalg-pkg-"))
    stage = stage_root / pkg_name
    stage.mkdir()

    # 1) 散装文件
    for f in FLAT_FILES:
        src = ANDROID / f
        if not src.is_file():
            die(f"缺少 {src}")
        shutil.copy2(src, stage / f)

    # bat 必须是纯 ASCII + CRLF，否则 cmd 在 GBK 代码页下解析乱码
    bat = (stage / "build-apk.bat").read_bytes()
    if any(b > 127 for b in bat):
        die("build-apk.bat 含非 ASCII 字节，cmd 下会乱码")
    if b"\r\n" not in bat:
        die("build-apk.bat 不是 CRLF 换行")
    sh_ = (stage / "build-apk.sh").read_bytes()
    if b"\r\n" in sh_:
        die("build-apk.sh 含 CRLF，Linux 上会报 bad interpreter")

    # 2) 安卓工程 + 网页资源
    n_android = copy_tree(AND_GRADLE_DIR, stage / "android")
    n_www = copy_tree(WWW, stage / "www")
    # 只带 @capacitor/android（Gradle 编译 Capacitor 库需要它）。
    # @capacitor/cli 不带：那是 `npx cap sync` 用的，自带一堆运行时依赖，
    # 单独拷进包里也跑不起来，白占 1MB。
    n_cap = copy_tree(
        ANDROID / "node_modules" / "@capacitor" / "android",
        stage / "node_modules" / "@capacitor" / "android",
    )

    # 3) 打包说明
    if not DOC.is_file():
        die(f"缺少 {DOC}")
    shutil.copy2(DOC, stage / "打包说明.md")

    # 4) 压缩（Python zipfile 会给非 ASCII 文件名打 UTF-8 标志位 0x800）
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(stage.rglob("*")):
            z.write(p, p.relative_to(stage_root).as_posix())

    # 5) 回读自检
    with zipfile.ZipFile(out) as z:
        names = z.namelist()
        bad = [n for n in names if n.isascii() is False and not (z.getinfo(n).flag_bits & 0x800)]
        if bad:
            die(f"以下条目缺少 UTF-8 标志位：{bad[:3]}")
        must = [
            f"{pkg_name}/android/app/build.gradle",
            f"{pkg_name}/android/app/src/main/assets/public/index.html",
            f"{pkg_name}/www/index.html",
            f"{pkg_name}/build-apk.bat",
            f"{pkg_name}/打包说明.md",
            f"{pkg_name}/node_modules/@capacitor/android/package.json",
        ]
        missing = [m for m in must if m not in names]
        if missing:
            die(f"包里缺关键文件：{missing}")
        inner = z.read(f"{pkg_name}/android/app/build.gradle").decode("utf-8")
        if f"versionCode {args.code}" not in inner or f'versionName "{args.version}"' not in inner:
            die("包内 build.gradle 版本号不对")

    if not args.keep:
        shutil.rmtree(stage_root, ignore_errors=True)

    size_mb = out.stat().st_size / 1024 / 1024
    print(f"版本        : versionCode {args.code} / versionName {args.version}")
    print(f"android/    : {n_android} 个文件")
    print(f"www/        : {n_www} 个文件（assets: {', '.join(www_files)}）")
    print(f"node_modules: {n_cap} 个文件（@capacitor/android）")
    print(f"zip 条目    : {len(names)}")
    print(f"输出        : {out}  ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
