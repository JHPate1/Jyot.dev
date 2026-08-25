import { useState } from "react";
import { BookOpen } from "lucide-react";
import { BLUEPRINT } from "@/content/blueprint";
import { Markdown } from "./Markdown";
import { cn } from "@/utils/cn";

export default function BlueprintPanel() {
  const [active, setActive] = useState(BLUEPRINT[0].id);
  const section = BLUEPRINT.find((s) => s.id === active)!;
  return (
    <div className="flex h-full flex-col bg-[#0d0e12]">
      <div className="flex items-center gap-2 border-b border-white/6 bg-[#121418] px-4 py-3 text-[13px] font-medium text-white">
        <BookOpen size={16} className="text-indigo-400" /> Seeker Code — User Guide
        <span className="ml-auto text-[11px] font-normal text-slate-500">Simple explanations for everyone</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto border-b border-white/6 bg-[#121418] px-3 py-2">
        {BLUEPRINT.map((s) => (
          <button key={s.id} onClick={() => setActive(s.id)} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition", active === s.id ? "bg-white text-black" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white")}>
            {s.title}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Markdown src={section.body} />
      </div>
    </div>
  );
}
