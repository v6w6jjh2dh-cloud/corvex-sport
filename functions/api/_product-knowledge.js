// CORVEX accumulated product knowledge — ONE registry of every product name, spelling, abbreviation,
// quantity convention and exception that the older engines learned from real orders.
// Sources (all still active and NOT modified): functions/api/_inventory.js, _partial-delivery.js,
// profit-shipping-cohorts.js, [[path]].js (/ai-parse-order prompt), public/product-rules.js,
// public/app-v62.js (PRODUCT_COST_RULES), app-v68-order-rules.js, app-v73-model-performance.js,
// app-v84-sahab-model-rule.js, app-v86-model-context-guard.js, app-v109-cotton-sport-alias.js.
// Used ONLY by the central engine (_product-engine.js, shadow mode). Pure data + pure helpers.
// Every entry carries its source and examples; tests/product-knowledge.test.mjs proves each example
// (and each string alias of the older engines) is still recognised. Never delete an entry: disable
// it with status:'disabled' and a note, after owner approval.

export const KNOWLEDGE_VERSION='knowledge-2026-11-24-v1';

// status: 'active' (used by the central engine) | 'review' (used, but broad — may match non-product
// words; kept because an older engine already uses it; listed for the owner to confirm).
// cost: only for products with no approved / fixed-list / catalogue cost (taken from product-rules.js).
export const PRODUCT_KNOWLEDGE=[
 {id:'K-FUR',product:'جاكيت فرو',sources:['_inventory.js FUR_ALIASES','product-rules.js fur_jacket','app-v73'],
  aliases:['جاكيت فرو','جكيت فرو','جاكت فرو','جاكيت الفرو','جكيت الفرو','جاكت الفرو','فرو جاكيت','فرو جكيت','جاكيت فروه','جكيت فروه','جاكت فروه','جاكيت الفروه','جكيت الفروه'],
  examples:[['عدد 2 فرو',2],['جكيت الفروه اسود',1],['فرو جكيت',1],['جاكيت فرو اسود وبني',2]]},
 {id:'K-CASUAL',product:'جاكيت جوخ كاجوال',sources:['profit-shipping-cohorts.js','app-v73'],
  aliases:['جاكيت جوخ كاجوال','جكيت جوخ كاجوال','جاكيت جوخ كاجول','جكيت جوخ كاجول','جوخ كاجوال','جاكيت الجوخ الكاجوال'],
  examples:[['جكيت جوخ كاجول اسود',1],['جاكيت جوخ كاجوال عدد 2',2]]},
 {id:'K-SCARFO',product:'جاكيت جوخ سكايفو',sources:['_partial-delivery.js STATI_ALIASES + women alias','profit-shipping-cohorts.js','app-v73'],
  aliases:['جاكيت جوخ سكايفو','جكيت جوخ سكايفو','جاكيت جوخ سكارفو','جكيت جوخ سكارفو','جوخ سكايفو','جوخ سكارفو','جاكيت سكايفو','جكيت سكايفو','جاكيت سكارفو','جكيت سكارفو','جاكيت نسائي','جكيت نسائي','جاكيت نساءي','جكيت نساءي','جوخ شتائي'],
  examples:[['جكيت سكارفو كحلي',1],['جاكيت جوخ ستأتي',1],['جوخ شتائي',1],['جاكيت نسائي اسود',1]]},
 {id:'K-FILLER',product:'مالئ الفراغات',sources:['_partial-delivery.js FILLER_ALIASES','profit-shipping-cohorts.js','app-v73 (spelling variants)'],
  aliases:['مالئ الفراغات','مالئ فراغات','مالي الفراغات','مالى الفراغات','ملي الفراغات','مليء الفراغات','مالاء الفراغات','ملاء الفراغات','ملا الفراغات','ملئ الفراغات','مالء الفراغات','مالئ القراغات','مالي القراغات','مالي فراغات','ملئ فراغات',
   'ايبوكسي','سي ايبوكسي','سى ايبوكسي','c ايبوكسي','ايوبكسي','سي ايوبكسي','epoxy','c epoxy'],
  examples:[['مالاء الفراغات عدد 3',3],['ملئ فراغات',1],['c ايبوكسي',1]]},
 {id:'K-SAHAB-POCKETS',product:'بنطلون جيوب سحاب',sources:['profit-shipping-cohorts.js','app-v62 PRODUCT_COST_RULES','product-rules.js zip_pockets','app-v84'],
  aliases:['بنطلون جيوب سحاب','بنطلون بجيوب سحاب','بنطلون جيب سحاب','جيوب سحاب','جيب سحاب','سحاب جيوب','سحاب جيب'],
  examples:[['بنطلون بجيوب سحاب كحلي',1],['سحاب جيوب عدد 2',2]]},
 {id:'K-SAHAB-SPORT',product:'بنطلون رياضة سحاب',sources:['profit-shipping-cohorts.js','app-v62','product-rules.js sport_zip','app-v84'],
  aliases:['بنطلون رياضة سحاب','بنطلون رياضه سحاب','بنطلون رياضي سحاب','رياضة سحاب','رياضه سحاب','سحاب رياضه','بنطلون سحاب'],
  examples:[['بنطلون رياضي سحاب',1],['بنطلون سحاب اسود',1]]},
 {id:'K-TURKISH',product:'بنطلون تركي',sources:['profit-shipping-cohorts.js','app-v62','product-rules.js turkish','app-v73','ai-parse-order prompt'],
  aliases:['بنطلون تركي','قطعه تركي'],review:['تركي'],
  examples:[['بنطلون تركي عدد 2',2],['تركي اسود',1]]},
 {id:'K-BUTTON',product:'بنطلون زرار',sources:['profit-shipping-cohorts.js','app-v62','product-rules.js button','app-v73'],
  aliases:['بنطلون زرار','بنطلون بزرار','بنطلون بزار','بنطلون الزرار','بنطلون الازرار','بنطلون زر','جيوب زرار','زرار','بزرار','بزار','الزرار','الازرار'],
  examples:[['بنطلون بزار',1],['الازرار عدد 2',2]]},
 {id:'K-POCKETS',product:'بنطلون جيوب',sources:['profit-shipping-cohorts.js','app-v62','product-rules.js regular_pockets','app-v73'],
  aliases:['بنطلون جيوب','بنطلون بجيوب','بنطلون جيب','جيوب عادي','جيب عادي'],review:['جيوب','جيب'],
  examples:[['بنطلون بجيوب',1],['جيوب عادى',1]]},
 {id:'K-TRICO-PLAIN',product:'تيشيرت سادة تريكو',sources:['profit-shipping-cohorts.js','app-v62','product-rules.js trico_plain','app-v73'],
  aliases:['تيشيرت سادة تريكو','تيشيرت ساده تريكو','تيشرت ساده تريكو','بلوزه ساده تريكو','ساده تريكو','تريكو ساده'],
  examples:[['تريكو ساده',1],['تيشرت ساده تريكو عدد 3',3]]},
 {id:'K-JAKAR',product:'بجامة جاكار',sources:['profit-shipping-cohorts.js','app-v62','product-rules.js jakar','app-v73'],
  aliases:['بجامة جاكار','بجامه جاكار','طقم جاكار','جاكار','ترينغ','تريننغ'],
  examples:[['طقم جاكار',1],['تريننغ',1]]},
 {id:'K-POLO',product:'تيشيرت بولو',sources:['profit-shipping-cohorts.js','app-v62','product-rules.js polo_knit','app-v73 (بولو تريكو)','ai-parse-order prompt'],
  aliases:['تيشيرت بولو','تيشرت بولو','تيشيرت بولو تريكو','تيشرت بولو تريكو','بلوزه بولو','بولو تريكو','تريكو بولو','بولو ترند','بولو خريفي','بولو'],
  examples:[['تريكو بولو',1],['بولو خريفي',1]]},
 {id:'K-POLO-PLAIN',product:'بولو سادة',cost:2.8,sources:['product-rules.js polo_plain','app-v73 (بولو صيفي)'],
  aliases:['بولو ساده','ساده بولو','بولو صيفي'],
  examples:[['بولو ساده',1],['بولو صيفي عدد 2',2]]},
 {id:'K-POLO-EMBROIDERY',product:'بولو تريكو تطريز',sources:['app-v73'],
  aliases:['بولو تريكو تطريز','تريكو تطريز','تطريز تريكو'],
  examples:[['بولو تريكو تطريز',1]]},
 {id:'K-PRADA',product:'تيشيرت برادا',sources:['product-rules.js prada_tee','app-v73','profit-shipping-cohorts.js'],
  aliases:['تيشيرت برادا','تيشرت برادا','بلوزه برادا','بلوز برادا','برادا'],
  examples:[['بلوزه برادا',1]]},
 {id:'K-TREND-JACKET',product:'جاكيت ترند',sources:['product-rules.js trend_jacket','app-v73','profit-shipping-cohorts.js'],
  aliases:['جاكيت ترند','جكيت ترند','ترند جاكيت'],
  examples:[['جكيت ترند',1]]},
 {id:'K-TREND-TEE',product:'تيشيرت ترند',sources:['app-v73 (ترند)'],
  aliases:['تيشيرت ترند','تيشرت ترند','بلوزه ترند'],review:['ترند'],
  examples:[['تيشرت ترند',1]]},
 {id:'K-KOM',product:'بلوزة سادة كوم',sources:['product-rules.js plain_kom','app-v73','profit-shipping-cohorts.js'],
  aliases:['بلوزه ساده كوم','بلوز ساده كوم','ساده كوم'],examples:[['ساده كوم',1]]},
 {id:'K-N',product:'تيشيرت N',sources:['product-rules.js n_tee','app-v73','profit-shipping-cohorts.js'],
  aliases:['تيشيرت n','تيشرت n','تيشيرت حرف n','تيشرت حرف n','بلوزه n','بلوزه حرف n','حرف n'],examples:[['تيشرت حرف n',1]]},
 {id:'K-NIKE',product:'جاكيت نايك',sources:['product-rules.js nike_jacket','app-v73','profit-shipping-cohorts.js'],
  aliases:['جاكيت نايك','جكيت نايك','نايك جاكيت'],examples:[['نايك جاكيت',1]]},
 {id:'K-WOOL',product:'بلوز صوف',sources:['product-rules.js wool_top','app-v73','profit-shipping-cohorts.js'],
  aliases:['بلوز صوف','بلوزه صوف','صوف بلوز','صوف بلوزه'],examples:[['صوف بلوزه',1]]},
 {id:'K-COTTON-TEE',product:'تيشيرت قطن',cost:3.3,sources:['product-rules.js cotton_tee','app-v73 (قطن سبور)'],
  aliases:['تيشيرت قطن','تيشرت قطن','بلوزه قطن','قطن سبور','قطن سبورت','قطن ساده'],review:['قطن'],
  examples:[['قطن سبورت',1],['تيشرت قطن عدد 2',2]]},
 {id:'K-COTTON-SPORT',product:'بنطلون رياضة قطن',sources:['app-v73','app-v109-cotton-sport-alias.js'],
  aliases:['بنطلون رياضة قطن','بنطلون رياضه قطن','بنطال رياضه قطن','بناطيل رياضه قطن','رياضه قطن','قطن رياضه','قطن رياضي','بنطلون قطن رياضه'],
  examples:[['بنطلون رياضه قطن',1],['قطن رياضي',1]]},
 {id:'K-CARDIGAN',product:'كاردونيه',cost:3.5,sources:['product-rules.js cardigan','app-v73'],
  aliases:['كاردونيه','بجامه كاردونيه','طقم كاردونيه'],examples:[['طقم كاردونيه',1]]},
 {id:'K-REEBOK',product:'ريبوك',cost:2.5,sources:['product-rules.js reebok','app-v73'],
  aliases:['ريبوك','reebok','ري bok'],examples:[['ريبوك عدد 3',3]]},
 {id:'K-PARIS',product:'باريس',cost:2.5,sources:['product-rules.js paris','app-v73'],
  aliases:[],review:['باريس'],examples:[['باريس',1]]},
 {id:'K-TAKYEEF',product:'بنطلون تكيف',cost:3.5,sources:['product-rules.js takyeef','app-v73'],
  aliases:['بنطلون تكيف','بنطلون تكييف','بنطلون يكتف','بنطلون تكف','تكيف','تكييف','يكتف'],review:['تكف'],
  examples:[['بنطلون تكييف',1],['يكتف',1]]},
 {id:'K-M',product:'M',cost:3,sources:['product-rules.js m','app-v86 (M only next to a product word)'],
  aliases:['تيشيرت m','تيشرت m','تشرت m','بلوزه m','بلايز m','تيشيرت m6','تيشرت m6','بلوزه m6','تيشيرت حرف m','تيشرت حرف m','بلوزه حرف m','تيشيرت م','تيشرت م','بلوزه م','تيشيرت ام','تيشرت ام','بلوزه ام','تيشيرت م6','تيشيرت ام6'],
  examples:[['تيشرت m',1],['بلوزه حرف m عدد 2',2]]},
 {id:'K-HERMES',product:'هيرمز / حصان',sources:['app-v73'],
  aliases:['هيرمز','هيرميز','تيشيرت حصان','تيشرت حصان','بلوزه حصان','تيشيرت الحصان','بلوزه الحصان','تيشيرت اتش','تيشرت اتش','بلوزه اتش','تيشيرت h','بلوزه h'],review:['حصان','الحصان'],
  examples:[['بلوزه حصان',1],['هيرمز',1]]},
 {id:'K-OLDMONEY',product:'Old Money',cost:3.5,sources:['product-rules.js old_money','app-v73'],
  aliases:['اولد ماني','اولد موني','اولد مني','اولد ماني','بلوزه اولد ماني','بلوزه اولد موني','بلوزه اولد مني','تيشيرت اولد ماني','old money'],
  examples:[['بلوزه اولد موني',1],['أولد مني',1]]},
 {id:'K-LYCRA',product:'بلوزة ليكرا',cost:2.5,sources:['app-v68-order-rules.js','app-v73'],
  aliases:['بلوزه ليكرا','بلوز ليكرا','تيشيرت ليكرا','تيشرت ليكرا','ليكرا'],
  examples:[['بلوزه ليكرا',1],['بلوزه ليكرا العرض',3],['بلوزه ليكرا لونين',2]]}
];

