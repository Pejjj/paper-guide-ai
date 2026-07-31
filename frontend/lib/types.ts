export interface DocumentRecord { id: string; title: string; original_filename: string; storage_path: string; page_count: number | null; status: string; created_at: string; signed_url?: string; }
export interface RouteItem { priority: "Must read" | "Skim" | "Optional"; section_title: string; page_start: number | null; page_end: number | null; why_it_matters: string; what_to_extract: string[]; chapter_7_use: string; }
export interface ReadingRoute { document_title: string; overall_goal: string; recommended_reading_order: RouteItem[]; skip_or_lightly_skim: string[]; key_tables_figures: string[]; citation_roles: string[]; }
export interface PodcastScript { episode_title: string; duration_minutes: number; script: string; page_directions: string[]; pause_points: string[]; chapter_7_takeaways: string[]; }
export interface Note { id: string; document_id: string; content: string; page_number: number | null; created_at: string; }

