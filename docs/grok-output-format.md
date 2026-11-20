# 給 Grok bot 的輸出格式說明(aiwr/v1)

> 用法:把下面「**貼進 bot 指令的段落**」整段複製,加到每個 bot 的指令最後面。
> bot 每次回報時,會在最後附上一段固定格式的 JSON。你把那段(或整段回覆)複製,登入 AI 作戰室 →「匯入」貼上即可。
> 可以一次貼好幾個 bot 的回報;網站會自動辨識是哪個 bot。

---

## 貼進 bot 指令的段落

````text
【AI 作戰室資料輸出規則】
每次回報的最後,請額外輸出一段機器可讀的 JSON,規則如下:

1. 第一行單獨寫 ===AIWR-BEGIN===,最後一行單獨寫 ===AIWR-END===,中間只放一個 JSON 物件。
2. 必須是合法 JSON:欄位名稱和文字都用英文半形雙引號 ",不可以有註解、不可以有結尾多餘的逗號。
3. 一定要有這三個欄位:
   "schema": "aiwr/v1"
   "bot": "<你的 bot 名稱,每次都要一模一樣>"
   "generated_at": "<產生這段 JSON 的時間>"
4. 所有時間都用 ISO 8601 並帶時區,例如 "2026-11-20T14:35:00+08:00"。
5. 數字就是數字:不要加引號、千分位逗號、單位或百分比符號(寫 3000,不要寫 "3,000股";寫 12.5,不要寫 "12.5%")。
6. 沒有的資料就整個區塊不要寫,或在允許的欄位填 null。絕對不要自己編數字;不知道就填 null。
7. 每個區塊都要有自己的資料時間(as_of):代表「這份資料是什麼時候的狀態」,不是現在時間。
8. 只寫下面格式裡有的欄位,不要自己加欄位。

可用的區塊(依你的 bot 用途挑需要的):
- bot_status:這次執行的狀態。status 只能是 "ok"(正常)、"warn"(注意)、"stop"(停擺)。
- positions:持股快照(要列出「全部」持股,不是只列有變動的)。account 是 "real"(真實)或 "paper"(模擬)。
- equity_snapshots:總資產快照(含現金)。
- trades:這次新增的交易紀錄。
- strategies:策略績效(要列出全部策略)。
- summary:一段文字摘要。
- fx_rates:匯率(例如 USDT 對 TWD)。
- ai_usage:AI 訂閱用量(service 只能是 "Claude Pro"、"Gemini Pro"、"Grok Premium"、"Google AI Studio")。

格式範例:
===AIWR-BEGIN===
{
  "schema": "aiwr/v1",
  "bot": "台股模擬交易室",
  "generated_at": "2026-11-20T14:35:00+08:00",
  "bot_status": {
    "status": "ok",
    "last_run_at": "2026-11-20T14:30:00+08:00",
    "note": "收盤後帳本已更新",
    "as_of": "2026-11-20T14:30:00+08:00"
  },
  "positions": [
    {
      "account": "paper",
      "as_of": "2026-11-20T13:30:00+08:00",
      "items": [
        { "market": "TW", "symbol": "2317", "name": "鴻海", "qty": 3000, "avg_cost": 205, "last_price": 212.5, "currency": "TWD", "price_as_of": "2026-11-20T13:30:00+08:00" }
      ]
    }
  ],
  "equity_snapshots": [
    { "account": "paper", "market": "TW", "currency": "TWD", "equity": 917500, "cash": 280000, "as_of": "2026-11-20T13:30:00+08:00" }
  ],
  "summary": { "text": "今日加碼鴻海 1 張。", "as_of": "2026-11-20T14:30:00+08:00" }
}
===AIWR-END===
````

---

## 欄位說明

### 共同欄位(每段都要有)

| 欄位 | 必填 | 說明 | 範例 |
|---|---|---|---|
| `schema` | ✅ | 固定寫 `"aiwr/v1"` | `"aiwr/v1"` |
| `bot` | ✅ | bot 名稱,**每次都要完全一樣**(網站用它辨識是哪個 bot) | `"台股模擬交易室"` |
| `generated_at` | ✅ | 產生 JSON 的時間,帶時區 | `"2026-11-20T14:35:00+08:00"` |

### `bot_status`(bot 狀態,物件)

| 欄位 | 必填 | 說明 |
|---|---|---|
| `status` | ✅ | `"ok"` 正常 / `"warn"` 注意 / `"stop"` 停擺 |
| `last_run_at` | ✅ | 這次執行的時間 |
| `note` | | 備註(300 字內) |
| `as_of` | ✅ | 狀態的時間(通常等於 `last_run_at`) |

### `positions`(持股快照,陣列;真實、模擬各最多一份)

| 欄位 | 必填 | 說明 |
|---|---|---|
| `account` | ✅ | `"real"` 真實 / `"paper"` 模擬 |
| `as_of` | ✅ | 這份持股是什麼時候的狀態(台股建議用收盤時間) |
| `items` | ✅ | 持股陣列(**全部**持股;空倉就寫 `[]`) |

