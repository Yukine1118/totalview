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

- 檔案裡沒有的數字就送 `null`,或整段省略。不用現在時間,也不用起始資金填現金或總資產。
- 持股的 `as_of` 是這一筆持股快照的時間。`price_as_of` 是價格自己的時間。進場日(`entry_date`)不會拿去填價格時間。
- 只有日期、沒有時分的時候:
  - 加密貨幣(含日 K、`last_processed_date`)→ 當天 `00:00 UTC`
  - 台股(含收盤價、權益日期)→ 當天 `13:30+08:00`
  - 已經寫好時區的時間原樣保留。
- 幣別來自設定(`USDT` / `TWD`)。檔案裡若有幣別欄且不一樣,就停止,不換算。
- 欄位可以改名。在來源上加 `columns`,例如 `{ "symbol": "代號", "qty": "股數" }`。沒寫的欄名仍會試下面的別名。
- 數量、成本、價格若帶單位(像 `3000股`)會失敗,不會把字去掉硬送。
- 模擬策略的 bot 名稱是 `父bot/策略名`。父 bot 只含 `bot_status`、`strategies`、`summary`。
- 報酬率 = 最新權益 / `start_capital` − 1。沒有權益就是 `null`。檔案裡的 `cum_return` 不直接拿來當報酬(單位可能是比例,不猜)。
- 最大回撤由權益序列計算。檔案裡的 `max_drawdown` / `max_dd` 不直接送(同樣不猜單位)。
- 交易次數是這個策略在交易檔裡的列數(含水位已送過的)。沒有交易檔就是 `null`;檔案在、但這個策略是 0 列,就是 `0`。
- 曲線最多 400 點,資產快照最多送最近 500 筆。
- 交易水位依「每個策略自己的 bot」分開記。成功送出後才記住;`--dry-run` 和失敗都不更新。
- 共用 CSV 若有 `strategy` 欄(名稱可用 `strategy_column` 改),只送該策略的列。沒有這個欄,就整份都算這個策略。
- 路徑若用 `../` 跑出該來源的 `root`,會失敗。

## crypto_paper

帳本 `ledger/<策略>.json`(路徑寫在每個策略的 `ledger`):

```json
{
  "cash": 8000,
  "positions": {
    "BTCUSDT": { "qty": 0.02, "avg_price": 100 }
  },
  "equity": 10500,
  "sleeve_target_frac": {},
  "pending": {},
  "last_processed_date": "2026-11-25"
}
```

- `positions` 是**以代號為鍵的物件**。空倉寫 `{}`。舊的陣列形式也還讀得懂。
- `avg_price` 是單位成本。`sleeve_target_frac`、`pending` 以及其他沒列在上面的鍵都會忽略,不送出。
- `last_processed_date` 是持股快照日,送成當天 `00:00 UTC`。
- 有 `equity_daily.csv` 就用它當資產曲線,而且**多個策略共用一份**,用 `strategy` 欄篩。欄位:`date,strategy,equity,daily_pnl,cum_return,max_drawdown,data_flag`。只讀 date / strategy / equity。沒有 cash 欄,所以曲線上的現金不從這裡編。
- 帳本的 `cash` 只加在「日期等於 `last_processed_date`」的那一筆快照上。其他日子的現金不補。
- 帳本 `equity` 若和 CSV 最後一列不同,以 CSV 為準並在螢幕警告。沒有 CSV 才用帳本的 equity。
- `trades.csv` 也是多策略共用:`date,strategy,symbol,side,qty,price,fee,slippage,reason`。`slippage` 不加進手續費。`reason` 有字才送進 `note`。
- 日 K:`ohlc_dir` 裡的檔名由 `ohlc_filename` 決定,預設 `{symbol}_1d.csv`(欄位 `date,open,high,low,close,volume`)。用最新一列的 `close`,時間是該日 `00:00 UTC`。沒有檔就把現價和 `price_as_of` 設成 `null`。

設定鍵:`type`,`parent_bot`,`root`,`strategies[].name`,`strategies[].ledger`,以及可選的 `currency`,`start_capital`,`trades`,`equity_daily`,`ohlc_dir`,`ohlc_filename`,`strategy_column`,`report`,`columns`,`ledger_keys`。

