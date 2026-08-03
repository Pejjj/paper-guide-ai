"use client";

import { useState } from "react";
import { BookOpen, ChevronRight, FlaskConical, Loader2, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { ChapterItem, DetectedDocumentItem, DocumentStructure, SectionIntro, SectionItem } from "@/lib/types";
import { useWorkspace } from "./WorkspaceProvider";
import { EmptyTool } from "./ReadingRoutePanel";
import { UpdateResponseBox } from "./UpdateResponseBox";

export function DocumentMapPanel({ documentId, onOpenGuidedReading }: { documentId: string; onOpenGuidedReading: () => void }) {
  const { workspaces, updateWorkspace } = useWorkspace();
  const workspace = workspaces[documentId];
  const map = workspace?.chapterMap;
  const section = workspace?.selectedSection;
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [concept, setConcept] = useState("");
  const [items, setItems] = useState<DetectedDocumentItem[]>([]);
  const [itemMessage, setItemMessage] = useState("");

  async function generateMap() {
    setLoading("map"); setError("");
    try { updateWorkspace(documentId, { chapterMap: await api.generateChapterMap(documentId) }); }
    catch (e) { setError(e instanceof Error ? e.message : "Map generation failed."); }
    finally { setLoading(""); }
  }

  function asSection(chapter: ChapterItem): SectionItem {
    return { section_id: chapter.chapter_id, section_title: chapter.chapter_title, page_start: chapter.page_start, page_end: chapter.page_end, detected_headings: [], key_terms: [], formulas_detected: [], tables_figures_detected: [], why_this_section_matters: "Explore this complete chapter.", source: chapter.source, confidence: chapter.confidence, warning: chapter.warning, printed_page_start: chapter.printed_page_start, printed_page_end: chapter.printed_page_end, detected_items: chapter.detected_items };
  }

  function selectSection(value: SectionItem) {
    setItems(value.detected_items ?? []);
    setItemMessage("");
    updateWorkspace(documentId, { selectedSection: value, currentPage: value.page_start ?? workspace?.currentPage ?? 1 });
  }

  async function findItems() {
    if (!section?.page_start) return;
    setLoading("items"); setError("");
    try { setItems(await api.getDetectedItems(documentId, section.page_start, section.page_end ?? section.page_start)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load detected items."); }
    finally { setLoading(""); }
  }

  async function intro(focus = "overview", level = "intermediate") {
    if (!section?.page_start) return;
    setLoading("intro"); setError("");
    try {
      const result = await api.generateSectionIntro(documentId, { section_id: section.section_id, section_title: section.section_title, page_start: section.page_start, page_end: section.page_end ?? section.page_start, user_level: level, focus });
      updateWorkspace(documentId, { sectionIntros: { ...(workspace?.sectionIntros ?? {}), [section.section_id]: result } });
    } catch (e) { setError(e instanceof Error ? e.message : "Section introduction failed."); }
    finally { setLoading(""); }
  }

  async function method() {
    if (!section?.page_start) return;
    setLoading("method"); setError("");
    try { updateWorkspace(documentId, { methodWalkthrough: await api.generateMethodWalkthrough(documentId, section.page_start, section.page_end ?? section.page_start) }); }
    catch (e) { setError(e instanceof Error ? e.message : "Method walkthrough failed."); }
    finally { setLoading(""); }
  }

  async function explainItem(item: DetectedDocumentItem) {
    setItemMessage("Reading the supporting page…");
    updateWorkspace(documentId, { currentPage: item.page_number });
    try {
      const question = `Explain this detected ${item.item_type} using only its document context: ${item.title_or_text}`;
      const result = await api.ask(documentId, question, { scope_type: "page", page_start: item.page_number, page_end: item.page_number });
      const now = new Date().toISOString();
      updateWorkspace(documentId, { chatHistory: [...(workspace?.chatHistory ?? []), { role: "user", content: question, createdAt: now }, { role: "assistant", content: result.answer, createdAt: now }] });
      setItemMessage("Explanation saved in the Ask tab.");
    } catch (e) { setItemMessage(e instanceof Error ? e.message : "Could not explain this item."); }
  }

  function guided(item?: DetectedDocumentItem) {
    if (!section?.page_start && !item) return;
    updateWorkspace(documentId, { guidedReadingRequest: { scope_type: item?.item_type === "formula" ? "formula" : "section", page_start: item?.page_number ?? section?.page_start, page_end: item?.page_number ?? section?.page_end ?? section?.page_start, section_id: section?.section_id, focus_text: item?.title_or_text, request_id: crypto.randomUUID() } });
    onOpenGuidedReading();
  }

  async function findConcept() {
    if (!concept.trim()) return;
    setLoading("concept"); setError("");
    try { updateWorkspace(documentId, { conceptGuide: await api.generateConceptGuide(documentId, concept, section?.page_start, section?.page_end) }); }
    catch (e) { setError(e instanceof Error ? e.message : "Concept guide failed."); }
    finally { setLoading(""); }
  }

  if (!map) return <EmptyTool icon={<BookOpen />} title="Map chapters and sections first" description="Resolve real body headings and page ranges before choosing what to learn." action="Generate Document Map" loading={loading === "map"} error={error} onClick={generateMap} />;
  const currentIntro = section ? workspace?.sectionIntros[section.section_id] : null;

  return <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
    <div>
      <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.16em] text-ink/40">{map.detected_document_type}</p><h2 className="mt-1 text-xl font-semibold">Chapters & sections</h2></div><button className="text-sm text-moss" onClick={generateMap}>Regenerate</button></div>
      <button className="mt-4 w-full rounded-xl border border-ink/10 px-3 py-2 text-left text-sm font-medium" onClick={() => updateWorkspace(documentId, { selectedSection: null, currentPage: 1 })}>Whole document</button>
      <div className="mt-3 space-y-3">{map.chapters.map((chapter) => <details key={chapter.chapter_id} className="rounded-2xl border border-ink/10 p-4" open>
        <summary className="cursor-pointer font-semibold">{chapter.chapter_title}<span className="ml-2 text-xs font-normal text-ink/35">{rangeLabel(chapter)}</span></summary>
        <button className="mt-3 w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-moss hover:bg-ink/5" disabled={!chapter.page_start} onClick={() => selectSection(asSection(chapter))}>Use whole chapter · {rangeLabel(chapter)}</button>
        <div className="mt-1 space-y-1">{chapter.sections.map((item) => <button key={item.section_id} disabled={!item.page_start} onClick={() => selectSection(item)} title={item.warning ?? undefined} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${section?.section_id === item.section_id ? "bg-sage text-moss" : "hover:bg-ink/5"}`}><ChevronRight size={14} /><span className="min-w-0 flex-1 truncate">{item.section_title}</span><span className="text-xs opacity-60">{rangeLabel(item)}</span></button>)}</div>
      </details>)}</div>
      <UpdateResponseBox documentId={documentId} responseType="chapter_map" original={map} onUpdated={(value) => updateWorkspace(documentId, { chapterMap: value as DocumentStructure })} />
    </div>
    <div>{!section ? <div className="rounded-2xl border border-dashed border-ink/20 p-10 text-center text-ink/50">Choose a resolved chapter or section to use its complete page range.</div> : <>
      <section className="rounded-2xl bg-paper p-5"><p className="text-xs uppercase tracking-[0.14em] text-ink/40">Selected section · {rangeLabel(section)}</p><h2 className="mt-2 text-2xl font-semibold">{section.section_title}</h2><p className="mt-2 text-sm leading-6 text-ink/60">{section.why_this_section_matters}</p>{section.warning && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{section.warning}</p>}<div className="mt-4 flex flex-wrap gap-2"><Action onClick={() => intro("overview")}>Intro to section</Action><Action onClick={() => intro("theory")}>Explain theory</Action><Action onClick={() => intro("formulas")}>Explain formulas</Action><Action onClick={method}>Walk through method</Action><Action onClick={() => guided()}>Read through this section</Action><Action onClick={findItems}>Find formulas/tables/figures</Action></div></section>
      {loading && <p className="mt-4 flex items-center gap-2 text-sm text-moss"><Loader2 size={16} className="animate-spin" />Building from the selected page range…</p>}{error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      {(items.length > 0 || loading === "items") && <DetectedItems items={items} onJump={(item) => updateWorkspace(documentId, { currentPage: item.page_number })} onExplain={explainItem} onGuide={guided} />}
      {!items.some((item) => item.item_type === "formula") && loading !== "items" && <p className="mt-4 text-sm text-ink/45">No formulas were detected in this selected range.</p>}
      {itemMessage && <p className="mt-3 text-sm text-moss">{itemMessage}</p>}
      {currentIntro && <IntroView documentId={documentId} intro={currentIntro} section={section} onUpdate={(value) => updateWorkspace(documentId, { sectionIntros: { ...workspace.sectionIntros, [section.section_id]: value } })} />}
      {workspace?.methodWalkthrough && <section className="mt-6 rounded-2xl border border-ink/10 p-5"><h3 className="flex items-center gap-2 font-semibold"><FlaskConical size={18} />{workspace.methodWalkthrough.method_name}</h3><ol className="mt-3 space-y-2">{workspace.methodWalkthrough.step_by_step_procedure.map((step) => <li key={step.step_id}><button className="text-left text-sm leading-6 text-moss" onClick={() => step.page_number && updateWorkspace(documentId, { currentPage: step.page_number })}>{step.instruction} {step.page_number ? `(p. ${step.page_number})` : ""}</button></li>)}</ol></section>}
      <section className="mt-6 rounded-2xl border border-ink/10 p-5"><h3 className="flex items-center gap-2 font-semibold"><Search size={17} />Find a concept in this document</h3><div className="mt-3 flex gap-2"><input className="field" value={concept} onChange={(event) => setConcept(event.target.value)} placeholder="A theory, formula, or key term" /><button className="primary-button inline-flex" onClick={findConcept}>Find</button></div>{workspace?.conceptGuide && <div className="mt-4"><p className="text-sm leading-6 text-ink/65">{workspace.conceptGuide.simple_explanation}</p>{workspace.conceptGuide.where_defined.map((where) => <p key={where} className="mt-2 text-sm text-moss">Defined: {where}</p>)}</div>}</section>
    </>}</div>
  </div>;
}

function rangeLabel(value: { page_start: number | null; page_end: number | null; printed_page_start?: string | null; printed_page_end?: string | null }) {
  if (!value.page_start) return "page unresolved";
  const physical = value.page_end && value.page_end !== value.page_start ? `PDF p. ${value.page_start}–${value.page_end}` : `PDF p. ${value.page_start}`;
  if (!value.printed_page_start) return physical;
  const printed = value.printed_page_end && value.printed_page_end !== value.printed_page_start ? `${value.printed_page_start}–${value.printed_page_end}` : value.printed_page_start;
  return `${physical} · printed ${printed}`;
}

function Action({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <button className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm font-medium text-moss hover:border-moss/30" onClick={onClick}>{children}</button>; }

function DetectedItems({ items, onJump, onExplain, onGuide }: { items: DetectedDocumentItem[]; onJump: (item: DetectedDocumentItem) => void; onExplain: (item: DetectedDocumentItem) => void; onGuide: (item: DetectedDocumentItem) => void }) {
  return <section className="mt-5 grid gap-3">{(["formula", "table", "figure"] as const).map((type) => { const found = items.filter((item) => item.item_type === type); return <div key={type} className="rounded-2xl border border-ink/10 p-4"><h3 className="font-semibold capitalize">{type}s found</h3>{found.length ? <div className="mt-2 space-y-3">{found.map((item) => <article key={item.item_id} className="rounded-xl bg-paper p-3"><p className="text-sm font-medium">{item.label}: {item.title_or_text}</p><p className="mt-1 text-xs text-ink/45">PDF p. {item.page_number}{item.printed_page_label ? ` · printed ${item.printed_page_label}` : ""}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-moss"><button onClick={() => onJump(item)}>Jump to page</button><button onClick={() => onExplain(item)}>Explain this</button><button onClick={() => onGuide(item)}>Use in guided reading</button></div></article>)}</div> : <p className="mt-2 text-sm text-ink/45">No {type}s were detected in this selected range.</p>}</div>; })}</section>;
}

function IntroView({ documentId, intro, section, onUpdate }: { documentId: string; intro: SectionIntro; section: SectionItem; onUpdate: (value: SectionIntro) => void }) {
  return <section className="mt-6 space-y-4"><div><p className="text-xs uppercase tracking-[0.14em] text-ink/40">Plain-language introduction</p><p className="mt-2 leading-7 text-ink/75">{intro.plain_language_intro}</p></div><div><h3 className="font-semibold">Technical summary</h3><p className="mt-2 text-sm leading-6 text-ink/65">{intro.technical_summary}</p></div><List title="Learning plan" values={intro.step_by_step_learning_plan} /><List title="Formulas to understand" values={intro.formulas_to_understand} /><UpdateResponseBox documentId={documentId} responseType="section_intro" original={intro} currentContext={{ scope_type: "section", page_start: section.page_start, page_end: section.page_end }} onUpdated={(value) => onUpdate(value as SectionIntro)} /></section>;
}

function List({ title, values }: { title: string; values: string[] }) { if (!values.length) return null; return <div><h4 className="text-sm font-semibold">{title}</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink/60">{values.map((value) => <li key={value}>{value}</li>)}</ul></div>; }