// Names used by older engines for the SAME product (matched by identical approved cost and aliases).
// Lets catalogue rows created from product-rules.js ids/names share one stable product.
export const NAME_SYNONYMS={
 'جاكار':'بجامة جاكار','بجامة جاكار / ترينغ':'بجامة جاكار','زرار':'بنطلون زرار','جيوب سحاب':'بنطلون جيوب سحاب',
 'جيوب عادي':'بنطلون جيوب','رياضة سحاب':'بنطلون رياضة سحاب','بولو تريكو':'تيشيرت بولو','تركي':'بنطلون تركي',
 'تريكو سادة':'تيشيرت سادة تريكو','سادة تريكو':'تيشيرت سادة تريكو','قطن سبور':'تيشيرت قطن','تكيف':'بنطلون تكيف',
 'أولد مني':'Old Money','ترند':'تيشيرت ترند','بولو صيفي':'بولو سادة'
};

// Quantity conventions taken from the older engines that the shared text matcher (_inventory.js)
// does not read inside a product line. Applied by the central engine ONLY to a single-product order
// whose matcher quantity is 1 (never to multi-product orders, never adding sources together).
export const QUANTITY_RULES=[
 {id:'Q-TYPO-ADAD',source:'app-v73 explicitQty',description:'«الغدد» خطأ كتابة لـ«العدد»',examples:[['جاكيت جوخ كاجوال الغدد 2',2]]},
 {id:'Q-TWO-WORDS',source:'app-v73 qtyIn, app-v62, ai-parse-order',description:'«قطعتين/لونين/حبتين/ثنتين» = 2 في نفس سطر المنتج',examples:[['جاكيت جوخ كاجوال لونين',2],['بنطلون تركي قطعتين',2]]},
 {id:'Q-THREE-COLOURS',source:'ai-parse-order prompt, app-v73, app-v68',description:'«ثلاث ألوان / ثلاث الألوان» مع صنف واحد = 3',examples:[['جاكيت جوخ كاجوال ثلاث الوان',3],['بنطلون تركي ثلاث الألوان',3]]},
 {id:'Q-WORD-NUMBER',source:'_inventory.js WORD_NUMBERS (سطر مستقل) → أيضًا داخل سطر المنتج',description:'رقم بالكلمات قبل «قطع/حبات/ألوان»',examples:[['بنطلون تركي اربع قطع',4]]},
 {id:'Q-LEADING-NUMBER',source:'product-rules.js explicitQuantity, app-v62 quantityFromProductSegment',description:'رقم صغير (1–20) في بداية سطر المنتج = الكمية، ما لم يكن سعرًا',examples:[['2 جاكيت جوخ كاجوال',2],['3 بنطلون تركي اسود',3]]},
 {id:'Q-LYCRA-OFFER',source:'app-v68-order-rules.js',description:'«بلوزة ليكرا … العرض» = 3 قطع',examples:[['بلوزه ليكرا العرض',3]]}
];

// Existing protections, implemented in code (not data). Listed so they are never lost; each has a test.
export const GUARD_RULES=[
 {id:'G-NOTES-RAW',where:'_product-engine.js resolveOrderItems',test:'product-engine «notes-raw-dup»',description:'الملاحظات ونص الطلب مصدران منفصلان لا يُجمعان أبدًا؛ يُؤخذ أول مصدر فيه منتج'},
 {id:'G-QTY-OTHER-FIELD',where:'_product-engine.js resolveOrderItems',test:'product-engine «10375»',description:'الكمية المكتوبة في الحقل الآخر («عدد2») تُستخدم لطلب منتج واحد فقط'},
 {id:'G-BARE-JOKH',where:'_product-engine.js BARE_JOKH',test:'product-engine «jokh-2»',description:'«جاكيت جوخ» بدون نوع = سكايفو لقطعة واحدة فقط؛ أكثر من قطعة = غير معروف'},
 {id:'G-OVERLAP',where:'_inventory.js matchesInLine',test:'product-engine «fur+casual»',description:'التطابق الأطول يفوز ولا يُحسب نفس النص لمنتجين'},
 {id:'G-MERGE',where:'_product-engine.js mergeItems',test:'product-engine «stati-2»',description:'سطر واحد لكل منتج موحد (ستاتي ضمن سكايفو)، الكميات تُجمع بلا تكرار'},
 {id:'G-FUR-LINING',where:'_inventory.js FUR_LINING_BEFORE',test:'product-engine «fur-lining»',description:'«مبطن فرو/بطانة فرو/ياقة فرو/مع فرو» وصف لموديل آخر وليس جاكيت فرو'},
 {id:'G-PRICE-NOT-QTY',where:'_inventory.js quantityFor',test:'product-engine «price-not-qty»',description:'رقم بعد الموديل متبوع بـ«دينار/شامل/توصيل» سعر وليس كمية'},
 {id:'G-RETURN-LINE',where:'_inventory.js saleLine',test:'product-engine «return-line»',description:'ما بعد «استرجاع/ارجاع/استبدال/بدل» في السطر ليس بيعًا'},
 {id:'G-SAHAB-PLACE',where:'بدون اسم «سحاب» منفرد في أي قائمة (app-v84)',test:'product-engine «sahab-address»',description:'«سحاب» وحدها منطقة وليست موديلًا'},
 {id:'G-M-CONTEXT',where:'K-M بدون اسم منفرد (app-v86)',test:'product-knowledge «M guard»',description:'حرف M/ام لا يُحتسب إلا بجانب كلمة منتج («ام حمزة» ليس موديلًا)'},
 {id:'G-NO-NAME-ADDRESS',where:'resolveOrderItems يقرأ order_notes وraw_text فقط (app-v86)',test:'product-knowledge «address fields»',description:'اسم المستلم والعنوان والمتجر ليست مصدرًا للموديل'},
 {id:'G-PRINT-ONCE',where:'_inventory.js deductOnFirstPrint',test:'inventory tests',description:'الخصم من المخزون مرة واحدة عند أول طباعة فقط'},
 {id:'G-RETURN-ONCE',where:'_inventory.js restockStatements',test:'inventory-returns tests',description:'إرجاع القطعة للمخزون مرة واحدة ضمن حد المخصوم'}
];

const WORD_NUMBERS={واحد:1,واحده:1,اثنين:2,اتنين:2,ثنتين:2,ثلاث:3,ثلاثه:3,اربع:4,اربعه:4,خمس:5,خمسه:5,ست:6,سته:6,سبع:7,سبعه:7,ثمان:8,ثمانيه:8,تسع:9,تسعه:9,عشر:10,عشره:10};
const WORDS=Object.keys(WORD_NUMBERS).join('|');

// Text is already normalised (normalizeArabic). Phones, weights, sizes and prices are removed first.
export function stripMeta(text){
 return String(text||'')
  .replace(/(?:^|\s)0?7\d{8}(?=\s|$)/g,' ')
  .replace(/(?:وزن\S*|الوزن|طول\S*|الطول|قياس|مقاس|السعر|سعر)\s*[:=\-]?\s*\d+(?:[.,]\d+)?/g,' ')
  .replace(/\d+(?:[.,]\d+)?\s*(?:د(?:ينار)?|دنانير|jd|jod)?\s*(?:شامل|مع|و)\s*(?:ال)?توصيل/g,' ')
  .replace(/\d+(?:[.,]\d+)?\s*(?:دينار|دنانير|jd|jod)(?=\s|$)/g,' ')
  .replace(/\s+/g,' ').trim();
}