`items` 每一筆:

| 欄位 | 必填 | 說明 |
|---|---|---|
| `market` | ✅ | `"TW"` 台股 / `"CRYPTO"` 加密貨幣 |
| `symbol` | ✅ | 代號,例:`"2330"`、`"BTC"` |
| `name` | | 名稱,例:`"台積電"` |
| `qty` | ✅ | 數量(股數或顆數,不是張數) |
| `avg_cost` | ✅ | 平均成本(單價) |
| `last_price` | ✅ | 現價;**拿不到就填 `null`,不要猜** |
| `currency` | ✅ | 幣別大寫代碼:台股 `"TWD"`,加密貨幣 `"USDT"` |
| `price_as_of` | ✅ | 現價的時間;沒有現價就填 `null` |

### `equity_snapshots`(總資產快照,陣列)

| 欄位 | 必填 | 說明 |
|---|---|---|
| `account` | ✅ | `"real"` / `"paper"` |
| `market` | ✅ | `"TW"` / `"CRYPTO"` |
| `currency` | ✅ | `"TWD"` / `"USDT"` |
| `equity` | ✅ | 總資產(持股市值 + 現金) |
| `cash` | | 現金 |
| `as_of` | ✅ | 快照時間 |

> 資產曲線會把每次匯入的快照串起來;同一時間點重複匯入,以後匯入的為準。

### `trades`(交易紀錄,陣列;只列「這次新增」的)

| 欄位 | 必填 | 說明 |
|---|---|---|
| `account`、`market`、`symbol`、`currency` | ✅ | 同上 |
| `side` | ✅ | `"buy"` / `"sell"` |
| `qty`、`price` | ✅ | 成交數量、成交價 |
| `fee` | | 手續費 |
| `executed_at` | ✅ | 成交時間 |
| `note` | | 備註 |

### `strategies`(策略績效,物件)

| 欄位 | 必填 | 說明 |
|---|---|---|
| `as_of` | ✅ | 績效計算時間 |
| `items` | ✅ | 策略陣列(**全部**策略) |

`items` 每一筆:

| 欄位 | 必填 | 說明 |
|---|---|---|
| `name`、`market` | ✅ | 策略名稱、市場(文字,例 `"BTC"`、`"台股回測 2016–2023"`) |
| `return_pct` | ✅ | 報酬率 %(例 `18.4`);沒有填 `null` |
| `max_drawdown_pct` | ✅ | 最大回撤 %,**0 或負數**(例 `-12.1`);沒有填 `null` |
| `trades` | ✅ | 交易次數(整數);沒有填 `null` |
| `oos_return_pct` | ✅ | 樣本外報酬 %;**還沒驗證就填 `null`**(網站會顯示「未驗證」) |
| `oos_period` | | 樣本外期間說明 |
| `curve` | | 資金曲線數字陣列(最多 400 點,例 `[100, 101.2, 99.8]`) |

### `summary`(摘要,物件)

`{ "text": "一段摘要(1000 字內)", "as_of": "<時間>" }`

### `fx_rates`(匯率,陣列)

| 欄位 | 必填 | 說明 |
|---|---|---|
| `base`、`quote` | ✅ | 例:`"USDT"` → `"TWD"` 表示 1 USDT = rate TWD |
| `rate` | ✅ | 匯率(大於 0) |
| `source` | ✅ | 來源(例:`"交易所報價"`) |
| `as_of` | ✅ | 匯率時間 |

> 網站只用你提供的匯率換算台幣合計;沒有匯率就不換算。USDT 不會被當成 USD。

### `ai_usage`(AI 用量,陣列)

| 欄位 | 必填 | 說明 |
|---|---|---|
| `service` | ✅ | `"Claude Pro"` / `"Gemini Pro"` / `"Grok Premium"` / `"Google AI Studio"` |
| `used_pct` | ✅ | 已用百分比 0–100;不知道填 `null` |
| `reset_at` | | 下次重置時間 |
| `source` | | `"manual"`(預設)或 `"auto"` |
| `note` | | 備註 |
| `as_of` | ✅ | 這個數字是什麼時候看到的 |

---

## 完整範例:一次貼兩個 bot

把兩個 bot 的回報接在一起貼上即可(中間的其他文字會被忽略):

