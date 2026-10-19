import { Routes, Route } from "react-router-dom";
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
    </>
  );
}
