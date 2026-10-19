// 验证 OCR 配置弹窗在安卓小屏上不溢出视口、底部按钮可点
// 背景：DialogContent 是 fixed + translateY(-50%) 垂直居中，旧版没有高度上限，
// 内容一高就同时向上、向下溢出，顶部标题和底部「保存配置」都被裁到屏幕外点不到。
import { spawn } from "node:child_process";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PAGE = "file:///C:/Users/hp/OneDrive/Desktop/线性代数计算器/线性代数计算器.html";
const PORT = 9345;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  `--remote-debugging-port=${PORT}`, "--window-size=360,640",
  "--user-data-dir=C:/Users/hp/AppData/Local/Temp/linalg-cdp-dialog", PAGE,
], { stdio: "ignore" });

const waitJson = async (url, tries = 60) => {
  for (let i = 0; i < tries; i += 1) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    await sleep(250);
  }
  throw new Error("CDP 未就绪");
};

const list = await waitJson(`http://127.0.0.1:${PORT}/json/list`);
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  id += 1; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await sleep(2000);

let pass = 0, fail = 0;
const check = (n, c, d) => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}  → ${d ?? ""}`)); };

/** 把视口切成指定尺寸，模拟安卓小屏 */
const setViewport = async (w, h) => {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w, height: h, deviceScaleFactor: 2, mobile: true,
  });
  await sleep(400);
};

/** 打开弹窗：先清掉本地配置，让按钮文案回到「配置 OCR」 */
const openDialog = async () => {
  await ev(`(() => { localStorage.clear(); return true; })()`);
  await send("Page.reload");
  await sleep(2200);
  return ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '配置 OCR');
    if (!btn) return 'no-button:' + [...document.querySelectorAll('button')].map(b => (b.textContent||'').trim()).filter(Boolean).slice(0, 12).join(',');
    btn.click();
    return 'ok';
  })()`);
};

/** 量弹窗与底部按钮的几何信息 */
const measure = () => ev(`(() => {
  const dlg = document.querySelector('[data-slot="dialog-content"]');
  if (!dlg) return { error: 'no-dialog' };
  const dr = dlg.getBoundingClientRect();
  const vh = window.innerHeight, vw = window.innerWidth;

  const btn = [...dlg.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '保存配置');
  const cancel = [...dlg.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '取消');
  const clear = [...dlg.querySelectorAll('button')].find(b => (b.textContent || '').includes('清除配置'));
  if (!btn) return { error: 'no-save-button' };

  const br = btn.getBoundingClientRect();
  const cx = br.left + br.width / 2, cy = br.top + br.height / 2;
  // 命中测试：这个坐标上最顶层的元素必须是保存按钮本身（或它的子节点）
  const hit = document.elementFromPoint(cx, cy);
  const hitIsButton = !!(hit && (btn === hit || btn.contains(hit)));

  // 中间滚动区：可滚动 = 内容高于可视高度
  const scroller = [...dlg.querySelectorAll('div')].find(el => {
    const s = getComputedStyle(el);
    return /auto|scroll/.test(s.overflowY) && el.scrollHeight > 0;
  });

  return {
    vw, vh,
    dialog: { top: Math.round(dr.top), bottom: Math.round(dr.bottom), h: Math.round(dr.height), w: Math.round(dr.width) },
    save: { top: Math.round(br.top), bottom: Math.round(br.bottom), h: Math.round(br.height) },
    cancelBottom: cancel ? Math.round(cancel.getBoundingClientRect().bottom) : null,
    clearVisible: clear ? clear.getBoundingClientRect().bottom <= vh : null,
    hitIsButton,
    scrollable: scroller ? scroller.scrollHeight > scroller.clientHeight + 1 : false,
    scrollInfo: scroller ? { sh: scroller.scrollHeight, ch: scroller.clientHeight } : null,
  };
})()`);

/**
 * 可达性：滚动区内的控件在某一刻位于视口外是正常的（滚一下就能看到），
 * 真正的红线是「滚也滚不到」。逐个 scrollIntoView 后必须完整落进视口。
 * 另外每个控件必须属于滚动区或底部固定区，不能悬在两个区域之外。
 */
const reachability = () => ev(`(() => {
  const dlg = document.querySelector('[data-slot="dialog-content"]');
  if (!dlg) return { error: 'no-dialog' };
  const vh = window.innerHeight;
  const footer = dlg.querySelector('[data-slot="dialog-footer"]');
  const scroller = [...dlg.querySelectorAll('div')].find(el => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > 0);
  const controls = [...dlg.querySelectorAll('input, button')].filter(el => el.offsetParent !== null);
  const unreachable = [];
  const orphan = [];
  for (const el of controls) {
    // 右上角关闭按钮由 DialogContent 自身渲染（绝对定位），不属于滚动区或 footer，属正常
    const isCloseBtn = el.matches('[data-slot="dialog-close"]') || !!el.querySelector('span.sr-only');
    const inFooter = !!(footer && footer.contains(el));
    const inScroller = !!(scroller && scroller.contains(el));
    if (!inFooter && !inScroller && !isCloseBtn) orphan.push((el.id || el.tagName).slice(0, 20));
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    if (r.top < -1 || r.bottom > vh + 1 || r.height === 0) {
      unreachable.push((el.textContent || el.id || el.tagName).trim().slice(0, 16) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom));
    }
  }
  // 复位到顶部，后续断言从初始态开始
  if (scroller) scroller.scrollTop = 0;
  return { total: controls.length, unreachable, orphan };
})()`);

