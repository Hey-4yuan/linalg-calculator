import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { scopedStorage } from "@lark-apaas/client-toolkit-lite";
import SingleMatrixSection from "./sections/SingleMatrixSection";
import DoubleMatrixSection from "./sections/DoubleMatrixSection";
import LinearSystemSection from "./sections/LinearSystemSection";
import VectorSection from "./sections/VectorSection";
import SymbolicMatrixSection from "./sections/SymbolicMatrixSection";
import { Calculator, Grid3X3, Braces, Layers } from "lucide-react";

type MainTab = "matrix" | "system" | "vector";
type MatrixTab = "single" | "double" | "symbolic";

const STORAGE_KEY = "__app_linalg_fraction_mode";

export default function HomePage() {
  const [mainTab, setMainTab] = useState<MainTab>("matrix");
  const [matrixTab, setMatrixTab] = useState<MatrixTab>("single");
  const [fractionMode, setFractionMode] = useState(false);

  // 读取本地持久化的显示模式
  useEffect(() => {
    try {
      const saved = scopedStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        setFractionMode(saved === "true");
      }
    } catch {
      // 忽略存储读取错误
    }
  }, []);

  const handleFractionModeChange = (checked: boolean) => {
    setFractionMode(checked);
    try {
      scopedStorage.setItem(STORAGE_KEY, String(checked));
    } catch {
      // 忽略存储写入错误
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/10 overflow-x-hidden">
      {/* 顶部标题栏 */}
      <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/30">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <Calculator className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">线性代数计算器</h1>
              <p className="text-xs text-muted-foreground -mt-0.5">
                Linear Algebra Calculator
              </p>
            </div>
          </div>

          {/* 分数/小数切换 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
              <Switch
                id="fraction-mode"
                checked={fractionMode}
                onCheckedChange={handleFractionModeChange}
              />
              <Label
                htmlFor="fraction-mode"
                className="text-xs cursor-pointer select-none"
              >
                {fractionMode ? "分数模式" : "小数模式"}
              </Label>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)}>
          {/* 主 Tab */}
          <TabsList className="mb-6 w-full justify-start bg-transparent p-0 h-auto space-x-1 overflow-x-auto flex-nowrap min-w-0 scrollbar-hide">
            <TabsTrigger
              value="matrix"
              className="data-[state=active]:bg-card data-[state=active]:shadow-xs rounded-lg px-4 py-2.5"
            >
              <Grid3X3 className="size-4 mr-2" />
              矩阵运算
            </TabsTrigger>
            <TabsTrigger
              value="system"
              className="data-[state=active]:bg-card data-[state=active]:shadow-xs rounded-lg px-4 py-2.5"
            >
              <Braces className="size-4 mr-2" />
              线性方程组
            </TabsTrigger>
            <TabsTrigger
              value="vector"
              className="data-[state=active]:bg-card data-[state=active]:shadow-xs rounded-lg px-4 py-2.5"
            >
              <Layers className="size-4 mr-2" />
              向量运算
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matrix" className="mt-0">
            {/* 子 Tab：单/双矩阵 */}
            <Tabs
              value={matrixTab}
              onValueChange={(v) => setMatrixTab(v as MatrixTab)}
            >
              <TabsList className="mb-4 bg-muted/50 p-1 overflow-x-auto flex-nowrap min-w-0 scrollbar-hide">
                <TabsTrigger value="single" className="rounded-md">
                  单矩阵运算
                </TabsTrigger>
                <TabsTrigger value="double" className="rounded-md">
                  双矩阵运算
                </TabsTrigger>
                <TabsTrigger value="symbolic" className="rounded-md">
                  符号运算
                </TabsTrigger>
              </TabsList>

              <TabsContent value="single" className="mt-0">
                <SingleMatrixSection fractionMode={fractionMode} />
              </TabsContent>

              <TabsContent value="double" className="mt-0">
                <DoubleMatrixSection fractionMode={fractionMode} />
              </TabsContent>

              <TabsContent value="symbolic" className="mt-0">
                <SymbolicMatrixSection />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="system" className="mt-0">
            <LinearSystemSection fractionMode={fractionMode} />
          </TabsContent>

          <TabsContent value="vector" className="mt-0">
            <VectorSection fractionMode={fractionMode} />
          </TabsContent>
        </Tabs>
      </main>

      {/* 页脚 */}
      <footer className="border-t border-border/30 mt-12">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 text-center space-y-2">
          <div className="text-xs text-muted-foreground">
            所有计算在浏览器本地完成 · 支持分数精确运算 · 支持步骤展示便于学习核对
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            © {new Date().getFullYear()} 南京信息工程大学 · 网络空间安全学院 · 「源」
          </div>
        </div>
      </footer>
    </div>
  );
}
