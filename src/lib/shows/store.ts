import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { CurrentUser } from "../auth/session";
import { dancerChanges } from "./changes";
import {
  type ClassHistory,
  type OverrideEventInput,
  type SavedClassPayload,
  type SavedShow,
  type ShowSummary,
} from "./types";

/**
 * Saved shows. One studio for now, so every signed-in account sees every show;
 * who made each change is recorded instead.
 */

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function createShow(
  user: CurrentUser,
  input: { name: string; sourceFileName: string; sourceFileKind: string; classes: SavedClassPayload[] },
): Promise<string> {
  const show = await prisma.show.create({
    data: {
      name: input.name.trim() || input.sourceFileName,
      sourceFileName: input.sourceFileName,
      sourceFileKind: input.sourceFileKind,
      createdById: user.id,
      classes: {
        create: input.classes.map((c) => ({
          sheetName: c.sheetName,
          className: c.className,
          position: c.position,
          original: json(c.original),
          state: json(c.state),
          results: c.results ? json(c.results) : undefined,
          overrides: json(c.overrides),
          sizedAt: c.results ? new Date() : null,
          updatedById: user.id,
        })),
      },
    },
  });
  return show.id;
}

/** Save the classes that changed, and record any override changes as history. */
export async function saveClasses(
  user: CurrentUser,
  showId: string,
  classes: SavedClassPayload[],
  events: OverrideEventInput[],
): Promise<boolean> {
  const show = await prisma.show.findUnique({ where: { id: showId }, select: { id: true } });
  if (!show) return false;

  await prisma.$transaction(async (tx) => {
    for (const c of classes) {
      const existing = await tx.savedClass.findUnique({
        where: { showId_sheetName: { showId, sheetName: c.sheetName } },
        select: { results: true },
      });
      const resultsChanged = JSON.stringify(existing?.results ?? null) !== JSON.stringify(c.results);
      await tx.savedClass.upsert({
        where: { showId_sheetName: { showId, sheetName: c.sheetName } },
        create: {
          showId,
          sheetName: c.sheetName,
          className: c.className,
          position: c.position,
          original: json(c.original),
          state: json(c.state),
          results: c.results ? json(c.results) : undefined,
          overrides: json(c.overrides),
          sizedAt: c.results ? new Date() : null,
          updatedById: user.id,
        },
        update: {
          className: c.className,
          state: json(c.state),
          results: c.results ? json(c.results) : undefined,
          overrides: json(c.overrides),
          ...(resultsChanged && c.results ? { sizedAt: new Date() } : {}),
          updatedById: user.id,
        },
      });
    }

    for (const e of events) {
      const cls = await tx.savedClass.findUnique({
        where: { showId_sheetName: { showId, sheetName: e.sheetName } },
        select: { id: true },
      });
      if (!cls) continue;
      await tx.overrideEvent.create({
        data: {
          classId: cls.id,
          rowNumber: e.rowNumber,
          dancerName: e.dancerName,
          styleNumber: e.styleNumber,
          recommendedSize: e.recommendedSize,
          toSize: e.toSize,
          reason: e.reason,
          userId: user.id,
        },
      });
    }

    await tx.show.update({ where: { id: showId }, data: { updatedAt: new Date() } });
  });
  return true;
}

export async function listShows(): Promise<ShowSummary[]> {
  const shows = await prisma.show.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      classes: { select: { sizedAt: true } },
    },
  });
  return shows.map((s) => ({
    id: s.id,
    name: s.name,
    sourceFileName: s.sourceFileName,
    classCount: s.classes.length,
    sizedCount: s.classes.filter((c) => c.sizedAt).length,
    createdBy: s.createdBy.name,
    updatedAt: s.updatedAt.toISOString(),
  }));
}

export async function loadShow(id: string): Promise<SavedShow | null> {
  const show = await prisma.show.findUnique({
    where: { id },
    include: { classes: { orderBy: { position: "asc" } } },
  });
  if (!show) return null;
  return {
    id: show.id,
    name: show.name,
    sourceFileName: show.sourceFileName,
    sourceFileKind: show.sourceFileKind as SavedShow["sourceFileKind"],
    classes: show.classes.map((c) => ({
      sheetName: c.sheetName,
      className: c.className,
      position: c.position,
      original: c.original as unknown as SavedClassPayload["original"],
      state: c.state as unknown as SavedClassPayload["state"],
      results: (c.results ?? null) as unknown as SavedClassPayload["results"],
      overrides: (c.overrides ?? {}) as unknown as SavedClassPayload["overrides"],
    })),
  };
}

export async function deleteShow(id: string): Promise<void> {
  await prisma.show.deleteMany({ where: { id } });
}

export async function classHistory(showId: string, sheetName: string): Promise<ClassHistory | null> {
  const cls = await prisma.savedClass.findUnique({
    where: { showId_sheetName: { showId, sheetName } },
    include: {
      updatedBy: { select: { name: true } },
      overrideEvents: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
    },
  });
  if (!cls) return null;
  const original = (cls.original as unknown as SavedClassPayload["original"]).dancers ?? [];
  const current = (cls.state as unknown as SavedClassPayload["state"]).dancers ?? [];
  return {
    events: cls.overrideEvents.map((e) => ({
      dancerName: e.dancerName,
      styleNumber: e.styleNumber,
      recommendedSize: e.recommendedSize,
      toSize: e.toSize,
      reason: e.reason,
      by: e.user.name,
      at: e.createdAt.toISOString(),
    })),
    dancerChanges: dancerChanges(original, current),
    updatedBy: cls.updatedBy?.name ?? null,
    updatedAt: cls.updatedAt.toISOString(),
  };
}
