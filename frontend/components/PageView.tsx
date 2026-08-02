"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";

export function PageView({ path }: { path: string }) { useEffect(() => { void api.track("page_view", path).catch(() => undefined); }, [path]); return null; }
