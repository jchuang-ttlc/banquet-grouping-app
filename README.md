# Banquet Auto Grouping Web App

這是一個可部署於 GitHub Pages 的餐會自動分桌網頁，搭配 Firebase Firestore 做多人同步。

## 功能

- 設定頁：建立活動、設定桌數與各桌人數（可不同）。
- 輸入頁：參加者填入名稱後，從仍有空位的桌次中隨機分配。
- 避免重覆：相同名稱不可重覆送出。
- 不可任意更改：參加者資料建立後不可更新或刪除。
- 管理頁：可查看結果、關閉活動、下載 CSV。

## 檔案結構

- `index.html`：首頁入口
- `setup.html`：設定者頁
- `join.html`：參加者頁
- `admin.html`：管理與下載頁
- `assets/app.css`：共用樣式
- `assets/firebase.js`：Firebase 資料操作
- `firestore.rules`：Firestore 規則範本

## 使用前設定

1. 建立 Firebase 專案並啟用 Firestore。
2. 到 Firebase Console 建立 Web App，取得設定值。
3. 編輯 `assets/firebase.js` 的 `firebaseConfig`，填入你的專案資訊。
4. 透過 Firebase CLI 部署 `firestore.rules`：

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init firestore
   firebase deploy --only firestore:rules
   ```

## 部署到 GitHub Pages

1. 建立 GitHub repository，將此專案 push 上去。
2. 到 GitHub repository 的 Settings -> Pages。
3. Source 選擇 `Deploy from a branch`，Branch 選 `main`（或你的預設分支）與 `/ (root)`。
4. 幾分鐘後即可從 GitHub Pages 網址使用。

## 使用流程

1. 進入 `setup.html` 建立活動（例如 `dinner2026`）。
2. 複製系統產生的 `join.html?event=...` 連結給參加者。
3. 參加者輸入名稱，系統從仍有空位的桌次中隨機分配組別。
4. 設定者在 `admin.html?event=...` 輸入管理密碼查看結果並下載 CSV。

## 注意事項

- 這是純前端 + Firestore 版本，管理密碼保存在 Firestore 文件內（雜湊未實作）。
- 若你需要更高等級安全（例如真正私密管理權限、不可偽造管理操作），建議加上：
  - Firebase Authentication（管理者登入）
  - Cloud Functions（由後端執行分組與管理操作）
