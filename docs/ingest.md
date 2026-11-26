# 自動匯入(不用再手動貼 JSON)

bot 在你自己的電腦上產出檔案。這個網站在 Vercel 上,讀不到那些檔案。
所以改成:你的電腦跑一支小程式,把檔案編成跟以前貼上相同的 `aiwr/v1` JSON,用一個**只能寫、不能讀**的網址送進來。

送進來之後,和手動貼上一樣:有版本、可以在「歷史版本」還原。來源會標成「自動匯入」,不是「貼上」。

觀看頁面仍然要 GitHub 登入。這個寫入網址不看登入,只認一組你自己設的 token。

## 你要自己做的兩件事

程式合併、部署之後,**先做完這兩件,自動匯入才會真的寫進資料庫**。沒做的話,端點會拒絕寫入,不會寫進一半。

### 1. 在 Vercel 設定 `INGEST_TOKEN`

1. 在自己的電腦產生一組亂碼(不要貼到聊天、不要 commit):

   ```bash
   openssl rand -base64 32
   ```

2. 打開 Vercel → 專案 `ai-war-room` → Settings → Environment Variables。
3. 新增 `INGEST_TOKEN`,值貼上剛剛的亂碼。環境選 Production(要用 Preview 網址測,就再加一份到 Preview)。設成 Sensitive。
4. **重新部署一次**。Next.js 要在部署當下看得到這個變數。只存檔、不重新部署,正式網站還是會當成「沒設定」。
5. 本機上傳時,把**同一個值**放在環境變數 `AIWR_INGEST_TOKEN`(名稱不一樣,值一樣)。不要寫進 `aiwr.upload.json`。

沒設定 `INGEST_TOKEN` 時,`POST /api/ingest` 回 **503**,什麼都不寫。

### 2. 在 Supabase 執行 migration

資料庫目前的 `source` 只允許 `paste` 和 `restore`,寫入函式也把來源寫死成 `paste`。
自動匯入要多一個 `ingest`。請執行:

`supabase/migrations/0003_aiwr_ingest_source.sql`

步驟:

1. 打開 Supabase 專案 `ai-war-room` → SQL Editor → New query。
2. 把那個檔案**整份**貼上,按 Run。
3. 可以重跑。它會先拿掉舊的 source 檢查再加回來,函式是 `create or replace`,不會刪資料,也不會改「貼上匯入」那條路。

還沒跑的時候,帶對 token 的請求會回 **503** `{"error":"ingest_not_ready"}`,不會寫入。
貼上匯入不受影響。

若跑完仍回 `ingest_not_ready`,到 Supabase → Project Settings → API,按 Reload schema,或等一分鐘再試(檔案最後有 `notify pgrst`)。

## 用 curl 試一次

把 `YOUR_INGEST_TOKEN` 換成你的 token。不要把真的 token 寫進檔案再 commit。

```bash
curl -sS -X POST https://ai-war-room-gamma.vercel.app/api/ingest \
  -H "Authorization: Bearer YOUR_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @payload.json
```

`payload.json` 是一份 `aiwr/v1`(可以是單一物件、陣列,或包著 `===AIWR-BEGIN===` / `===AIWR-END===`)。
成功時只回傳寫了幾個 bot,例如 `{"ok":true,"written":1,"skipped":0}`。內容和上一版一樣時 `written` 是 0,不會再堆一個版本。
錯誤時會有第幾行,例如 `{"error":"invalid","issues":[{"line":3,"message":"..."}]}`。

其他方法(GET 等)回 405。Token 不對回 401。

## 本機上傳腳本

腳本在 `scripts/aiwr-upload/`。它**不會**內建路徑或 token。

```bash
cp scripts/aiwr-upload/config.example.json ./aiwr.upload.json
# 編輯 aiwr.upload.json,把 root 改成你電腦上的資料夾(這個檔已被 gitignore)

export AIWR_INGEST_TOKEN='貼上和 Vercel 相同的值'

# 先看會送出什麼,不連線
npm run upload:aiwr -- --config ./aiwr.upload.json --dry-run

# 確定了再送
npm run upload:aiwr -- --config ./aiwr.upload.json
```

失敗(網路、格式、伺服器拒絕)會以非 0 結束,而且**不會**把交易記進水位檔,下次還會再送。
成功之後,水位檔(預設跟設定檔放一起的 `.aiwr-watermark.json`)記住已送過的交易,下次只送新的。

欄位對應與「檔案裡沒有就不送」的規則見 `scripts/aiwr-upload/README.md`。

## 設定檔長什麼樣子

完整範例是 `scripts/aiwr-upload/config.example.json`(路徑是假的)。結構:

```json
{
  "endpoint": "https://ai-war-room-gamma.vercel.app/api/ingest",
  "watermark": ".aiwr-watermark.json",
  "sources": [
    {
      "type": "crypto_paper",
      "parent_bot": "模擬交易室",
      "root": "/你的/加密模擬資料夾",
      "currency": "USDT",
      "start_capital": 10000,
      "report": "report.md",
      "strategies": [
        {
          "name": "mean_reversion",
          "ledger": "mean_reversion/ledger.json",
          "trades": "mean_reversion/trades.csv",
          "equity_daily": "mean_reversion/equity_daily.csv",
          "ohlc_dir": "ohlc"
        }
      ]
    },
    {
      "type": "tw_paper",
      "parent_bot": "台股模擬交易室",
      "root": "/你的/台股模擬資料夾",
      "currency": "TWD",
      "start_capital": 50000,
      "strategies": [
        {
          "name": "swing",
          "positions": "swing/positions.csv",
          "equity": "swing/equity.csv",
          "trades": "swing/trades.csv"
        }
      ]
    },
    {
      "type": "tw_real",
      "bot": "真實持股",
      "root": "/你的/真實持股資料夾",
      "currency": "TWD",
      "cost_means": "unit",
      "holdings": "holdings.csv",
      "prices": "prices.csv"
    }
  ]
}
```

每個模擬策略會用自己的 bot 名稱,例如 `模擬交易室/mean_reversion`,避免持股和資產曲線互蓋。
父 bot 只送狀態、策略績效和摘要。

省略 `currency` 時,加密貨幣用 `USDT`、台股用 `TWD`。省略 `start_capital` 時,加密貨幣用 10000、台股用 50000。這兩個數字只用來算報酬率,不會拿去假裝現金或總資產。
