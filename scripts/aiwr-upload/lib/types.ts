/** 上傳腳本用的小工具型別。不含任何真實資料。 */

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export type ColumnMap = {
  symbol?: string;
  qty?: string;
  avg_cost?: string;
  last_close?: string;
  date?: string;
  price_date?: string;
  cash?: string;
  equity?: string;
  side?: string;
  price?: string;
  fee?: string;
  note?: string;
  executed_at?: string;
  name?: string;
  cost_date?: string;
  close?: string;
};

export type Io = {
  read(abs: string): string;
  exists(abs: string): boolean;
};

export type Watermark = { version: 1; sent: Record<string, string[]> };

export type DateOnlyRule = "utc_midnight" | "tw_close";
export type ClockZone = "UTC" | "Asia/Taipei";