===AIWR-BEGIN===
{
  "schema": "aiwr/v1",
  "bot": "程式交易",
  "generated_at": "2026-11-20T12:30:00+08:00",
  "bot_status": {
    "status": "warn",
    "last_run_at": "2026-11-20T12:26:00+08:00",
    "note": "191 個測試全過;台股三策略都輸 0050",
    "as_of": "2026-11-20T12:26:00+08:00"
  },
  "strategies": {
    "as_of": "2026-11-20T12:26:00+08:00",
    "items": [
      { "name": "RSI 背離", "market": "BTC", "return_pct": 18.4, "max_drawdown_pct": -12.1, "trades": 64, "oos_return_pct": null, "curve": [100, 101.5, 99.8, 104.2, 118.4] },
      { "name": "Vegas 通道", "market": "ETH", "return_pct": 9.7, "max_drawdown_pct": -15.3, "trades": 52, "oos_return_pct": 4.1, "oos_period": "2025-07 ~ 2025-12" }
    ]
  },
  "trades": [
    { "account": "paper", "market": "CRYPTO", "symbol": "BTC", "side": "buy", "qty": 0.01, "price": 68000, "fee": 0.68, "currency": "USDT", "executed_at": "2026-11-20T09:15:00+08:00" }
  ],
  "summary": { "text": "回測完成,等待樣本外驗證。", "as_of": "2026-11-20T12:26:00+08:00" }
}
===AIWR-END===

===AIWR-BEGIN===
{
  "schema": "aiwr/v1",
  "bot": "幣圈情報員",
  "generated_at": "2026-11-20T08:10:00+08:00",
  "bot_status": { "status": "ok", "last_run_at": "2026-11-20T08:00:00+08:00", "note": "晨報已送出", "as_of": "2026-11-20T08:00:00+08:00" },
  "positions": [
    {
      "account": "real",
      "as_of": "2026-11-20T08:00:00+08:00",
      "items": [
        { "market": "CRYPTO", "symbol": "BTC", "qty": 0.12, "avg_cost": 61000, "last_price": 68250.5, "currency": "USDT", "price_as_of": "2026-11-20T08:00:00+08:00" },
        { "market": "CRYPTO", "symbol": "ETH", "qty": 1.5, "avg_cost": 3300, "last_price": null, "currency": "USDT", "price_as_of": null }
      ]
    }
  ],
  "equity_snapshots": [
    { "account": "real", "market": "CRYPTO", "currency": "USDT", "equity": 9990.06, "cash": 1800, "as_of": "2026-11-20T08:00:00+08:00" }
  ],
  "fx_rates": [ { "base": "USDT", "quote": "TWD", "rate": 32.1, "source": "交易所報價", "as_of": "2026-11-20T08:00:00+08:00" } ]
}
===AIWR-END===

> ⚠️ 上面的數字都是**範例**,請不要直接匯入當成真實資料。

---

## 手動更新 AI 用量的範本

Claude Pro、Gemini Pro、Grok Premium 沒有官方 API 可以查訂閱用量,請自己看完各服務的用量頁後,改數字貼上:

===AIWR-BEGIN===
{
  "schema": "aiwr/v1",
  "bot": "manual",
  "generated_at": "2026-11-20T21:00:00+08:00",
  "ai_usage": [
    { "service": "Claude Pro", "used_pct": 40, "reset_at": "2026-11-21T03:00:00+08:00", "source": "manual", "as_of": "2026-11-20T21:00:00+08:00" },
    { "service": "Grok Premium", "used_pct": 95.4, "reset_at": "2026-11-23T11:00:00+08:00", "source": "manual", "note": "Grok Bot 佔大部分", "as_of": "2026-11-20T21:00:00+08:00" }
  ]
}
===AIWR-END===

只更新其中幾個服務也可以;沒寫到的服務保留原本的數字。

---

## 常見錯誤(網站會告訴你第幾行錯)

| 錯誤訊息 | 原因 | 改法 |
|---|---|---|
| 有不合法的字元(JSON 只能用英文半形雙引號) | 用了中文全形引號 `“ ”` 或單引號 `'` | 全部改成 `"` |
| 缺少逗號 | 兩個欄位之間少了 `,` | 在上一行結尾補 `,` |
| JSON 結束後還有多餘的內容 / 缺少右大括號 | 括號沒有成對 | 檢查 `{ }`、`[ ]` 是否成對 |
| JSON 不能有註解 | 寫了 `// 說明` | 刪掉註解 |
| 應該是數字(不要加引號或單位) | 寫成 `"3000"`、`"3,000股"`、`"12%"` | 改成 `3000`、`12` |
| 時間格式要像 2026-11-20T14:35:00+08:00(必須有時區) | 寫成 `"2026-11-20 14:35"` | 補上 `T` 和 `+08:00` |
| 不認得的欄位:xxx | 欄位名稱拼錯或自己加了欄位 | 照本文件的欄位名稱 |
| 缺少這個必填欄位 | 漏寫必填欄位 | 補上;不知道的值填 `null`(允許時) |
| bot「X」出現在第 1 段和第 3 段 | 同一次貼了兩份同一個 bot | 只留最新那份 |
| 最大回撤應該是 0 或負數 | 寫成 `12.1` | 改成 `-12.1` |

## 還原

每次匯入都會存成一個版本。如果匯入了錯的資料,到「匯入 → 歷史版本與還原」,點選正確的版本 →「還原」。
還原只影響那個版本裡的 bot,其他 bot 不受影響;任何版本都不會被刪除。