## tw_paper

三個檔多策略共用,用 `strategy` 欄切開:

- `positions.csv`:`strategy,code,market,shares,cost,entry_date,entry_price,last_close`
  - `code` → 代號,`shares` → 數量,`entry_price` → 單位成本(有這個欄就用它,不把 `cost` 再除一次)。
  - `entry_date` 不送、也不拿去當價格時間。
  - `last_close` 的 `price_as_of`,以及整份持股的 `as_of`,都是該策略 `equity.csv` 最新 `date` 的 `13:30+08:00`。這個策略沒有權益列時,改用整份 equity.csv 最新的日期,並警告。
  - 這個策略現在沒有持股(沒有列,或股數是 0)是正常的:送空的 `positions`,不讓整次上傳失敗。
- `equity.csv`:`date,strategy,cash,market_value,equity,n_pos,cum_fee,cum_tax,cum_div,max_dd`
  - 只送 date、cash、equity。稅費、股利、max_dd 不送。
- `trades.csv`:`date,strategy,code,side,shares,open,price,notional,fee,tax,cash_after,pnl,reason`
  - 成交價用 `price`,不用 `open`。手續費用 `fee`,不加 `tax`。`reason` 有字才進 `note`。只有日期的成交時間是當天 `13:30+08:00`。

設定鍵:`type`,`parent_bot`,`root`,`strategies[].name`,`positions`,`equity`,`trades`,以及可選的 `currency`,`start_capital`,`strategy_column`,`report`,`columns`。某個策略也可以自己覆寫 `positions` / `equity` / `trades` 路徑。

## tw_real

`holdings.csv`:`code,name,shares,avg_cost,status,source,as_of`

- `code` 代號、`shares` 股數、`avg_cost` 單位成本、`name` 名稱。`status`、`source` 不送。
- 持股 `as_of` 用檔案的 `as_of`(只有日期就是當天 `13:30+08:00`)。這是成本/持股時間,不會抄去當價格時間。
- 沒有 `shares` 就失敗,不會假設 1 股。

收盤價可以來自報告裡的表格(可選,和 CSV `prices` 二擇一或同時給;同一代號以報告為準):

```markdown
## 持股六檔收盤（證交所）

| 代號 | 名稱 | 收盤 | 漲跌 | 漲跌% |
| --- | --- | --- | --- | --- |
| 9999 | DEMO | 18 | 1 | 5 |
```

- 標題、代號欄、收盤欄用 `price_table.heading` / `price_table.symbol` / `price_table.close`。不寫的話預設就是上面這組。
- 漲跌、漲跌% 不送。表格裡有、但持股檔沒有的代號,不會多造一筆持股。
- `price_as_of` 用這份報告 frontmatter 的 `data_as_of`;只有日期就用當天 `13:30+08:00`。沒有 `data_as_of` 就送 `null`,不拿別的時間補。

設定鍵:`type`,`bot`,`root`,`holdings`,以及可選的 `currency`,`cost_means`(`unit` 或 `total`),`prices`,`prices_report`,`price_table`,`columns`。

## report

Frontmatter 可以有巢狀欄位(例如 `sources:` 清單)。只讀 `producer`、`generated_at`、`data_as_of`、`status`、可選的 `note`。`sources` 不會送出。

| 檔案裡的 status | 送出 | 備註 |
|---|---|---|
| ok | ok | 不另加備註 |
| draft、partial、warn | warn | `來源狀態:…` |
| error、stop | stop | 同上 |

`generated_at` 是執行時間,`data_as_of` 是資料時間。缺少 `data_as_of` 不會用 `generated_at` 補。

**不會把整篇內文當摘要。** 要摘要才加:

```json
"summary": { "section": "摘要", "max_chars": 280 }
```

只取該標題底下、下一個同級標題之前的文字,最長 1000 字(超過就截斷並警告,不加刪節號)。找不到那個標題就不送 summary,狀態仍會送。不寫 `summary` 就完全不送摘要。

`producer` 若和設定的 bot 名稱不同,就停止。
