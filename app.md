# 📋 Sales & Inventory Management App — Project Plan

## 1. Overview

A web-based business management application for a dairy/agri-supply business. The app digitizes and streamlines sales recording, purchase tracking, inventory management, accounts receivable/payable, and financial reporting — replacing the current Excel-based workflow.

---

## 2. Goals

- Replace manual Excel entry with a fast, structured data entry system
- Provide real-time inventory tracking with automatic deductions on sale
- Generate financial summaries (sales, profit, expenses, VAT) automatically
- Track accounts receivable and payable
- Support multiple sales channels (Shopee, Walk-In, Lalamove, 2GO, etc.)
- Be accessible to non-technical staff (simple UI, minimal training needed)

---

## 3. Core Modules

### 3.1 Sales Module
- Record sales transactions (date, customer, product, qty, unit price, channel)
- Auto-compute: gross amount, input VAT, output VAT, VAT-exempt amount, profit
- Support sales channels: Shopee, Walk-In, Lalamove, Victory, Matatag Cargo, 2GO, SI-based
- Attach SI/receipt number and PO number
- Mark status: PAID / A/R (Accounts Receivable) / FAILED DELIVERY
- Customer address and contact info storage
- Link to Shopee username for online orders

### 3.2 Purchases / Expenses Module
- Record purchases with TIN, supplier name, receipt number, address
- Categorize expenses:
  - Communication, Light & Water
  - Fuel & Oil
  - Materials & Supplies
  - Repairs & Maintenance
  - Delivery Charges & Fees
  - Transportation & Travel / Toll Fees
  - Representation
  - Office Supplies
  - Salaries
  - Permits & Licenses
  - Professional Fees
  - Others / Miscellaneous
- Auto-compute Net of VAT and Output VAT
- Monthly expense summary by category

### 3.3 Inventory Module
- Product catalog with: code, name, description, category, unit cost, average cost, SRP
- Real-time stock levels — auto-deduct on confirmed sale, auto-add on purchase
- Per-date inventory movement log (QTY IN / QTY OUT / SALES)
- Low stock alerts
- Inventory valuation (Qty × Average Cost)
- Support product categories: Milking Equipment, Spare Parts, Medicines/Vet Products, Feed Supplements, Accessories

### 3.4 Accounts Receivable (A/R)
- Track unpaid/partial sales orders
- Flag overdue accounts
- Record payments and update balance
- Customer statement view

### 3.5 Accounts Payable (A/P)
- Track outstanding supplier balances
- Record payments
- Aging summary

### 3.6 Reports & Dashboard
- Daily / Monthly sales summary
- Top products by revenue and quantity
- Profit & Loss summary (Sales − Cost − Expenses = Net)
- VAT summary (Input VAT, Output VAT, VAT-Exempt Sales)
- Expense breakdown by category
- Inventory valuation report
- Sales by channel breakdown (Shopee vs Walk-In vs Delivery, etc.)

---

## 4. Data Models

### Product
| Field | Type |
|---|---|
| id | UUID |
| code | String |
| name | String |
| category | Enum |
| unit | String |
| cost | Decimal |
| average_cost | Decimal |
| srp | Decimal |
| stock_qty | Decimal |
| is_vat_exempt | Boolean |

### Customer
| Field | Type |
|---|---|
| id | UUID |
| name | String |
| address | String |
| contact_number | String |
| customer_username | String |
| tin | String |

### Sale (Transaction Header)
| Field | Type |
|---|---|
| id | UUID |
| date | Date |
| si_number | String |
| customer_id | FK → Customer |
| channel | Enum |
| status | Enum (PAID / A/R / FAILED) |
| po_number | String |
| invoice_type | String |
| remarks | String |

### Sale Item (Transaction Line)
| Field | Type |
|---|---|
| id | UUID |
| sale_id | FK → Sale |
| product_id | FK → Product |
| qty | Decimal |
| unit | String |
| unit_price | Decimal |
| gross_amount | Decimal |
| input_vat | Decimal |
| output_vat | Decimal |
| vat_exempt_amount | Decimal |
| costing | Decimal |
| total_cost | Decimal |
| profit | Decimal |

### Purchase
| Field | Type |
|---|---|
| id | UUID |
| date | Date |
| supplier_tin | String |
| supplier_name | String |
| receipt_number | String |
| address | String |
| gross_amount | Decimal |
| net_of_vat | Decimal |
| output_vat | Decimal |
| expense_category | Enum |

---

## 5. Tech Stack

