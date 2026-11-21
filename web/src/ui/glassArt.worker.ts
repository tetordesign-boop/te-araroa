// Paints a glass folder's picture off the main thread (see glassArt.ts): the whole picture at once, sent back as pixels.
import { createArtJob, type ArtRecipe } from "./glassArt";

type Ask = { id: number; recipe: ArtRecipe; seed: number; w: number; h: number };
const scope = self as unknown as { onmessage: ((e: MessageEvent<Ask>) => void) | null; postMessage(m: unknown, t: Transferable[]): void };
scope.onmessage = (e) => {
  const { id, recipe, seed, w, h } = e.data;
  const job = createArtJob(w, h, recipe, seed);
  while (!job.step(64)) { /* this is its own thread: all of it at once */ }
  scope.postMessage({ id, width: job.width, height: job.height, pixels: job.pixels }, [job.pixels.buffer]);
};
