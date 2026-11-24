# ARCHITECTURE.md — الخريطة التقنية لـ CORVEX SPORT

## 1. البنية العامة
- **الاستضافة:** Cloudflare Pages. المجلد المنشور `public/` (واجهة ثابتة) + Pages Functions في `functions/` (API).
- **قاعدة البيانات:** Cloudflare D1 (SQLite) باسم `corvex-sport-db`، binding `DB` (`wrangler.toml`).
- **لا توجد مرحلة build ولا اعتماديات npm للتشغيل.** `package.json` للسكربتات والاختبارات فقط.
- **النشر:** كل push إلى `main` يُنشر إنتاجيًا تلقائيًا عبر تكامل Cloudflare Pages مع GitHub (فحص «Cloudflare Pages» على
  الـ commit). بقية الفروع تُنشر كمعاينات فقط.
- **الجداول تُنشأ وتُرقّى ذاتيًا من الكود** (`CREATE TABLE IF NOT EXISTS`، `ALTER TABLE ADD COLUMN`)، وترحيلات المرة الواحدة
  عبر `runSchemaMigrationOnce` (`functions/api/_schema-migrations.js`، جدول `schema_migrations`). `schema.sql` هو الأساس فقط.

## 2. توجيه الـ API
- `functions/api/[[path]].js` — الموجّه العام القديم (تسجيل الدخول، الطلبات، المتاجر، المستخدمين، الطباعة، المرتجعات القديمة، المناديب، التقارير…).
- أي ملف محدد مثل `functions/api/x.js` أو `functions/api/a/b.js` **يتقدم** على `[[path]].js` لنفس المسار.
- الملفات التي تبدأ بـ `_` وحدات مساعدة وليست مسارات.
- `functions/api/orders/_middleware.js` وسيط لمسارات `/api/orders/*`.
- المصادقة: `Authorization: Bearer <token>` من جدول `sessions`؛ الأدوار `admin` و`staff`.

### نقاط API الرئيسية
| المسار | الملف | الوظيفة |
|---|---|---|
| `/login`, `/me`, `/orders`, `/orders/:id`, `/orders/bulk-status`, `/print-batches`, `/stores`, `/users`, `/returns*`, `/couriers*`, `/store-settlements*`, `/delivery-reconcile/history` | `[[path]].js` | الوظائف الأساسية |
| `POST /delivery-reconcile/preview` | `delivery-reconcile/preview.js` | مطابقة سطور كشف التوصيل (قراءة فقط) |
| `POST /delivery-reconcile/commit` | `delivery-reconcile/commit.js` | اعتماد وتسكير الكشف (تسوية مالية) |
| `GET /delivery-reconcile/settlement` | `delivery-reconcile/settlement.js` | تفاصيل كشف سابق (قراءة) |
| `POST /delivery-reconcile/correction` | `delivery-reconcile/correction.js` | تصحيح تسوية سابقة (مدير؛ dry_run) |
| `GET /order-investigation` | `order-investigation.js` | تحقيق كامل في طلب (مدير؛ قراءة) |
| `GET /profit-shipping-cohorts`, `POST` (إعلانات) | `profit-shipping-cohorts.js` | أرباح الشحنات حسب يوم الخروج (القسم السفلي) |
| `GET /profit-statements` | `profit-statements.js` | أرباح الكشوف حسب تاريخ الكشف (القسم العلوي) |
| `GET/POST /daily-commitment` | `daily-commitment.js` | الالتزام اليومي (كورفكس) |
| `/cargo-returns-preview`, `/cargo-returns-commit`, `/cargo-return-receipt` | `cargo-*.js` | كشوف المرتجعات بالمستودع |
| `/inventory`, `/inventory-return-audit` | `inventory.js`, `inventory-return-audit.js` | المخزون وتدقيقه |
| `/partial-delivery-items` | `partial-delivery-items.js` | موديلات الطلب وكوستها للتسليم الجزئي |
| `/customer-return-risk` | `customer-return-risk.js` | تحذير العميل المزعج |
| `/profit-models`, `/profit-settlements`, `/profit-note-edit`, `/profit-interpret` | | إدارة الموديلات والأرباح القديمة |
| `/litesale-*`, `/shared-orders`, `/direct-orders`, `/returns-fast`, `/control`, `/dashboard`, `/delivery-alerts`, `/admin-reset`, `/cepoxy-*`, `/meta/webhook` | | تكاملات ووظائف أخرى |

## 3. الوحدات المشتركة (تعديلها يؤثر على أكثر من قسم)
| الوحدة | يستخدمها | ملاحظات |
|---|---|---|
| `_inventory.js`: `classifyInventoryItems`, `loadInventoryModels`, `FUR_ALIASES`, `deductOnFirstPrint`, `returnRestockPlan`, `restockStatements` | الطباعة، الكوست، الأرباح (القسمان)، المرتجعات، التدقيق، المطابقة الجزئية | **أخطر ملف**: أي تغيير في التعرف/الكميات يغيّر الكوست والمخزون والأرباح معًا |
| `_partial-delivery.js`: `approvedCost`, `loadCostedModels`, `shippedItems`, `pricePartialDelivery`, `shipmentDateFit`, `normalizePhone`, `refusalCash`, ترحيلات الكتالوج | المطابقة، الاعتماد، التصحيح، الأرباح | |
| `_cargo-closed.js`: `loadClosedIndex` | مرتجعات المستودع، التدقيق، الأرباح السفلية، التصحيح، التحقيق | تعريف «مستلم فعليًا» |
| `_settlement-date.js` | اعتماد الكشف، التصحيح | تاريخ الكشف |
| `_status-history.js` | الاعتماد، التصحيح، التغيير الجماعي، كشف المرتجعات، الموجّه العام | trigger لكل تغيير حالة |
| `profit-shipping-cohorts.js` | القسم السفلي + يُستدعى كما هو من `profit-statements.js` للكوست | لا تعدّله ضمن مهام القسم العلوي |
| `public/delivery-pdf-rows.js` | قارئ PDF في `app-v62.js` + الاختبارات | دالة نقية |

