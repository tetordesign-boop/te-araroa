// What a sponsor offers to pay, shared by the site and the Carnet (kept apart so the Carnet doesn't load the trail's data).

/** A price of nothing ("0", "0 €", "NZ$0", "gratuit", "free"…): then no payment is ever asked for. */
export function isFreeOffer(offer: string | null | undefined): boolean {
  const v = (offer ?? "").trim().toLowerCase();
  if (!v) return false;
  if (/^(gratuit|gratos|offert|cadeau|rien|free|nothing)\b/.test(v)) return true;
  return /^0+([.,]0+)?$/.test(v.replace(/nz\$|\$|€|nzd|eur(o|os)?\b|dollars?|\s/g, ""));
}
