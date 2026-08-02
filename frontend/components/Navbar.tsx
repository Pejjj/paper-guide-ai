import Link from "next/link";
import { BookMarked } from "lucide-react";

export function Navbar({ compact = false }: { compact?: boolean }) {
  return (
    <nav className={`z-20 flex items-center justify-between border-b border-ink/10 bg-paper/90 px-6 backdrop-blur lg:px-10 ${compact ? "h-16 shrink-0" : "h-20"}`}>
      <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight text-ink">
        <span className="grid size-9 place-items-center rounded-xl bg-ink text-white"><BookMarked size={19} /></span>
        PaperGuide AI
      </Link>
      <div className="flex items-center gap-5"><Link href="/privacy" className="hidden text-sm font-medium text-ink/55 hover:text-ink sm:block">Privacy & safety</Link><Link href="/dashboard" className="text-sm font-medium text-ink/65 hover:text-ink">Reading desk</Link></div>
    </nav>
  );
}
