import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { Layout } from "@/components/Layout";
import AddToHomeScreenBanner from "@/components/AddToHomeScreenBanner";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";
import HomePage from "@/pages/HomePage/HomePage";

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      {/* 全局挂载：404 兜底页也要能提示加主屏 */}
      <AddToHomeScreenBanner />
      {/*
        必须挂 Toaster，否则全站 9 处 toast() 调用全部静默失效
        （之前一直没挂：复制成功、参数校验失败、配置保存都没有任何提示，
        小屏上点「保存配置」但没填 Key 时会像卡死一样毫无反应）。
      */}
      <Toaster />
    </>
  );
}
