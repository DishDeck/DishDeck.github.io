# DishDeck · Google Drive & Google Sheets Architecture & Setup Guide

This guide explains how **DishDeck** operates as a zero-cost, high-performance digital restaurant menu using **GitHub Pages** (free hosting) and **Google Drive + Google Sheets** (free cloud storage and database).

---

## 🏛️ System Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CUSTOMER EXPERIENCE                             │
├────────────────────────────────────────────────────────────────────────┤
│  1. Diner sits at Table 4                                              │
│  2. Scans QR Code printed on table card                                │
│     (URL: https://username.github.io/DishDeck/?r=restaurant&table=4)   │
│  3. GitHub Pages loads mobile-first storefront                         │
│  4. Fetches live menu from Google Sheet (Public CSV / GVIZ API)        │
│  5. Fetches photos from Google Drive via high-speed CDN                │
│     (https://lh3.googleusercontent.com/d/{FILE_ID})                    │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                        ADMIN & STAFF EXPERIENCE                        │
├────────────────────────────────────────────────────────────────────────┤
│  1. Staff opens /admin.html?r=restaurant                               │
│  2. Signs in via Google Sign-In or authenticates with Apps Script      │
│  3. Views spreadsheet grid of all dishes                               │
│  4. 1-click updates: Prices, "Sold Out" status, Today's Specials       │
│  5. Uploads dish photos directly to Google Drive folder                │
│  6. Clicks "Save to Google Sheet" -> Updates in real time!             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🔒 Security & Privacy Model (Zero Data Leak)

| Entity | Permission | How Security is Enforced |
|---|---|---|
| **Public Diners** | **Read-Only (Viewer)** | Google Sheet is shared as **"Anyone with link: Viewer"**. No write permissions exist for anonymous visitors. No credentials or secret keys are stored in client-side code. |
| **Dish Photos** | **Read-Only (Viewer)** | Google Drive folder is shared as **"Anyone with link: Viewer"**. Diners can view images, but cannot alter or delete them. |
| **Restaurant Owner / Staff** | **Full Edit** | Staff edits are authenticated either by **Google OAuth 2.0** (Google verifies that the signed-in Google account has Editor access on the Sheet) or via **Google Apps Script** protected by an Admin Secret Passcode. |

> [!IMPORTANT]
> **No hardcoded secrets**: Your GitHub Pages repository is completely public and static. All API URLs, Sheet IDs, and tokens are configured dynamically in the Admin dashboard and stored in browser memory or local storage.

---

## 📁 Step 1: Create the Google Drive Folder & Google Sheet

### 1.1 Create the Google Drive Folder
1. Go to [Google Drive](https://drive.google.com).
2. Click **New → New folder**, name it: `DishDeck - Restaurant Assets`.
3. Right-click the folder → **Share → Share**.
4. Under **General access**, select: **"Anyone with the link"** and set role to **"Viewer"**.
5. Inside this folder, create a subfolder named `images` (for dish photos).

### 1.2 Create the Google Sheet
1. Inside the `DishDeck - Restaurant Assets` folder, create a new **Google Sheet**.
2. Name it: `DishDeck Menu`.
3. Rename the first tab to **`Menu`**.
4. In Row 1 of the **`Menu`** tab, paste the following column headers:

| Col | Header | Description | Example |
|---|---|---|---|
| A | `id` | Unique slug (optional, auto-generated) | `paneer-tikka` |
| B | `category` | Menu section / category | `starters` |
| C | `name` | Dish name | `Paneer Tikka` |
| D | `description` | Dish description & ingredients | `Marinated cottage cheese roasted in tandoor` |
| E | `price` | Selling price (number) | `280` |
| F | `variants` | Optional size variants | `Half=160 \| Full=280` |
| G | `image` | Google Drive link, ID, or image URL | `https://drive.google.com/file/d/1A2B3C.../view` |
| H | `video` | Short 5-10s clip URL (.mp4/.webm) | `https://cdn.example.com/video.mp4` |
| I | `tags` | Searchable comma-separated tags | `veg, bestselling, tandoor` |
| J | `spice` | Spice indicator (0 to 3) | `2` |
| K | `status` | Stock status | `on` (in stock), `soldout`, `off`, `hidden` |
| L | `special` | Feature on Today's Board | `TRUE` or `FALSE` |
| M | `special_price`| Discounted price for today | `240` |
| N | `special_from` | Promo start date | `2026-10-10` |
| O | `special_to` | Promo end date | `2026-10-15` |
| P | `sort` | Display order (10, 20, 30...) | `10` |
| Q | `note` | Chef's note or allergy notice | `Contains dairy & nuts` |

### 1.3 Add Sample Rows

```csv
id,category,name,description,price,variants,image,video,tags,spice,status,special,special_price,special_from,special_to,sort,note
paneer-tikka,starters,Paneer Tikka,Marinated cottage cheese cubes roasted with peppers in a clay oven,280,Half=160 | Full=280,,,veg, tandoor, popular,2,on,TRUE,240,,,10,Gluten-free
butter-chicken,curries,Butter Chicken,Slow-simmered tandoori chicken in a rich tomato-cashew satin gravy,480,,,,chicken, bestseller, mild,1,on,FALSE,,,,20,Chef's recommendation
garlic-naan,breads,Garlic Naan,Hand-stretched flatbread studded with fresh garlic and cilantro,65,,,,bread, veg,0,on,FALSE,,,,30,
kesar-kulfi,desserts,Kesar Pista Kulfi,Traditional frozen malai dessert infused with saffron strands and pistachios,140,,,,dessert, veg, sweet,0,soldout,FALSE,,,,40,
```

### 1.4 Get the Sheet ID
Look at the URL of your Google Sheet in your browser bar:
```
https://docs.google.com/spreadsheets/d/1AbCDefGhIJkLmnoPQRstuVWxyz0123456789/edit
                                        ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
                                                    SHEET ID
```
Copy that string between `/d/` and `/edit`.

---

## 🖼️ How Google Drive Images Work in DishDeck

Google Drive share links (`https://drive.google.com/file/d/ID/view`) cannot normally be embedded in standard `<img>` tags because Google returns an HTML preview wrapper instead of the raw image stream.

**DishDeck solves this automatically**:
- You can paste **any** Google Drive link, share URL, or bare File ID into the `image` column or in the Admin image modal.
- DishDeck's built-in image resolver (`resolveGoogleDriveUrl`) automatically converts the URL to Google's high-speed user content CDN:
  ```
  https://lh3.googleusercontent.com/d/{FILE_ID}
  ```
- **Fallback**: If an image is unavailable or network is interrupted, DishDeck automatically displays a stylized, color-coordinated plate icon generated on the fly.

---

## ⚡ Step 2: Deploy Google Apps Script (Zero-Server Backend)

To enable 1-click saves from the Admin page and direct image uploads to your Google Drive folder:

1. In your Google Sheet, click **Extensions → Apps Script**.
2. Delete any boilerplate code in `Code.gs`.
3. Open [`google-apps-script/Code.gs`](google-apps-script/Code.gs) in this repository, copy the entire file contents, and paste it into the Apps Script editor.
4. *(Optional Security)*: In Apps Script, click **Project Settings** (gear icon) → **Script Properties → Add script property**:
   - Property: `ADMIN_SECRET_KEY`
   - Value: *(your secret passcode, e.g. `MyRestoPin789`)*
5. Click **Deploy → New deployment**.
6. Click the gear icon next to "Select type" and choose **Web app**.
7. Configure:
   - **Description**: `DishDeck API`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone` *(needed so requests from your GitHub Pages frontend can reach the script)*
8. Click **Deploy** and authorize permissions when prompted.
9. Copy the **Web app URL** (looks like `https://script.google.com/macros/s/.../exec`).

---

## 🛠️ Step 3: Connect to DishDeck

You can connect your Google Sheet in either of two ways:

### Option A: Via the Admin UI (Zero Code)
1. Open `https://yourusername.github.io/DishDeck.github.io/admin.html?r=my-restaurant`.
2. Click **⚙️ Settings** in the top right.
3. Paste:
   - **Google Sheet ID**
   - **Google Apps Script URL**
   - **Admin Secret Key** *(if set in Script Properties)*
   - **Google Drive Folder ID** *(optional, for image uploads)*
4. Click **Save & Apply**. DishDeck will immediately sync with your Google Sheet!

### Option B: In Restaurant Config (`brand.json` or `brand.yaml`)
Open `restaurants/my-restaurant/brand.json` and set the `data` block:
```json
{
  "name": "My Restaurant",
  "data": {
    "source": "sheet",
    "sheetId": "YOUR_GOOGLE_SHEET_ID_HERE",
    "scriptUrl": "https://script.google.com/macros/s/.../exec",
    "sheets": {
      "menu": "Menu"
    }
  }
}
```

---

## 🪑 Step 4: Table QR Codes & In-Store Experience

1. Open `/qr.html?r=my-restaurant`.
2. Choose your restaurant.
3. **Single Table QR**:
   - Enter a table number (e.g. `4`).
   - The QR code updates to `https://yoursite/?r=my-restaurant&table=4`.
   - When scanned, the customer's phone displays: **"🍽️ Table 4"** right on the menu hero!
4. **Batch Table Cards**:
   - Switch the dropdown to **Batch Table Cards (e.g. Tables 1 to 10)**.
   - Enter your table range: From `1` to `12`.
   - Click **🖨️ Print All Table Cards (PDF)** to print a sheet of table tent cards ready to cut and display on tables!

---

## 📊 Summary of Free Resource Limits

| Resource | Service | Cost | Quota / Limits |
|---|---|---|---|
| **Web App Hosting** | GitHub Pages | **$0.00** | 100 GB bandwidth / month (supports tens of thousands of menu views) |
| **Menu Database** | Google Sheets | **$0.00** | 10 million cells per spreadsheet |
| **Image Hosting** | Google Drive | **$0.00** | 15 GB free storage per Google Account (~15,000 high-res photos) |
| **Image CDN Delivery** | Google User Content | **$0.00** | High-speed global edge caching |
| **Admin API Execution** | Google Apps Script | **$0.00** | 20,000 URL fetch & script calls / day |
