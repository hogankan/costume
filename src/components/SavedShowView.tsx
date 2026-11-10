"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SavedShow } from "@/lib/shows/types";
import { WorkbookView } from "./WorkbookView";
import type { ChartInfo, RosterResponse } from "./types";

/** A saved show, reopened on the same class-tab screen as a fresh upload. */
export function SavedShowView({ show }: { show: SavedShow }) {
  const router = useRouter();
  const [charts, setCharts] = useState<ChartInfo[]>([]);

  useEffect(() => {
    fetch("/api/charts")
      .then((r) => r.json())
      .then((d) => setCharts(d.charts ?? []))
      .catch(() => setCharts([]));
  }, []);

  const roster: RosterResponse = {
    fileName: show.sourceFileName,
    fileKind: show.sourceFileKind,
    classes: show.classes.map((c) => ({ ...c.original, dancers: c.state.dancers })),
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8">
      <WorkbookView
        roster={roster}
        charts={charts}
        signedIn
        saved={show}
        onStartOver={() => router.push("/")}
      />
    </div>
  );
}