/** 各尺寸下跑一遍：弹窗不溢出、保存按钮可点 */
const runCase = async (w, h) => {
  console.log(`\n[视口 ${w}×${h}]`);
  await setViewport(w, h);
  const opened = await openDialog();
  check(`弹出配置弹窗`, opened === "ok", opened);
  await sleep(700);

  const m = await measure();
  if (m.error) { check("能量到弹窗 DOM", false, m.error); return; }

  check(
    `弹窗不超出视口上下边界（top=${m.dialog.top}, bottom=${m.dialog.bottom}, vh=${m.vh}）`,
    m.dialog.top >= -1 && m.dialog.bottom <= m.vh + 1,
    JSON.stringify(m.dialog)
  );
  check(
    `弹窗不超出视口左右边界（w=${m.dialog.w} / vw=${m.vw}）`,
    m.dialog.w <= m.vw,
    JSON.stringify(m.dialog)
  );
  check(
    `「保存配置」完整可见（bottom=${m.save.bottom} ≤ vh=${m.vh}）`,
    m.save.bottom <= m.vh + 1 && m.save.top >= -1,
    JSON.stringify(m.save)
  );
  check(`「保存配置」点击位置命中按钮本身`, m.hitIsButton === true, String(m.hitIsButton));
  check(`「取消」也在视口内`, m.cancelBottom !== null && m.cancelBottom <= m.vh + 1, String(m.cancelBottom));
  check(`「清除配置」也在视口内`, m.clearVisible === true, String(m.clearVisible));

  const reach = await reachability();
  if (reach.error) {
    check("能量到弹窗控件", false, reach.error);
  } else {
    check(
      `每个输入框/按钮都能滚到视口内（共 ${reach.total} 个）`,
      reach.unreachable.length === 0,
      JSON.stringify(reach.unreachable)
    );
    check(
      `没有控件悬在滚动区/底部固定区之外`,
      reach.orphan.length === 0,
      JSON.stringify(reach.orphan)
    );
  }

  check(
    `内容超出时中间区可滚动（${m.scrollInfo ? m.scrollInfo.sh + " > " + m.scrollInfo.ch : "n/a"}）`,
    m.scrollable === true || m.dialog.h <= m.vh,
    JSON.stringify(m.scrollInfo)
  );

  // 真滚到底：footer 位置必须纹丝不动（说明它在滚动容器之外）
  const beforeTop = m.save.top;
  const scrolled = await ev(`(() => {
    const dlg = document.querySelector('[data-slot="dialog-content"]');
    const scroller = [...dlg.querySelectorAll('div')].find(el => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1);
    if (!scroller) return 'no-scroll-needed';
    scroller.scrollTop = scroller.scrollHeight;
    return 'scrolled:' + Math.round(scroller.scrollTop);
  })()`);
  await sleep(300);
  const afterM = await measure();
  const footerStable = afterM.save && Math.abs(afterM.save.top - beforeTop) <= 2;
  check(
    `滚到底后底部按钮位置不变（${scrolled}）`,
    footerStable,
    `${beforeTop} → ${afterM.save && afterM.save.top}`
  );
  check(
    `滚到底后「保存配置」仍在视口内（bottom=${afterM.save && afterM.save.bottom}）`,
    afterM.save && afterM.save.bottom <= afterM.vh + 1,
    JSON.stringify(afterM.save)
  );

  // 滚到底后真的点一下「保存配置」：没填 Key 应弹错误提示而不是崩溃/无响应
  const toastText = await ev(`(async () => {
    const btn = [...document.querySelectorAll('[data-slot="dialog-content"] button')].find(b => (b.textContent || '').trim() === '保存配置');
    if (!btn) return 'no-button';
    btn.click();
    await new Promise(r => setTimeout(r, 500));
    const t = [...document.querySelectorAll('[data-sonner-toast], li[data-sonner-toast]')].map(e => e.textContent.trim());
    return t.join(' | ') || 'no-toast';
  })()`);
  check(
    `点击「保存配置」有反馈（${toastText}）`,
    /API Key|Base URL|模型/.test(toastText),
    toastText
  );

  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim() === '取消'); if (b) b.click(); return true; })()`);
  await sleep(400);
  const closed = await ev(`(() => !document.querySelector('[data-slot="dialog-content"]'))()`);
  check(`「取消」能关掉弹窗`, closed === true, String(closed));
};

await runCase(360, 640);   // 主流安卓小屏
await runCase(320, 480);   // 极窄老机型，最容易溢出
await runCase(412, 915);   // 常见大屏安卓

console.log(`\n结果：${pass} 通过，${fail} 失败`);
ws.close(); chrome.kill();
process.exit(fail === 0 ? 0 : 1);
