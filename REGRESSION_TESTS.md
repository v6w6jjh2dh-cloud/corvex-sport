# REGRESSION_TESTS.md — مشاكل سابقة واختبارات تمنع عودتها

التشغيل: `npm run verify` (أو `node --test --test-force-exit tests/*.test.mjs`). في CI تُشغّل كلها على كل push/PR.
لا تحذف اختبارًا ولا تغيّر نتيجته المتوقعة لجعله ينجح (`CLAUDE.md` §5).

| المعرّف | المشكلة | السبب | الاختبار |
|---|---|---|---|
| R-QTY-1 | قطعة واحدة تُحسب قطعتين، أو السعر/الهاتف يُقرأ كمية | أرقام بعد الموديل كانت تُقرأ كمية؛ تكرار النص بين `order_notes` و`raw_text` | `regression-guards` R-QTY-1؛ `cohort-cases` «#10375 … not doubled»، «prices are not quantities» |
| R-ALIAS-1 | عدم التعرف على الأسماء المختصرة («عدد 2 فرو» #10389، ستاتي، جاكيت نسائي، ايوبكسي) | الأسماء البديلة غير موجودة أو مختلفة بين الخادم والواجهة | `fur-alias.test`، `regression-guards` R-ALIAS-1، `partial-delivery` «stati spellings»، `cohort-cases` #10375/#10376 |
| R-COST-1 | طلبات مسلّمة بدون كوست (#10341، 24 طلب يوم 20/11)، جزئي غير محسوب (#10400) | فشل ترحيل الكتالوج أسقطه بالكامل؛ أحرف خفية؛ الجزئي بلا قطع | `cohort-cases` «a failing catalogue migration does not drop the catalogue»، #10400 |
| R-INV-1 | تكرار خصم المخزون عند إعادة الطباعة | — | `regression-guards` R-INV-1/2، `inventory-returns` «reprint does not deduct again» |
| R-INV-2 | عدم الخصم عندما يكون الرصيد صفرًا | لا يوجد سطر رصيد مسبق | `inventory-returns` «print deducts into negative stock even from zero»، R-INV-1/2 |
| R-INV-3 | تكرار إضافة المرتجع للمخزون | حساب الإضافة خارج المعاملة؛ تأكيد استلام ثم كشف | `inventory-returns` «guarded restock…»، «receipt first, statement later» |
| R-INV-4 | تغيير الحالة يدويًا يغيّر المخزون | | `inventory-returns` «changing status to returned by hand does not touch stock» |
| R-RET-1 | تكرار استلام طلب سبق استلامه (#10233 بجانب #10437) | الكشوف القديمة تجاهلت «مرتجع مسبقًا» | `cargo-preview` (5 اختبارات) |
| R-SET-1 | تكرار التسويات المالية | | `reconcile-settled` «re-sent … never counted twice»، `settlement-correction` «no double run» |
| R-SET-2 | «مسوّى سابقًا» بناءً على الهاتف وحده (#10349) | fallback الهاتف | `reconcile-settled` (8 اختبارات) |
| R-SET-3 | مطابقة طلب قديم بسبب تشابه الهاتف (0790909797 → #10424) | لا نافذة لتاريخ الشحن | `partial-delivery` «shipment date window…»، `reconcile-settled` «a new open order … is matched» |
| R-SET-4 | تصحيح تسوية سابقة يكرر الكاش أو المخزون | — | `settlement-correction` (6 اختبارات)، `profit-statements` «correction … never double» |
| R-PDF-1 | رقم الهاتف في الملاحظات يُقرأ شحنة إضافية (كشف 4292: 30 بدل 29) | كل رقم هاتف في الصفحة كان صف شحنة | `delivery-pdf` (6 اختبارات) |
| R-PDF-2 | عدم تطابق إجماليات الكشف مع المستخرج | لا مقارنة برأس الكشف | `delivery-pdf` «head mismatch blocks» |
| R-PROF-1 | أرباح الشحنات بتاريخ غير صحيح / مرتجع مسكّر يظهر «معلّق» | الربط بتاريخ الإغلاق؛ عدم قراءة كشوف المرتجعات | `cohort-cases` «a 20/11 shipment returned … closed on 24/11» |
| R-PROF-2 | خلط منطق القسمين في الأرباح اليومية | فلاتر مشتركة | `profit-statements` (4 اختبارات) |
| R-FEE-1 | الرفض مع الدفع صفر دائمًا / بدون دفع −2 دائمًا | قيم ثابتة | `refusal-cash` (3 اختبارات) |
| R-FEE-2 | «مرتجع» 2/1.75/0.25 يُقرأ تسليمًا جزئيًا، وتجمّد صفحة المطابقة | قاعدتان مختلفتان في `app-v90` و`app-v93` | `refusal-cash`؛ فحص متصفح (غير آلي في CI) |
| R-COMMIT-1 | مضاعفة خصم الالتزام اليومي عند تعدد الكشوف | — | `daily-commitment` «ads … once; days without statements»، «effective dates…» |
| R-STORE-1 | التأثير على المتاجر الأخرى | | `regression-guards` R-STORE-1، `return-risk` «other stores are not counted»، `daily-commitment` |
| R-CACHE-1 | تعديل ملف واجهة دون تغيير `?v=` (حدث في `ee8ba7e`) | الأجهزة تبقى على النسخة القديمة | `scripts/check-project.mjs` في CI (يكشف `ee8ba7e` فعليًا)، `regression-guards` R-CACHE-1 |
| R-RISK-1 | تحذير العميل المزعج | | `return-risk` (6 اختبارات) |
| R-INV-AUD-1 | رسالة «لا توجد فروقات» مضللة في التدقيق | | `inventory-returns` «never "all good" with open rows» |
| R-ENG-1 | محركات التعرف تعطي نتائج مختلفة لنفس الطلب (T-1) | أي فرق جديد بين المحركات أو انحراف المحرك المركزي عن محرك الأرباح | `product-engine` (6 اختبارات، 28 حالة مرجعية + لقطة الفروقات) |
| R-KNOW-1 | فقدان قاعدة أو اسم بديل أو طريقة كمية أثناء توحيد المحركات | أي اسم/مثال/قاعدة كمية لا يُقرأ كما وُثّق، أو اسم ينتقل لمنتج آخر | `product-knowledge` (7 اختبارات) + `product-engine` «knowledge view» |
| R-LANG-1 | المحلل العام يختلف عن المحرك النشط، أو يحتاج تعديل كود لمنتج/نشاط جديد | فرق مع `_inventory.js` على الحالات و1500 نص مولّد؛ فشل التكيف بالبيانات | `order-language` (6 اختبارات) + `product-engine` «learning loop» |
| R-PRIV-1 | إرسال بيانات شخصية أو تخزينها لدى مزود الذكاء الاصطناعي (T-12) | طلب OpenAI بدون `store:false` أو فيه هاتف/بريد/اسم وعنوان غير لازمين | `ai-privacy` (4 اختبارات، منها فحص كل ملف يستدعي OpenAI) |

## غير مغطى باختبارات آلية بعد
- تصميم وسلوك الواجهة على الموبايل (شريط الاعتماد، البطاقات، الالتزام) — فُحص يدويًا بـ Playwright/Chrome بمقاسات iPhone/Pixel، **ليس Safari حقيقي**.
- قواعد إدخال الطلبات في الواجهة (`app-v68`, `app-v72`, `app-v82`, `app-v103`, `app-v105`).
- مطابقة التعرف بين `app-v73`/`product-rules.js` والخادم لغير الفرو (T-1 في `BUSINESS_RULES.md`).
