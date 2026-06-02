# nanimate

用 Apple Pencil 一格一格做動畫的筆記本網頁應用（POC）。

核心想法：在畫布上畫圖，按「✓ 完成這一幀」就把目前畫面存成動畫的一幀；繼續畫，新筆畫會**累加**在前一幀之上。播放時就像 flipbook 逐幀長出來。

## 開發

```bash
npm install
npm run dev      # 開發伺服器 http://localhost:5173
npm run build    # 產生 dist/
```

iPad 測試：`npm run dev -- --host`，用 iPad Safari 連到電腦的區網 IP。

## 資料模型（關鍵）

每一筆畫記錄它誕生的幀 `birthFrame`；第 N 幀 = 所有 `birthFrame <= N` 的筆畫。
- 累加：後面的幀天然包含前面的筆畫。
- 編輯舊幀：選某一幀後新增的筆畫從該幀起出現；刪除一筆會從所有幀消失。

見 `src/state/docReducer.ts`。

## 結構

- `src/canvas/DrawCanvas.tsx` — 命令式繪製（Pointer Events、壓感、coalesced events），筆畫完成才回傳給 React。
- `src/canvas/render.ts` / `strokePath.ts` — 用 `perfect-freehand` 算外框，畫布與縮圖共用的渲染。
- `src/state/` — `Doc` 資料模型、reducer、`useDoc`（含 localStorage 自動存檔）。
- `src/components/` — 工具列、時間軸縮圖、播放列、匯出選單。
- `src/hooks/usePlayback.ts` — rAF 播放迴圈。
- `src/lib/export.ts` — GIF（gif.js）與 WebM（MediaRecorder）匯出。

## 功能

繪製（壓感平滑筆跡）、完成幀、選幀/刪幀、播放（可調 fps/循環）、時間軸縮圖、橡皮擦（整筆刪除）、匯出 GIF/WebM/JSON、載入 JSON、localStorage 自動存檔。
