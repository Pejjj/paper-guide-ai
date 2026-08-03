"use client";

import { useMemo, useState } from "react";
import { BookOpen, ChevronRight, FileQuestion, Loader2, Search, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { ChapterItem, ConceptReadthrough, DefinitionFormulaItem, DefinitionIndex, DefinitionItem, DetectedDocumentItem, DocumentStructure, LearningScope, PodcastScript, SectionIntro, SectionItem } from "@/lib/types";
import { useWorkspace } from "./WorkspaceProvider";
import { EmptyTool } from "./ReadingRoutePanel";
import { UpdateResponseBox } from "./UpdateResponseBox";

type LearningMode = "normal" | "simple_english" | "technical" | "formulas_only" | "method_reproduction" | "exam_study";
type IndexTab = "definitions" | "symbols" | "formulas" | "visuals";

export function DocumentMapPanel({ documentId, onOpenGuidedReading, onOpenAsk }: { documentId: string; onOpenGuidedReading: () => void; onOpenAsk: () => void }) {
  const { workspaces, updateWorkspace } = useWorkspace();
  const workspace = workspaces[documentId];
  const map = workspace?.chapterMap;
  const scope = workspace?.selectedScope;
  const section = workspace?.selectedSection;
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<IndexTab>("definitions");
  const [mode, setMode] = useState<LearningMode>("normal");
  const [items, setItems] = useState<DetectedDocumentItem[]>(section?.detected_items ?? []);

  const scopeKey = scope ? `${scope.scope_type}:${scope.scope_id ?? scope.title}:${scope.page_start ?? "all"}-${scope.page_end ?? "all"}` : "document";
  const definitionIndex = workspace?.definitionIndexes?.[scopeKey] ?? null;
  const currentIntro = section ? workspace?.sectionIntros?.[section.section_id] : null;

  async function generateMap() {
    setLoading("map"); setError("");
    try { updateWorkspace(documentId, { chapterMap: await api.generateChapterMap(documentId) }); }
    catch (reason) { setError(message(reason, "Document map generation failed.")); }
    finally { setLoading(""); }
  }

  function chapterScope(chapter: ChapterItem): SectionItem {
    return { section_id: chapter.chapter_id, section_title: chapter.chapter_title, page_start: chapter.page_start, page_end: chapter.page_end, detected_headings: [], key_terms: [], formulas_detected: [], tables_figures_detected: [], why_this_section_matters: "Use the complete chapter as a learning scope.", source: chapter.source, confidence: chapter.confidence, warning: chapter.warning, printed_page_start: chapter.printed_page_start, printed_page_end: chapter.printed_page_end, detected_items: chapter.detected_items };
  }

  function choose(value: SectionItem, type: "chapter" | "section") {
    const selected: LearningScope = { scope_type: type, scope_id: value.section_id, title: value.section_title, page_start: value.page_start, page_end: value.page_end, printed_page_start: value.printed_page_start, printed_page_end: value.printed_page_end, source: value.source, confidence: value.confidence, warning: value.warning };
    setItems(value.detected_items ?? []);
    updateWorkspace(documentId, { selectedSection: value, selectedScope: selected, selectedDefinition: null, currentPage: value.page_start ?? workspace?.currentPage ?? 1 });
  }

  function moveWithinRange(direction: "start" | "previous" | "next" | "end") {
    if (!scope?.page_start) return;
    const end = scope.page_end ?? scope.page_start;
    const current = workspace?.currentPage ?? scope.page_start;
    const page = direction === "start" ? scope.page_start : direction === "end" ? end : direction === "previous" ? Math.max(scope.page_start, current - 1) : Math.min(end, current + 1);
    updateWorkspace(documentId, { currentPage: page });
  }

  async function intro(focus: "overview" | "theory" | "formulas" = "overview") {
    if (!section?.page_start) return;
    setLoading("intro"); setError("");
    try {
      const result = await api.generateSectionIntro(documentId, { section_id: section.section_id, section_title: section.section_title, page_start: section.page_start, page_end: section.page_end ?? section.page_start, user_level: mode === "simple_english" ? "simple" : mode === "technical" ? "advanced" : "intermediate", focus });
      updateWorkspace(documentId, { sectionIntros: { ...(workspace?.sectionIntros ?? {}), [section.section_id]: result } });
    } catch (reason) { setError(message(reason, "Section explanation failed.")); }
    finally { setLoading(""); }
  }

  async function methodWalkthrough() {
    if (!scope?.page_start) return;
    setLoading("method"); setError("");
    try { updateWorkspace(documentId, { methodWalkthrough: await api.generateMethodWalkthrough(documentId, scope.page_start, scope.page_end ?? scope.page_start, "reproduce") }); }
    catch (reason) { setError(message(reason, "Method walkthrough failed.")); }
    finally { setLoading(""); }
  }

  function startReading(item?: DetectedDocumentItem | DefinitionItem) {
    if (!scope?.page_start && !item) return;
    const definition = "definition_id" in (item ?? {}) ? item as DefinitionItem : null;
    const detected = item && "item_type" in item ? item as DetectedDocumentItem : null;
    updateWorkspace(documentId, { guidedReadingRequest: { scope_type: definition ? "concept" : detected?.item_type === "formula" ? "formula" : scope?.scope_type === "chapter" ? "chapter" : "section", page_start: definition?.page_defined ?? detected?.page_number ?? scope?.page_start, page_end: (definition?.where_used_pages.length ? definition.where_used_pages[definition.where_used_pages.length - 1] : undefined) ?? detected?.page_number ?? scope?.page_end ?? scope?.page_start, section_id: section?.section_id, chapter_id: scope?.scope_type === "chapter" ? scope.scope_id : undefined, focus_text: definition?.term ?? detected?.title_or_text, learning_mode: mode, request_id: crypto.randomUUID() } });
    onOpenGuidedReading();
  }

  async function findItems() {
    if (!scope?.page_start) return;
    setLoading("items"); setError("");
    try { setItems(await api.getDetectedItems(documentId, scope.page_start, scope.page_end ?? scope.page_start)); }
    catch (reason) { setError(message(reason, "Could not inspect this range.")); }
    finally { setLoading(""); }
  }

  async function definitions(modeOverride: "quick" | "detailed" = "quick", wholeDocument = false) {
    setLoading("definitions"); setError("");
    const key = wholeDocument ? "document" : scopeKey;
    try {
      const result = await api.generateDefinitionIndex(documentId, { scope_type: wholeDocument ? "document" : scope?.scope_type ?? "document", scope_title: wholeDocument ? "Whole document" : scope?.title, page_start: wholeDocument ? null : scope?.page_start, page_end: wholeDocument ? null : scope?.page_end, mode: modeOverride });
      updateWorkspace(documentId, { definitionIndexes: { ...(workspace?.definitionIndexes ?? {}), [key]: result } });
    } catch (reason) { setError(message(reason, "Definition generation failed.")); }
    finally { setLoading(""); }
  }

  function selectDefinition(item: DefinitionItem) {
    updateWorkspace(documentId, { selectedDefinition: item, currentPage: item.page_defined ?? workspace?.currentPage ?? 1 });
  }

  async function askAbout(text: string, pageStart?: number | null, pageEnd?: number | null) {
    const now = new Date().toISOString();
    updateWorkspace(documentId, { chatHistory: [...(workspace?.chatHistory ?? []), { role: "user", content: text, createdAt: now }], currentPage: pageStart ?? workspace?.currentPage ?? 1 });
    try {
      const result = await api.ask(documentId, text, { scope_type: pageStart === pageEnd ? "page" : "page_range", page_start: pageStart, page_end: pageEnd });
      updateWorkspace(documentId, { chatHistory: [...(workspace?.chatHistory ?? []), { role: "user", content: text, createdAt: now }, { role: "assistant", content: result.answer, createdAt: new Date().toISOString() }] });
      onOpenAsk();
    } catch (reason) { setError(message(reason, "Could not answer from this scope.")); }
  }

  async function readConcept(item: DefinitionItem, detailed = false) {
    setLoading("concept"); setError("");
    try {
      const result = await api.generateConceptReadthrough(documentId, { definition_id: item.definition_id, term: item.term, page_start: scope?.page_start ?? item.page_defined, page_end: scope?.page_end ?? item.page_defined, learning_mode: mode });
      const podcast: PodcastScript = { episode_title: `Read through: ${item.term}`, duration_minutes: Math.max(3, Math.ceil(result.guided_reading_cues.reduce((sum, cue) => sum + cue.estimated_seconds, 0) / 60)), script: result.guided_reading_cues.map((cue) => cue.narration_text).join("\n\n"), page_directions: result.where_used.map((entry) => entry.label), pause_points: result.checkpoint_questions, chapter_7_takeaways: result.step_by_step_learning_path, cues: result.guided_reading_cues };
      updateWorkspace(documentId, { conceptReadthrough: result, podcast, transcript: podcast.script, cueIndex: 0, selectedDefinition: item });
      if (!detailed) onOpenGuidedReading();
    } catch (reason) { setError(message(reason, "Concept read-through failed.")); }
    finally { setLoading(""); }
  }

  if (!map) return <EmptyTool icon={<BookOpen />} title="Map chapters and sections first" description="Resolve body headings and complete page ranges before choosing a learning scope." action="Generate Document Map" loading={loading === "map"} error={error} onClick={generateMap} />;

  return <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
    <section>
      <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.16em] text-ink/40">{map.detected_document_type}</p><h2 className="mt-1 text-xl font-semibold">Chapters & sections</h2></div><button className="text-sm text-moss" onClick={generateMap}>Regenerate</button></div>
      <button className={`mt-4 w-full rounded-xl border px-3 py-2 text-left text-sm font-medium ${!scope ? "border-moss bg-sage" : "border-ink/10"}`} onClick={() => updateWorkspace(documentId, { selectedScope: null, selectedSection: null, selectedDefinition: null })}>Whole document</button>
      <div className="mt-3 space-y-3">{map.chapters.map((chapter) => <details key={chapter.chapter_id} className="rounded-2xl border border-ink/10 p-4" open={chapter.chapter_id === scope?.scope_id || chapter.sections.some((item) => item.section_id === scope?.scope_id) || undefined}><summary className="cursor-pointer font-semibold">{chapter.chapter_title}<span className="ml-2 text-xs font-normal text-ink/35">{rangeLabel(chapter)}</span></summary><button disabled={!chapter.page_start} className={`mt-3 w-full rounded-xl px-3 py-2 text-left text-sm font-medium ${scope?.scope_id === chapter.chapter_id ? "bg-sage text-moss" : "text-moss hover:bg-ink/5"}`} onClick={() => choose(chapterScope(chapter), "chapter")}>Use whole chapter · {rangeLabel(chapter)}</button><div className="mt-1 space-y-1">{chapter.sections.map((item) => <button key={item.section_id} disabled={!item.page_start} onClick={() => choose(item, "section")} title={item.warning ?? undefined} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${scope?.scope_id === item.section_id ? "bg-sage text-moss" : "hover:bg-ink/5"}`}><ChevronRight size={14} /><span className="min-w-0 flex-1 truncate">{item.section_title}</span>{item.detected_items?.length > 0 && <span className="rounded-full bg-coral/10 px-1.5 text-[10px] text-coral">{item.detected_items.length}</span>}<span className="text-xs opacity-60">{rangeLabel(item)}</span></button>)}</div></details>)}</div>
      <UpdateResponseBox documentId={documentId} responseType="chapter_map" original={map} onUpdated={(value) => updateWorkspace(documentId, { chapterMap: value as DocumentStructure })} />
    </section>

    <section>{!scope?.page_start ? <div className="rounded-2xl border border-dashed border-ink/20 p-10 text-center text-ink/50">Choose a resolved chapter or section. The PDF remains freely navigable before and after the selected range.</div> : <>
      <div className="rounded-2xl bg-paper p-5"><p className="text-xs uppercase tracking-[0.14em] text-ink/40">Selected learning scope · {rangeLabel(scope)}</p><h2 className="mt-2 text-2xl font-semibold">{scope.title}</h2><p className="mt-2 text-sm text-ink/50">Current PDF page: {workspace?.currentPage ?? scope.page_start}</p>{scope.warning && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{scope.warning}</p>}<div className="mt-4 flex flex-wrap gap-2"><Action onClick={() => moveWithinRange("start")}>Start of range</Action><Action onClick={() => moveWithinRange("previous")}>Previous page</Action><Action onClick={() => moveWithinRange("next")}>Next page</Action><Action onClick={() => moveWithinRange("end")}>End of range</Action></div><div className="mt-4"><label className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/40">Learning mode</label><select className="field mt-2" value={mode} onChange={(event) => setMode(event.target.value as LearningMode)}><option value="normal">Normal</option><option value="simple_english">Simple English</option><option value="technical">Technical</option><option value="formulas_only">Formula-focused</option><option value="method_reproduction">Method reproduction</option><option value="exam_study">Exam / study</option></select></div><div className="mt-4 flex flex-wrap gap-2"><Action onClick={() => startReading()}>Start guided reading</Action><Action onClick={() => startReading()}>Read through this section</Action><Action onClick={() => intro("overview")}>Explain overview</Action><Action onClick={() => intro("theory")}>Explain theory</Action><Action onClick={() => intro("formulas")}>Explain formulas</Action><Action onClick={methodWalkthrough}>Walk through method</Action><Action onClick={() => { onOpenAsk(); }}>Ask about this scope</Action><Action onClick={() => definitions("quick")}>Generate definitions/concepts</Action><Action onClick={findItems}>Find tables/figures/formulas</Action></div></div>

      {loading && <ProgressState operation={loading} />}{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {currentIntro && <IntroCard documentId={documentId} intro={currentIntro} scope={scope} onUpdate={(value) => updateWorkspace(documentId, { sectionIntros: { ...(workspace?.sectionIntros ?? {}), [section!.section_id]: value } })} />}
      <DefinitionWorkspace index={definitionIndex} selected={workspace?.selectedDefinition ?? null} items={items} tab={tab} filter={filter} onTab={setTab} onFilter={setFilter} onGenerateScope={() => definitions("quick")} onGenerateWhole={() => definitions("quick", true)} onRegenerate={() => definitions("detailed")} onSelect={selectDefinition} onJump={(page) => updateWorkspace(documentId, { currentPage: page })} onExplain={(item) => askAbout(`Explain ${item.term} using the definition and nearby document context.`, item.page_defined, item.page_defined)} onRead={readConcept} onAsk={(item) => askAbout(`What should I understand about ${item.term}, and where is it used in this document?`, scope.page_start, scope.page_end)} onGuideItem={startReading} onExplainFormula={(formula, instruction) => askAbout(`${instruction}: ${formula.formula_text}. Use only the formula page and state when a variable or derivation is missing.`, formula.page_number, formula.page_number)} onGuideFormula={(formula) => startReading({ item_id: formula.formula_id, item_type: "formula", label: formula.label, title_or_text: formula.formula_text, page_number: formula.page_number ?? scope.page_start!, printed_page_label: formula.printed_page_label, confidence: formula.confidence, supporting_text_snippet: formula.formula_text })} />
      {workspace?.conceptReadthrough && <ReadMorePanel result={workspace.conceptReadthrough} onJump={(page) => updateWorkspace(documentId, { currentPage: page })} onRegenerate={() => workspace.selectedDefinition && readConcept(workspace.selectedDefinition, true)} />}
    </>}</section>
  </div>;
}

function DefinitionWorkspace({ index, selected, items, tab, filter, onTab, onFilter, onGenerateScope, onGenerateWhole, onRegenerate, onSelect, onJump, onExplain, onRead, onAsk, onGuideItem, onExplainFormula, onGuideFormula }: { index: DefinitionIndex | null; selected: DefinitionItem | null; items: DetectedDocumentItem[]; tab: IndexTab; filter: string; onTab: (value: IndexTab) => void; onFilter: (value: string) => void; onGenerateScope: () => void; onGenerateWhole: () => void; onRegenerate: () => void; onSelect: (item: DefinitionItem) => void; onJump: (page: number) => void; onExplain: (item: DefinitionItem) => void; onRead: (item: DefinitionItem) => void; onAsk: (item: DefinitionItem) => void; onGuideItem: (item: DetectedDocumentItem) => void; onExplainFormula: (item: DefinitionFormulaItem, instruction: string) => void; onGuideFormula: (item: DefinitionFormulaItem) => void }) {
  const definitions = useMemo(() => (index?.definitions ?? []).filter((item) => `${item.term} ${item.short_definition}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())), [filter, index]);
  return <section className="mt-6 rounded-2xl border border-ink/10 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs uppercase tracking-[0.14em] text-ink/40">Learning index</p><h3 className="mt-1 text-lg font-semibold">Definitions & concepts</h3></div><div className="flex gap-2"><button className="text-xs text-moss" onClick={onGenerateScope}>Generate for scope</button><button className="text-xs text-moss" onClick={onGenerateWhole}>Whole document</button></div></div><div className="mt-4 flex flex-wrap gap-1">{(["definitions", "symbols", "formulas", "visuals"] as IndexTab[]).map((value) => <button key={value} className={`rounded-lg px-3 py-1.5 text-xs capitalize ${tab === value ? "bg-ink text-white" : "bg-paper text-ink/55"}`} onClick={() => onTab(value)}>{value}</button>)}</div><div className="relative mt-3"><Search className="absolute left-3 top-3.5 text-ink/30" size={15} /><input className="field pl-9" value={filter} onChange={(event) => onFilter(event.target.value)} placeholder="Filter terms and concepts" /></div>
    {!index && <div className="mt-5 rounded-xl bg-paper p-5 text-center text-sm text-ink/50"><Sparkles className="mx-auto mb-2 text-moss" />Generate definitions for this scope or the whole document.</div>}
    {index && tab === "definitions" && <div className="mt-4 space-y-2">{definitions.length ? definitions.map((item) => <button key={item.definition_id} onClick={() => onSelect(item)} className={`w-full rounded-xl border p-3 text-left ${selected?.definition_id === item.definition_id ? "border-moss bg-sage/60" : "border-ink/10"}`}><span className="font-semibold">{item.term}</span><span className="ml-2 text-xs text-ink/40">PDF p. {item.page_defined ?? "unresolved"}{item.printed_page_label ? ` · printed ${item.printed_page_label}` : ""}</span><p className="mt-1 text-sm leading-6 text-ink/60">{item.short_definition}</p><span className="mt-2 inline-block text-[10px] uppercase tracking-wide text-ink/35">{item.source_type.replaceAll("_", " ")} · {item.confidence}</span></button>) : <p className="py-5 text-center text-sm text-ink/45">No definitions detected in this range.</p>}</div>}
    {index && tab === "symbols" && <div className="mt-4 space-y-2">{index.symbols.length ? index.symbols.map((item) => <button key={`${item.symbol}-${item.page_defined}`} className="w-full rounded-xl border border-ink/10 p-3 text-left" onClick={() => item.page_defined && onJump(item.page_defined)}><strong>{item.symbol}</strong><span className="ml-2 text-sm text-ink/60">{item.meaning}</span><p className="mt-1 text-xs text-ink/40">PDF p. {item.page_defined ?? "unresolved"}</p></button>) : <p className="py-5 text-center text-sm text-ink/45">No symbol definitions detected in this range.</p>}</div>}
    {index && tab === "formulas" && <div className="mt-4 space-y-3">{index.formulas.length ? index.formulas.map((formula) => <article key={formula.formula_id} className="rounded-xl border border-ink/10 p-3"><p className="font-medium">{formula.label}: {formula.formula_text}</p><p className="mt-1 text-xs text-ink/40">PDF p. {formula.page_number ?? "unresolved"} · {formula.confidence}</p>{formula.variables_explained.length > 0 && <p className="mt-2 text-xs text-ink/55">Variables found: {formula.variables_explained.join(", ")}</p>}{formula.variables_missing.length > 0 && <p className="mt-2 text-xs text-amber-800">Variable meaning not found in extracted text: {formula.variables_missing.join(", ")}</p>}<div className="mt-2 flex flex-wrap gap-3 text-xs text-moss"><button onClick={() => formula.page_number && onJump(formula.page_number)}>Jump to formula</button><button onClick={() => onExplainFormula(formula, "Explain this formula")}>Explain formula</button><button onClick={() => onExplainFormula(formula, "Walk through the derivation only if the document provides it")}>Walk through derivation</button><button onClick={() => onExplainFormula(formula, "Explain each documented variable")}>Explain variables</button><button onClick={() => onGuideFormula(formula)}>Read through formula</button></div></article>) : <p className="py-5 text-center text-sm text-ink/45">No formulas detected in this range.</p>}</div>}
    {tab === "visuals" && <div className="mt-4 space-y-3">{items.filter((item) => item.item_type !== "formula").length ? items.filter((item) => item.item_type !== "formula").map((item) => <article key={item.item_id} className="rounded-xl border border-ink/10 p-3"><p className="font-medium">{item.label}: {item.title_or_text}</p><p className="mt-1 text-xs text-ink/40">PDF p. {item.page_number}</p><div className="mt-2 flex gap-3 text-xs text-moss"><button onClick={() => onJump(item.page_number)}>Jump to page</button><button onClick={() => onGuideItem(item)}>Read through this {item.item_type}</button></div></article>) : <p className="py-5 text-center text-sm text-ink/45">No tables or figures detected in this range.</p>}</div>}
    {selected && <article className="mt-5 rounded-2xl bg-ink p-5 text-white"><p className="text-xs uppercase tracking-[0.14em] text-white/45">Selected concept</p><h3 className="mt-2 text-xl font-semibold">{selected.term}</h3><p className="mt-2 text-sm leading-6 text-white/70">{selected.technical_definition}</p><div className="mt-4 flex flex-wrap gap-2"><SmallButton onClick={() => onExplain(selected)}>Explain this</SmallButton><SmallButton onClick={() => onRead(selected)}>Read through this concept</SmallButton><SmallButton onClick={() => onAsk(selected)}>Ask about this</SmallButton>{selected.page_defined && <SmallButton onClick={() => onJump(selected.page_defined!)}>Jump to definition</SmallButton>}</div></article>}
    {index && <div className="mt-4 flex flex-wrap gap-3 text-xs text-moss"><button onClick={onRegenerate}>Regenerate deeper explanations</button><span className="text-ink/35">External search not performed.</span></div>}
  </section>;
}

function IntroCard({ documentId, intro, scope, onUpdate }: { documentId: string; intro: SectionIntro; scope: LearningScope; onUpdate: (value: SectionIntro) => void }) { return <section className="mt-6 rounded-2xl border border-ink/10 p-5"><h3 className="font-semibold">Section explanation</h3><p className="mt-2 leading-7 text-ink/70">{intro.plain_language_intro}</p><h4 className="mt-4 text-sm font-semibold">Read more inside this document</h4>{intro.where_else_to_look_in_document.length ? <ul className="mt-2 list-disc pl-5 text-sm text-ink/60">{intro.where_else_to_look_in_document.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-ink/45">No additional internal location was supported.</p>}<UpdateResponseBox documentId={documentId} responseType="section_intro" original={intro} currentContext={{ scope_type: scope.scope_type, page_start: scope.page_start, page_end: scope.page_end }} onUpdated={(value) => onUpdate(value as SectionIntro)} /></section>; }

function ReadMorePanel({ result, onJump, onRegenerate }: { result: ConceptReadthrough; onJump: (page: number) => void; onRegenerate: () => void }) { const entries = [...result.read_more_inside_document, ...result.suggested_references_from_document]; return <section className="mt-6 rounded-2xl border border-ink/10 p-5"><h3 className="font-semibold">Read more</h3>{entries.length ? <div className="mt-3 space-y-2">{entries.map((entry, index) => <button key={`${entry.label}-${index}`} className="w-full rounded-xl bg-paper p-3 text-left" onClick={() => entry.page_number && onJump(entry.page_number)}><span className="text-[10px] font-semibold uppercase tracking-wide text-moss">{entry.guidance_type === "inside_document" ? "Inside this document" : "References cited by this document"}</span><p className="mt-1 text-sm font-medium">{entry.label}</p><p className="mt-1 text-xs text-ink/50">{entry.why_relevant}</p></button>)}</div> : <p className="mt-3 text-sm text-ink/45">No supported reference suggestions were found.</p>}<div className="mt-4 flex gap-3 text-xs"><button className="text-moss" onClick={onRegenerate}>Find more references from this document</button><span className="text-ink/35">External web search not performed.</span></div></section>; }

function ProgressState({ operation }: { operation: string }) { const label: Record<string, string> = { intro: "Preparing selected pages", method: "Building method walkthrough", items: "Finding formulas, tables, and figures", definitions: "Detecting and organizing definitions", concept: "Building concept learning path" }; return <p className="mt-4 flex items-center gap-2 rounded-xl bg-sage/50 p-3 text-sm text-moss"><Loader2 size={16} className="animate-spin" />{label[operation] ?? "Preparing selected pages"}…</p>; }
function Action({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <button className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm font-medium text-moss hover:border-moss/30" onClick={onClick}>{children}</button>; }
function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <button className="rounded-lg border border-white/20 px-3 py-2 text-xs hover:bg-white/10" onClick={onClick}>{children}</button>; }
function rangeLabel(value: { page_start: number | null; page_end: number | null; printed_page_start?: string | null; printed_page_end?: string | null }) { if (!value.page_start) return "page unresolved"; const physical = value.page_end && value.page_end !== value.page_start ? `PDF p. ${value.page_start}–${value.page_end}` : `PDF p. ${value.page_start}`; if (!value.printed_page_start) return physical; const printed = value.printed_page_end && value.printed_page_end !== value.printed_page_start ? `${value.printed_page_start}–${value.printed_page_end}` : value.printed_page_start; return `${physical} · printed ${printed}`; }
function message(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }
