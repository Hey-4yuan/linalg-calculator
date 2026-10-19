import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { AppContainer, ErrorRender } from "@lark-apaas/client-toolkit-lite";
import App from "./app";
import { resolveBasename, resolveRouterMode } from "./lib/base-path";
import { requestPersistentStorage } from "./lib/pwa";
import "./index.css";

// basename 推断：平台注入优先，其次按当前 URL 目录推断。
// 这样同一份产物既能部署在域名根路径，也能部署在 /repo/ 这类子路径（GitHub Pages 项目站点）。
const basename = resolveBasename(
  window.location.pathname,
  (window as unknown as { __BASENAME__?: string }).__BASENAME__ ||
    process.env.CLIENT_BASE_PATH,
);

// file:// 双击打开的单文件版没有站点目录，pathname 是磁盘路径（/C:/Users/.../x.html）。
// 这种场景必须用 HashRouter：BrowserRouter 会把文件名当成子路径，直接落到 404 兜底页。
const Router = resolveRouterMode(window.location.protocol) === "hash"
  ? HashRouter
  : BrowserRouter;
const routerProps = Router === HashRouter ? {} : { basename };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router {...routerProps}>
      <AppContainer>
        <ErrorBoundary
          fallbackRender={({ error, resetErrorBoundary }) => (
            <ErrorRender error={error} resetErrorBoundary={resetErrorBoundary} />
          )}
        >
          <App />
        </ErrorBoundary>
      </AppContainer>
    </Router>
  </StrictMode>,
);

// PWA：仅在 HTTPS（或 localhost）下注册，失败静默——平台部署没有 sw.js 时也不会报错。
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* 忽略：非 PWA 部署环境 */
    });
  });
}

// 尽力申请持久化存储：Chromium 系生效后本地数据不会被自动清退；
// iOS Safari 没有这个 API，静默跳过（那边只能靠"添加到主屏"）。
void requestPersistentStorage();
