# aiwr-upload

把本機 bot 檔案編成 `aiwr/v1`,POST 到 AI 作戰室的 `/api/ingest`。

怎麼設定 token、怎麼在 Supabase 建欄位,見 [docs/ingest.md](../../docs/ingest.md)。
這裡只說明**檔案要長什麼樣**。範例數字都在 `fixtures/demo/`,標了 DEMO,不是真的部位。

```bash
npm run upload:aiwr -- --config ./aiwr.upload.json --dry-run
npm run upload:aiwr -- --config ./aiwr.upload.json
```

Token 用環境變數 `AIWR_INGEST_TOKEN`。設定檔裡如果出現 token、secret、password、api_key 這類欄名,程式會拒絕執行。

## 共通規則

- 檔案裡沒有的數字就送 `null`,或整段不送。不會用「現在時間」,也不會用起始資金填現金或總資產。
- 持股的 `as_of` 是成本/持股狀態的時間。`price_as_of` 是價格自己的時間。兩個不會互相抄。
- 只有日期、沒有時分的時候:
  - 加密貨幣 → 當天 `00:00 UTC`(日線收盤)
  - 台股 → 當天 `13:30+08:00`(現股收盤)
  - 已經寫好時區的時間(例如 `2026-11-25T08:00:00+08:00`)原樣保留。
- 有時分但沒時區:加密貨幣當成 UTC,台股當成 `+08:00`。鐘點仍是檔案裡的數字。
- 幣別來自設定(`USDT` / `TWD`)。檔案裡若有 `currency` 欄且不一樣,就停止,不換算。
- 欄位可以改名。在來源上加 `columns`,例如 `{ "symbol": "代號", "qty": "股數", "date": "成本日", "price_date": "價格日" }`。沒寫的欄名仍會試下面的別名。
- 數量、成本、價格若帶單位(像 `3000股`)會失敗,不會把字去掉硬送。
- 模擬策略的 bot 名稱是 `父bot/策略名`(例如 `模擬交易室/mean_reversion`)。父 bot 只含 `bot_status`、`strategies`、`summary`。
- 報酬率 = 最新權益 / `start_capital` − 1,四捨五入到小數 4 位。沒有權益就是 `null`。
- 最大回撤由權益序列計算;沒有序列就是 `null`。樣本外報酬一律 `null`(檔案沒有這欄)。
- 交易次數是交易檔的列數(含水位已送過的)。沒有交易檔就是 `null`,不是 0。
- 曲線最多 400 點,資產快照最多送最近 500 筆(格式上限)。超過會在螢幕上警告。
- 交易有水位檔。成功送出後才記住;失敗或 `--dry-run` 都不更新。同一筆交易不會再送。
- 路徑若用 `../` 跑出該來源的 `root`,會失敗。

## crypto_paper

每個策略一個帳本 JSON、可選的 `trades.csv`、`equity_daily.csv`、`ohlc_dir`。

帳本(多的鍵會忽略,不會送出):

```json
{
  "as_of": "2026-11-25T01:00:00Z",
  "cash": 8000,
  "equity": 10500,
  "positions": [
    { "symbol": "BTCUSDT", "qty": 0.02, "avg_cost": 100 }
  ]
}
```

- `positions` 一定要有。空倉寫 `[]`,不要留空白檔。
- 別名:`as_of`/`updated_at`/`timestamp`,`cash`/`quote_balance`,`equity`/`total_equity`,`symbol`/`pair`,`qty`/`quantity`/`size`,`avg_cost`/`avg_entry`/`entry_price`。可用 `ledger_keys` 指定帳本頂層的鍵名。
- 有 `equity_daily.csv` 就用它當資產曲線(`date`,`equity`,可選 `cash`)。帳本裡的 equity 若和 CSV 最後一列不同,以 CSV 為準並警告。沒有 CSV 才用帳本的 equity;帳本也沒有就不送資產快照。
- 現價優先用 `ohlc_dir/{代號}.csv` 的最新 `close`(欄名 `date` + `close`)。代號裡的 `/` 會拿掉再找檔名,不會把代號當資料夾。
- 沒有 OHLC 時,才看帳本持倉裡的 `last_price` / `mark` / `price`,以及它自己的 `price_as_of`。都沒有則 `last_price` 與 `price_as_of` 都是 `null`。
- 持股區塊的 `as_of` 用帳本的 `as_of`,不會改成 K 線的時間。

`trades.csv` 欄:`executed_at`,`symbol`,`side`,`qty`,`price`,可選 `fee`,`note`。
`side` 接受 buy/sell、b/s、long/short、買/賣。空的手續費不送(不會補 0)。

父來源可加 `report`,指向下面那種 markdown。它會併進父 bot,不會變成另一個 bot。

## tw_paper

每個策略:

- `positions.csv`: `symbol`,`qty`,`avg_cost`,`date`(或 `as_of`),可選 `last_close`,`price_date`(或 `close_date` / `price_as_of`),`name`。
- `equity.csv`: `date`,`equity`,可選 `cash`。
- `trades.csv`: 跟加密貨幣相同。只有日期的成交時間用台股收盤規則。

空白的持股檔會失敗,不會被當成「已全部平倉」。
有現價但沒有價格日期時,價格照送,`price_as_of` 是 `null`,並在螢幕警告。

## tw_real

- `holdings.csv`: `symbol`,`qty`(或 `shares` / `股數`),`cost` 或 `avg_cost`,`cost_date`(或 `cost_as_of` / `date`)。
- `prices.csv`(可選): `symbol`,`close`,`date`。
- **沒有數量欄就失敗**,不會假設 1 股。
- `cost_means`:
  - `unit`(預設):`cost` 是一股的成本。若欄名是 `avg_cost` / `unit_cost` / `cost_price`,一律當單價,不再除一次。
  - `total`:`cost` 是總成本,單價 = 總成本 / 數量。
- 持股 `as_of` 用成本日期裡最晚的一筆(各筆日期不同時會警告)。`price_as_of` 只用價格檔的日期。對不到價格就是 `null`。

## report(markdown frontmatter)

```markdown
---
producer: 模擬交易室
generated_at: 2026-11-25T08:00:00+08:00
data_as_of: 2026-11-25T00:00:00Z
status: partial
---
這裡是摘要。沒有這段就不會送 summary。
```

只讀這幾個扁平欄位(不支援巢狀 YAML)。

| 檔案裡的 status | 送出的 status | 備註 |
|---|---|---|
| ok | ok | 不另加備註 |
| draft、partial、warn | warn | `來源狀態:draft` 這種字 |
| error、stop | stop | 同上 |

`generated_at` 是這次執行時間(`last_run_at`)。`data_as_of` 是資料時間(`bot_status.as_of` 和摘要的 `as_of`)。缺少 `data_as_of` 不會用 `generated_at` 補。
`producer` 若和設定的 bot 名稱不同,就停止,避免送錯 bot。
