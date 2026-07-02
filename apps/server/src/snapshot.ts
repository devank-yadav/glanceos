// #44 — board snapshots: render a board with its owner's LIVE data to a full-color PNG,
// via the same headless pipeline the e-ink/OG images use (a photograph of the real screen
// runtime, never a parallel implementation). Consumed by the download endpoint and the
// `emailSnapshot` automation action.
import type { LayoutT, StreamPayloadT } from "@glanceos/schema";
import { connLookupForOrg } from "./connections";
import { renderColorPng } from "./render/screenshot";
import { resolveWidgetData } from "./widgets";

const baseUrl = (): string => `http://127.0.0.1:${process.env.PORT ?? 8080}`;

export interface SnapshotBoard { document: LayoutT; name: string; version: number }

export async function boardSnapshotPng(board: SnapshotBoard, ownerId: string, orgId: string | undefined, w = 1280, h = 800): Promise<Buffer> {
  // Owner view (publicView stays false): this image goes to the owner's own download or
  // inbox, so private data renders — unlike the share-token preview.
  const data = await resolveWidgetData(board.document, ownerId, orgId ? connLookupForOrg(orgId) : undefined);
  const payload = { claimed: true, state: { layoutVersion: board.version, layout: board.document, data, deviceName: board.name } } as unknown as StreamPayloadT;
  return renderColorPng(baseUrl(), payload, w, h);
}

/** A board name as a safe download filename. */
export const snapshotFilename = (name: string): string =>
  `${(name || "board").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "board"}.png`;
