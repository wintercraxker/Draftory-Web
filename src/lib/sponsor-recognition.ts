import "server-only";
/** Server-controlled recognition only. Never used by staffAccess or authorization. */
export function configuredSponsorIds() {
  return [
    ...new Set(
      (process.env.DRAFTORY_SPONSOR_DF_IDS ?? "")
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter((v) => /^DF-[A-Z0-9]{8}$/.test(v)),
    ),
  ].slice(0, 100);
}
