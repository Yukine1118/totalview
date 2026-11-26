/** 資料庫還沒有 ingest 用的函式或 source 檢查(migration 0003 還沒跑)。 */
export class IngestNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestNotReadyError";
  }
}

/** PostgREST / Postgres 在函式不存在或 source 檢查擋下時的訊息。 */
export function isIngestNotReadyMessage(message: string): boolean {
  return /aiwr_ingest|aiwr_latest_bot_items|PGRST202|PGRST204|schema cache|does not exist|could not find the function|aiwr_imports_source_check|new row for relation|violates check constraint/i.test(
    message,
  );
}