// Quantity written with a convention the shared matcher does not read on the product line.
// Returns {quantity, rule} or null. productLine = the normalised line that contains the product.
export function knowledgeQuantity(productLine,{productName=''}={}){
 const line=stripMeta(productLine);
 let m=line.match(/(?:^|\s)الغدد\s*[:=\-]?\s*(\d{1,2})(?!\d)/);
 if(m&&+m[1]>=1&&+m[1]<=50)return{quantity:+m[1],rule:'Q-TYPO-ADAD'};
 if(/(?:^|\s)(?:ثلاث|ثلاثه)\s*(?:ال)?(?:الوان|الالوان)(?=\s|$)/.test(line))return{quantity:3,rule:'Q-THREE-COLOURS'};
 if(/ليكرا/.test(productName+' '+line)&&/(?:^|\s)العرض(?=\s|$)/.test(line))return{quantity:3,rule:'Q-LYCRA-OFFER'};
 if(/(?:^|\s)(?:قطعتين|قطعتان|لونين|حبتين|ثنتين)(?=\s|$)/.test(line))return{quantity:2,rule:'Q-TWO-WORDS'};
 m=line.match(new RegExp('(?:^|\\s)('+WORDS+')\\s*(?:قطعه|قطع|حبه|حبات|لون|الوان)(?=\\s|$)'));
 if(m&&WORD_NUMBERS[m[1]]>1)return{quantity:WORD_NUMBERS[m[1]],rule:'Q-WORD-NUMBER'};
 m=line.match(/^(\d{1,2})\s+(?=\S)(?!(?:دينار|دنانير|د|jd|شامل|مع|توصيل)(?:\s|$))/);
 if(m&&+m[1]>=2&&+m[1]<=20)return{quantity:+m[1],rule:'Q-LEADING-NUMBER'};
 return null;
}
