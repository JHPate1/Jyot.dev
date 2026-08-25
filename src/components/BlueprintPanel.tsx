import { useState } from "react";
import { BookOpen } from "lucide-react";
import { BLUEPRINT } from "@/content/blueprint";
import { Markdown } from "./Markdown";
import { cn } from "@/utils/cn";

export default function BlueprintPanel() {
  const [active, setActive] = useState(BLUEPRINT[0].id);
  const section = BLUEPRINT.find((s) => s.id === active)!;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2 text-[12px] text-slate-300">
        <BookOpen size={13} className="text-nv-400" /> Kode Technical Blueprint
        <span className="ml-auto text-[10px] text-slate-500">Local-First Architecture Spec</span>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-white/6 px-2 py-1.5">
        {BLUEPRINT.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={cn(
              "shrink-0 rounded-md px-2 py-1 text-[11px] transition",
              active === s.id ? "bg-white/10 text-slate-100" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
            )}
          >
            {s.title}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <Markdown src={section.body} />
      </div>
    </div>
  );
}
