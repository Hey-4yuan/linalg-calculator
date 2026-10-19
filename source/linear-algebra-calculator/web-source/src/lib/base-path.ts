/**
 * 解析 React Router 的 basename。
 *
 * 静态托管有几种常见 URL 形态，必须都能正确落到首页：
 *   https://host/                  → "/"
 *   https://host/index.html        → "/"
 *   https://host/repo/             → "/repo"
 *   https://host/repo/index.html   → "/repo"
 *   file:///C:/.../app.html        → "/C:/..."（本地双击，路由仍能落到 "/"）
 *
 * 平台部署会注入 window.__BASENAME__ 或 CLIENT_BASE_PATH，优先级最高。
 * 返回值不带尾斜杠（根路径 "/" 除外），React Router 会自行处理。
 */
export function resolveBasename(
  pathname: string,
  injected?: string | null
): string {
  const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p || "/");

  if (injected) return trim(injected);
  if (!pathname || pathname === "/") return "/";
  // 本地双击打开（file:///C:/Users/.../线性代数计算器.html）：这是文件系统路径，
  // 不是 URL 目录。把它当 basename 会剩下 "/线性代数计算器.html" 匹配不到任何路由，
  // 页面直接落到 404 兜底页 —— 统一交回根路径，路由交给 HashRouter。
  if (isFileSystemPath(pathname)) return "/";

  const lastSlash = pathname.lastIndexOf("/");
  const lastSegment = pathname.slice(lastSlash + 1);

  // 以文件名结尾（含扩展名）：取所在目录
  if (lastSegment.includes(".")) {
    return trim(pathname.slice(0, lastSlash + 1) || "/");
  }
  // 目录形态（带或不带尾斜杠）
  return trim(pathname);
}

/** "/C:/Users/x/app.html" 这类 Windows 本地路径 */
export function isFileSystemPath(pathname: string): boolean {
  return /^\/[A-Za-z]:[\\/]/.test(pathname) || /^\/\//.test(pathname);
}

/**
 * 该用哪种路由。
 *
 * http(s) 用 BrowserRouter（URL 干净，GitHub Pages 子路径已验证）。
 * file:// 与 capacitor:// 这类自定义协议没有可用的 history API，
 * pathname 也不是站点目录 —— 用 HashRouter，路由放在 # 后面。
 */
export function resolveRouterMode(protocol: string): "browser" | "hash" {
  return /^https?:$/i.test(protocol || "") ? "browser" : "hash";
}
