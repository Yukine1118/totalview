/** 歷史版本的來源標籤。未知的值原樣顯示,不當成貼上。 */
export function importSourceLabel(source: string): string {
  if (source === "restore") return "還原";
  if (source === "ingest") return "自動匯入";
  if (source === "paste") return "貼上";
  return source;
}

export function importSourceClass(source: string): string {
  if (source === "restore" || source === "ingest") return "border-accent text-accent";
  return "border-border text-muted";
}