## 4. قاعدة البيانات (الجداول الرئيسية)
- **الأساس:** `users`, `sessions`, `stores`, `orders` (الحالة `delivery_status`، `delivered_amount`، `cash_collected`، `delivery_fee`، `delivery_company_settled`، `delivery_company_settlement_id`، `first_printed_at`، `partial_received_items`، `status_source`، `status_by` …), `print_batches`, `print_batch_orders`, `order_departures`, `deleted_orders`, `regions`, `region_groups`.
- **التسويات:** `delivery_company_settlements` (الكشف: `settlement_code` DC-… أو DCX-… للتصحيح، `statement_date`، `net_due`)، `delivery_company_settlement_orders` (سطر لكل طلب: `imported_status`, `applied_status`, `imported_amount`, `match_type`, `shipment_date`, `shipment_code`)، `delivery_settlement_corrections` (UNIQUE(order_id, from_settlement_id))، `order_status_history`، `store_settlements(_orders)`, `courier_settlements(_orders)`.
- **الموديلات والكوست:** `profit_models` (`model_key`, `aliases_json`, `cost`)، `profit_model_audit`، `profit_ignored_phrases`، `schema_migrations`.
- **المخزون:** `inventory_balances`, `inventory_movements` (`ref`, `source_ref`)، `inventory_order_items` (الخصم الأصلي لكل طلب)، `inventory_order_tracking`.
- **المرتجعات:** `cargo_return_close_reports` (`details_json`)، `cargo_return_receipts`, `return_events`, `return_items`, `return_reconcile_batches/rows/scans`, `direct_returns`.
- **الأرباح والمصاريف:** `shipping_cohort_ad_spend` (الإعلانات)، `daily_commitment_items`, `daily_commitment_versions`.
- **تكاملات:** `cepoxy_*`, `litesale_*`, `corvex_export`, `order_audit_log` (أحداث `control.js`).

## 5. الواجهة (`public/`)
- `index.html` يحمّل السكربتات بالترتيب (كلها `defer` تقريبًا)، ولكل ملف `?v=` لكسر الكاش.
- **`app-v62.js` هو التطبيق الرئيسي** (العرض، الطلبات، الطباعة، مطابقة كشوف التوصيل `deliveryReconcileView`، الأرباح اليومية `dailyProfitsView`).
  - `state` ثابت على مستوى الملف وليس على `window`.
- ملفات `app-vNN-*.js` اللاحقة **رقع** تلف دوال `app-v62` (مثل `api`, `mapDeliveryCompanyStatus`) أو تضيف أقسامًا عبر `MutationObserver`.
  الترتيب مهم. أمثلة: `app-v73` أداء الموديلات، `app-v90`/`app-v93` حالات الرفض في المطابقة، `app-v112` روابط الطلبات في الأرباح،
  `app-v113` تحذير العميل، `app-v114` تدقيق المخزون، `app-v115` نوافذ الطلب/الكشف/التحقيق، `app-v116` الالتزام اليومي.
- `cargo-upload-v2.html` صفحة كشوف المرتجعات (iframe؛ رقم إصدارها داخل `app-v62.js`).
- ملفات `app.js`, `app-v32…v61.js` قديمة **غير محمّلة**.
- **صفحة الأرباح اليومية:** قسم علوي (كشوف حسب تاريخ الكشف: `#profitDate`, `#profitStore`, `#statementProfitResult`)، قسم سفلي (شحنات
  حسب يوم الخروج: `#cohortDate`, `#cohortStore`, `#shippingCohortResult`)، ومراجعة يدوية قديمة مطوية. التصميم الداكن (`pf-*`) من `c2212e8`.

## 6. التخزين المؤقت (الكاش)
- `index.html` بلا كاش (meta no-cache)؛ السكربتات تُخزّن حسب الرابط ← **تغيير ملف محمّل يتطلب تغيير `?v=`**.
- `scripts/check-project.mjs` يرفض (في CI) أي ملف `public/` محمّل تغيّر دون تغيير `?v=` الخاص به.

## 7. الاختبارات والـ CI
- `tests/*.test.mjs` على `node:test`. `tests/_d1.mjs` محاكي D1 على `node:sqlite` مع `schema.sql`.
- `scripts/check-project.mjs`: صحة صياغة JS، روابط `index.html`، كسر الكاش.
- `.github/workflows/ci.yml`: يشغّل الفحص وكل الاختبارات (مع PGlite) على كل push وPR.
- بيئة الوكلاء المحلية: محاكي خادم Pages في `/home/claude/harness` (غير موجود في المستودع) + Playwright/Chrome.

## 8. العلاقات بين الأقسام (ملخص)
طلب → طباعة (خصم مخزون، `first_printed_at` = يوم الخروج) → كشف شركة التوصيل (مطابقة → اعتماد: حالة/كاش/أجور، سجل حالة، كود الشحنة)
→ [تصحيح لاحق إن لزم] → الأرباح (السفلي حسب يوم الخروج، العلوي حسب تاريخ الكشف) − إعلانات − التزام يومي.
مرتجع فعلي → كشف مرتجعات/تأكيد استلام → إرجاع مخزون مرة واحدة → يُعتبر مرتجعًا مثبتًا في الأرباح السفلية وتحذير العميل.
