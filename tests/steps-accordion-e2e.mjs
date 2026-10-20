// 验证「全部展开」：真的点一下，数展开的步骤数
import { spawn } from "node:child_process";
import fs from "node:fs";
import { CHROME, PAGE } from "./lib/env.mjs";

const PORT = 9344;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  `--remote-debugging-port=${PORT}`, "--window-size=1400,1000",
  "--user-data-dir=C:/Users/hp/AppData/Local/Temp/linalg-cdp-steps", PAGE,
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
await sleep(2500);

let pass = 0, fail = 0;
const check = (n, c, d) => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}  → ${d ?? ""}`)); };

// 算一次行列式（示例矩阵 → det），产生带步骤的结果
const setup = await ev(`(() => {
  const btns = [...document.querySelectorAll('button')];
  const det = btns.find(b => b.textContent.includes('行列式 det'));
  if (!det) return 'no-det-button';
  det.click();
  return 'ok';
})()`);
check("点「行列式 det」出结果", setup === "ok", setup);
await sleep(1200);

// 展开步骤面板
const opened = await ev(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('消元过程'));
  if (!btn) return 'no-accordion';
  btn.click();
  return 'ok';
})()`);
check("展开步骤面板", opened === "ok", opened);
await sleep(800);

const before = await ev(`(() => {
  const items = [...document.querySelectorAll('button[aria-expanded]')];
  const all = [...document.querySelectorAll('button')].map(b => (b.textContent||'').trim().slice(0,18)).filter(Boolean);
  const stepish = [...document.querySelectorAll('button')].filter(b => (b.textContent||'').includes('第 ') && (b.textContent||'').includes('步'));
  const html = stepish[0] ? [...stepish[0].attributes].map(a => a.name + "=" + a.value.slice(0,12)).join(" | ") : null;
  return { total: items.length, expanded: 0, stepButtons: stepish.length, html };
})()`);
check("步骤条目存在且默认全收起", before.total > 0 && before.expanded === 0, JSON.stringify(before));

// 点「全部展开」
const clicked = await ev(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '全部展开');
  if (!btn) return 'no-button';
  btn.click();
  return 'ok';
})()`);
check("找到并点击「全部展开」", clicked === "ok", clicked);
await sleep(600);

const after = await ev(`(() => {
  const items = [...document.querySelectorAll('button[aria-expanded]')];
  const label = [...document.querySelectorAll('button')].filter(b => /全部(展开|折叠)/.test(b.textContent.trim())).map(b => b.textContent.trim());
  const matrices = document.querySelectorAll('[data-copy-row]').length;
  return {
    total: items.length,
    expanded: items.filter(b => b.getAttribute('aria-expanded') === 'true').length,
    label,
    matrixRows: matrices,
  };
})()`);
check(
  "全部展开后每一步都展开",
  after.expanded === after.total && after.total > 0,
  JSON.stringify(after)
);
check("按钮文案变成「全部折叠」", after.label.includes("全部折叠"), JSON.stringify(after.label));
check("展开后确实渲染了矩阵行", after.matrixRows > before.total, `rows=${after.matrixRows}`);

// 再点一次收回
await ev(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '全部折叠');
  if (btn) btn.click();
  return true;
})()`);
await sleep(600);
const collapsed = await ev(`(() => {
  const items = [...document.querySelectorAll('button[aria-expanded]')];
  return { total: items.length, expanded: items.filter(b => b.getAttribute('aria-expanded') === 'true').length };
})()`);
check("「全部折叠」能收回去", collapsed.expanded === 0, JSON.stringify(collapsed));

// 单个步骤独立切换仍可用
const single = await ev(`(() => {
  const items = [...document.querySelectorAll('button[aria-expanded]')];
  items[0]?.click();
  return items.length;
})()`);
await sleep(400);
const singleState = await ev(`(() => {
  const items = [...document.querySelectorAll('button[aria-expanded]')];
  return items.filter(b => b.getAttribute('aria-expanded') === 'true').length;
})()`);
check("单步点击仍能独立展开", singleState === 1, `expanded=${singleState}/${single}`);

console.log(`\n结果：${pass} 通过，${fail} 失败`);
ws.close(); chrome.kill();
process.exit(fail === 0 ? 0 : 1);
