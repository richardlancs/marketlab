import { getSeasonBoard, loadSeasonBoard } from "@/lib/season-data";
import { isSeasonId } from "@/lib/seasons";

/**
 * One player's row in a season's board, from the page's `[id]/[name]`
 * address; null if there's no such player. `fresh` reads the board now
 * rather than the few-minutes-old cached copy (see loadSeasonBoard).
 */
export async function findEntry(id: string, rawName: string, { fresh = false } = {}) {
  if (!isSeasonId(id)) return null;
  let name: string;
  try {
    name = decodeURIComponent(rawName).toLocaleLowerCase("en-US");
  } catch {
    return null;
  }
  const board = await (fresh ? loadSeasonBoard(id) : getSeasonBoard(id));
  const row = board.rows.find((r) => r.nameKey === name);
  return row ? { board, row } : null;
}
