# AgriLedger

Local Electron + React + SQLite starter for the sales and inventory plan in `app.md`.

## What is in place

- Electron desktop shell with a custom menu
- React renderer with a polished dashboard and CRUD screens
- SQLite database stored in the local app data folder
- Seeded local admin login
- Product, customer, sales, and purchase/expense workflows
- Dashboard summaries for sales, VAT, inventory, and expenses

## Run locally

1. Install dependencies with `npm install`
2. Start the desktop app with `npm run dev`
3. Build a packaged app with `npm run build`

## Default login

- Username: `admin`
- Password: `admin123`

## Data location

The SQLite database is created under the Electron user data folder in a `data` subdirectory.

## Next phase

- Purchase line-item inventory receipts
- A/R and A/P aging views
- Import tools for existing Excel data
- Export reports for VAT and monthly P&L
