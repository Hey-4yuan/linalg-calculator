# -*- coding: utf-8 -*-
"""
生成 PWA / iOS 主屏图标（PNG）。

设计：品牌紫渐变圆角方块 + 白色矩阵括号与 2×2 元素点。
输出到 web-source/public/icons/：
    icon-192.png、icon-512.png、icon-maskable-512.png、apple-touch-icon-180.png

用法：python tools/make-icons.py
依赖：pip install pillow
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / (
    "source/linear-algebra-calculator/web-source/public/icons"
)
SS = 4  # 超采样倍数，抗锯齿


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_icon(size: int, *, maskable: bool = False, opaque: bool = False) -> Image.Image:
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 背景：竖向渐变（先画渐变条再裁圆角）
    top, bottom = (134, 59, 255), (91, 33, 182)  # #863bff → #5b21b6
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp(top, bottom, y / max(1, S - 1)) + (255,))

    # 圆角遮罩：maskable 用更大的安全边距（内容压在中间 80%）
    radius = 0 if opaque else int(S * 0.22)
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    if radius:
        md.rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=255)
    else:
        md.rectangle([0, 0, S - 1, S - 1], fill=255)
    img.paste(grad, (0, 0), mask)

    # 前景（白色矩阵符号）
    fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fg)

    pad = S * (0.30 if maskable else 0.26)
    left, right = pad, S - pad
    top_y, bot_y = pad, S - pad
    stroke = max(2, int(S * 0.048))
    r = stroke / 2
    arm = S * 0.11  # 括号横臂长度（朝内）

    # 左括号：竖线 + 上下两条朝右的横臂
    fd.rounded_rectangle([left - r, top_y, left + r, bot_y], radius=r, fill=(255, 255, 255, 255))
    fd.rounded_rectangle([left - r, top_y - r, left + arm, top_y + r], radius=r, fill=(255, 255, 255, 255))
    fd.rounded_rectangle([left - r, bot_y - r, left + arm, bot_y + r], radius=r, fill=(255, 255, 255, 255))

    # 右括号：竖线 + 上下两条朝左的横臂
    fd.rounded_rectangle([right - r, top_y, right + r, bot_y], radius=r, fill=(255, 255, 255, 255))
    fd.rounded_rectangle([right - arm, top_y - r, right + r, top_y + r], radius=r, fill=(255, 255, 255, 255))
    fd.rounded_rectangle([right - arm, bot_y - r, right + r, bot_y + r], radius=r, fill=(255, 255, 255, 255))

    # 2×2 元素点
    dot = S * 0.085
    gap_x = (right - left) * 0.30
    gap_y = (bot_y - top_y) * 0.32
    cx, cy = S / 2, S / 2
    for dx in (-gap_x / 2, gap_x / 2):
        for dy in (-gap_y / 2, gap_y / 2):
            fd.rounded_rectangle(
                [cx + dx - dot / 2, cy + dy - dot / 2,
                 cx + dx + dot / 2, cy + dy + dot / 2],
                radius=dot * 0.22, fill=(255, 255, 255, 255),
            )

    img = Image.alpha_composite(img, fg)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, dict()),
        ("icon-512.png", 512, dict()),
        ("icon-maskable-512.png", 512, dict(maskable=True)),
        ("apple-touch-icon-180.png", 180, dict(opaque=True)),
    ]
    for name, size, kw in jobs:
        im = draw_icon(size, **kw)
        im.save(OUT / name)
        print("生成", OUT / name, im.size)


if __name__ == "__main__":
    main()
