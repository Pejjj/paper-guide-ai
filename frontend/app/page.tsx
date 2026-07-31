import Link from "next/link";
import { ArrowRight, BookOpen, Headphones, Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-paper">
      <Navbar />
      <section className="mx-auto grid max-w-7xl gap-16 px-6 pb-24 pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:pt-28">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> Read with a plan, not a highlighter</span>
          <h1 className="mt-7 max-w-4xl text-6xl font-semibold leading-[0.98] tracking-[-0.055em] text-ink sm:text-7xl">
            Turn dense PDFs into a guided conversation.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-ink/65">
            PaperGuide AI maps what matters, explains it like a podcast tutor, and keeps every insight tied to the source page.
          </p>
          <Link className="primary-button mt-10 inline-flex" href="/dashboard">
            Open your reading desk <ArrowRight size={18} />
          </Link>
          <div className="mt-14 grid max-w-2xl grid-cols-3 gap-4 border-t border-ink/10 pt-6 text-sm text-ink/60">
            <span>Private PDFs</span><span>Page-aware answers</span><span>Markdown notes</span>
          </div>
        </div>
        <div className="relative min-h-[480px]">
          <div className="absolute inset-8 rotate-3 rounded-[2.5rem] bg-coral/20" />
          <div className="absolute inset-0 -rotate-2 rounded-[2.5rem] border border-ink/10 bg-white p-8 shadow-soft">
            <div className="flex items-center justify-between border-b border-ink/10 pb-5">
              <div><p className="text-xs uppercase tracking-[0.2em] text-ink/45">Today’s route</p><p className="mt-1 font-semibold">A theory of careful reading</p></div>
              <BookOpen className="text-moss" />
            </div>
            {["Start with the argument", "Inspect Figure 3", "Skim the method", "Capture the limitation"].map((item, index) => (
              <div className="mt-5 flex items-center gap-4" key={item}>
                <span className="grid size-9 place-items-center rounded-full bg-sage text-sm font-semibold text-moss">{index + 1}</span>
                <div className="flex-1"><p className="font-medium">{item}</p><div className="mt-2 h-1.5 rounded bg-ink/5"><div className="h-full rounded bg-moss" style={{ width: `${82 - index * 13}%` }} /></div></div>
              </div>
            ))}
            <div className="mt-8 rounded-2xl bg-ink p-5 text-white">
              <div className="flex items-center gap-2 text-sm text-white/60"><Headphones size={16} /> Tutor episode</div>
              <p className="mt-3 text-xl font-medium">Why the paper’s strongest claim appears after its main result</p>
              <p className="mt-2 text-sm text-white/55">8 min · grounded in pages 4–12</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