### Desktop / macOS Application
| Layer | Technology |
|---|---|
| Framework | **Electron** (cross-platform desktop, runs on macOS natively) |
| Frontend | **React + Tailwind CSS** (UI components and styling) |
| State Management | **Zustand** or Redux Toolkit |
| Database | **SQLite** via `better-sqlite3` (local, no server needed, fast) |
| ORM | **Drizzle ORM** or Kysely (type-safe SQLite queries) |
| Reports / Charts | **Recharts** or Chart.js |
| Export | **xlsx** (Excel export) + **jsPDF** (PDF export for BIR reports) |
| Auto-update | **electron-updater** (push updates to installed app) |
| Build & Package | **electron-builder** (produces `.dmg` installer for macOS) |
| Dev Environment | Node.js + Vite (fast dev builds) |

### Why This Stack
- **Electron** — proven framework for macOS desktop apps (Slack, VS Code, Notion all use it); single codebase works on Mac and Windows if needed later
- **SQLite** — zero-config local database; all data stored on-device; no internet required; easily backed up as a single `.db` file
- **React + Tailwind** — fast to build polished, professional UIs
- **electron-builder** — produces a standard macOS `.dmg` installer your staff can double-click to install

### Data Storage & Backup
- Primary data: SQLite database file stored in macOS app data folder (`~/Library/Application Support/AppName/`)
- Manual backup: Export full DB or Excel snapshot anytime
- Optional: iCloud Drive or Google Drive auto-backup of the `.db` file

---

## 6. User Roles

| Role | Access |
|---|---|
| Admin / Owner | Full access — all modules, reports, settings |
| Sales Staff | Sales entry, customer lookup, basic inventory view |
| Encoder | Purchase entry, inventory updates |
| Viewer | Read-only reports and dashboard |

---

## 7. Development Phases

### Phase 1 — Foundation (Weeks 1–3)
- [ ] Electron + React + Vite project scaffold
- [ ] SQLite database setup with schema migrations
- [ ] macOS app window, menu bar, and app icon
- [ ] Login screen with local user authentication
- [ ] Product catalog CRUD
- [ ] Customer CRUD
- [ ] Basic sales entry form
- [ ] Sales list view with filters

### Phase 2 — Core Features (Weeks 4–6)
- [ ] Auto-computation of VAT, profit, totals
- [ ] Inventory auto-deduction on sale
- [ ] Purchase / expense entry
- [ ] Accounts receivable tracking
- [ ] Basic dashboard (sales total, profit, top products)

### Phase 3 — Reporting & Polish (Weeks 7–9)
- [ ] Monthly P&L report
- [ ] VAT summary report
- [ ] Sales-by-channel breakdown
- [ ] Inventory valuation report
- [ ] Excel / PDF export
- [ ] Low stock alerts

### Phase 4 — Refinement (Weeks 10–11)
- [ ] Data import from existing Excel files (one-time migration tool)
- [ ] User roles and permissions (local accounts)
- [ ] macOS-native features: keyboard shortcuts, menu bar actions, notifications
- [ ] Auto-backup to iCloud Drive / Google Drive (optional setting)
- [ ] Testing on macOS (Ventura, Sonoma)
- [ ] Bug fixing and performance tuning

### Phase 5 — Launch (Week 12)
- [ ] Package as `.dmg` installer via electron-builder
- [ ] Code-sign the app for macOS Gatekeeper (no "unverified developer" warning)
- [ ] Staff installation and training
- [ ] Go-live with parallel Excel tracking (1–2 weeks overlap)
- [ ] Full cutover + first monthly report generated from app

---

## 8. Key Business Rules

1. **VAT Computation:** `Input VAT = Gross Amount / 1.12 × 0.12`; `Net of VAT = Gross / 1.12`
2. **VAT-Exempt Products:** Dairy Solutions (Gatas & Seeds) — no VAT applied
3. **Profit per line:** `Profit = Gross Amount − Total Cost`
4. **Total Cost per line:** `Total Cost = Qty × Unit Costing`
5. **Average Cost:** Weighted average updated on every new purchase receipt
6. **Shipping Fees:** Recorded as separate line items; zero costing; full amount = profit
7. **Failed Deliveries:** Zero out qty, amount, and profit; retain record

---

## 9. Nice-to-Have (Future Features)

- Shopee order import via CSV upload
- SMS/email notification for A/R overdue accounts
- Barcode scanning via connected USB scanner
- Supplier price history tracking
- Multi-user support via local network (one Mac as host, others connect)
- Windows version (Electron supports it with minimal changes)
- iCloud / Google Drive automatic nightly backup
- BIR form pre-fill (2550M, 1702Q) with PDF export
- Touch Bar support (MacBook Pro)

---

## 10. Success Metrics

- Sales entry time reduced by 70% vs Excel
- Zero manual computation errors
- Real-time inventory accuracy ≥ 99%
- Monthly financial report generated in < 1 minute
- All staff able to use app after 1-day training

---

*Document Version: 1.0 | Created: April 2026*
