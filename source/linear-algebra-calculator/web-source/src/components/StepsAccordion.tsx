import { useState } from "react";
import { RowStep } from "@/lib/matrix-ops";
import MatrixDisplay from "./MatrixDisplay";
import { ChevronDown, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StepsAccordionProps {
  steps: RowStep[];
  fractionMode?: boolean;
  title?: string;
  defaultOpen?: boolean;
  augmentedCol?: boolean;
}

export default function StepsAccordion({
  steps,
  fractionMode = false,
  title = "计算步骤",
  defaultOpen = false,
  augmentedCol = false,
}: StepsAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  // 展开状态由父级统一持有。
  // 旧实现把 initial state 塞进 StepItem 的 useState(defaultExpanded)，
  // 父组件翻「全部展开」时 prop 变了但 state 不会跟着变 —— 这就是点了没反应的原因。
  const [openSteps, setOpenSteps] = useState<Set<number>>(() => new Set());

  if (steps.length === 0) return null;

  const allExpanded = steps.length > 0 && openSteps.size === steps.length;

  const toggleStep = (index: number) => {
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    setOpenSteps(allExpanded ? new Set() : new Set(steps.map((_, i) => i)));
  };

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <List className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {title}
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              共 {steps.length} 步
            </span>
          </span>
        </div>
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {allExpanded ? "全部折叠" : "全部展开"}
            </Button>
          </div>

          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {steps.map((step, idx) => (
              <StepItem
                key={idx}
                index={idx}
                step={step}
                fractionMode={fractionMode}
                expanded={openSteps.has(idx)}
                onToggle={() => toggleStep(idx)}
                augmentedCol={augmentedCol}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepItem({
  index,
  step,
  fractionMode,
  expanded,
  onToggle,
  augmentedCol,
}: {
  index: number;
  step: RowStep;
  fractionMode: boolean;
  expanded: boolean;
  onToggle: () => void;
  augmentedCol: boolean;
}) {
  return (
    <div className="border border-border/40 rounded-md overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors text-left"
      >
        <span className="text-xs bg-primary/10 text-primary font-mono px-2 py-0.5 rounded shrink-0">
          第 {index + 1} 步
        </span>
        <span className="text-sm font-mono flex-1 truncate">
          {step.description}
        </span>
        {expanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-muted/20 overflow-x-auto">
          <MatrixDisplay
            matrix={step.matrix}
            fractionMode={fractionMode}
            size="sm"
            augmentedCol={augmentedCol}
          />
        </div>
      )}
    </div>
  );
}
