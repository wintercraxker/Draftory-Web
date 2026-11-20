import catalog from "./item-catalog.json" with { type: "json" };
const items = new Map(catalog.map((item) => [item.id, item]));
export function itemVisual(id: number | null | undefined) {
  return id ? (items.get(id) ?? null) : null;
}
