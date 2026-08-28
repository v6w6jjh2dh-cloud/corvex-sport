(()=>{
 const products=[
  {id:'jakar',name:'جاكار',cost:4.25,aliases:[/جاكار/i,/ترينغ/i,/تريننغ/i],offers:{1:[8],2:[15],3:[20]},deliveryIncluded:false},
  {id:'paris',name:'باريس',cost:2.5,aliases:[/باريس/i],offers:{3:[15]},deliveryIncluded:true},
  {id:'reebok',name:'ريبوك',cost:2.5,aliases:[/ريبوك/i,/reebok/i,/ري\s*bok/i],offers:{3:[15]},deliveryIncluded:true},
  {id:'m',name:'M',cost:3,aliases:[/(?:تيشرت|تيشيرت|تشرت|بلوز[هة]?|بلايز)\s*(?:حرف\s*)?(?:m6|m|م6|م|ام6|أم6|ام|أم)(?=\s|$)/i],offers:{1:[7],2:[12],3:[15]},deliveryIncluded:false},
  {id:'trico_plain',name:'تريكو سادة',cost:2.5,aliases:[/ساد[هة]\s*تريكو/i,/تريكو\s*ساد[هة]/i],offers:{1:[7],2:[12],3:[15]},deliveryIncluded:false},
  {id:'button',name:'زرار',cost:2.2,aliases:[/جيوب\s*زرار/i,/بنطلون\s*(?:ب?زرار|بزار)/i,/(?:^|\s)(?:زرار|بزار)(?:\s|$)/i],offers:{1:[7],2:[12],3:[15]},deliveryIncluded:false},
  {id:'zip_pockets',name:'جيوب سحاب',cost:2.3,aliases:[/جيوب\s*سحاب/i,/سحاب\s*جيوب/i],offers:{1:[7],2:[12],3:[15]},deliveryIncluded:false},
  {id:'regular_pockets',name:'جيوب عادي',cost:2.2,aliases:[/جيوب\s*عادي/i,/بنطلون\s*جيوب(?!\s*سحاب|\s*زرار)/i,/(?:^|\s)جيوب(?:\s|$)/i],offers:{1:[5],2:[9],3:[12]},deliveryIncluded:false},
  {id:'sport_zip',name:'رياضة سحاب',cost:2.7,aliases:[/رياض[هة]\s*سحاب/i,/سحاب\s*رياض[هة]/i,/بنطلون\s*سحاب/i],offers:{1:[5],2:[9]},deliveryIncluded:false},
  {id:'polo_plain',name:'بولو سادة',cost:2.8,aliases:[/ساد[هة]\s*بولو/i,/بولو\s*ساد[هة]/i],offers:{1:[5],2:[10]},deliveryIncluded:false},
  {id:'polo_knit',name:'بولو تريكو',cost:3.5,aliases:[/بولو\s*تريكو/i,/تريكو\s*بولو/i,/بولو\s*ترند/i],offers:{1:[5],2:[9],3:[15]},deliveryIncluded:false},
  {id:'turkish',name:'تركي',cost:2.7,aliases:[/بنطلون\s*تركي/i,/(?:^|\s)تركي(?:\s|$)/i],offers:{1:[5],2:[9],3:[15,16]},deliveryIncluded:false},
  {id:'cardigan',name:'كاردونيه',cost:3.5,aliases:[/كاردوني[هة]/i,/بجام[هة]\s*كاردوني[هة]/i],offers:{1:[8],2:[14],3:[18]},deliveryIncluded:false},
  {id:'cotton_tee',name:'تيشيرت قطن',cost:3.3,aliases:[/تيش(?:رت|يرت)\s*قطن/i,/قطن\s*سبور/i],offers:{1:[7],2:[12],3:[15]},deliveryIncluded:false},
  {id:'old_money',name:'أولد موني',cost:3.5,aliases:[/(?:اولد|أولد|ولد)\s*(?:موني|مني|ماني)/i,/old\s*money/i],offers:{1:[7],2:[12],3:[15]},deliveryIncluded:false}
 ];
 const normalize=s=>normalizeDigits(String(s||'')).replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
 const matches=(p,text)=>p.aliases.some(re=>re.test(normalize(text)));
 const findAll=text=>products.filter(p=>matches(p,text));
 const findOne=text=>{const x=findAll(text);return x.length===1?x[0]:null};
 window.CORVEX_PRODUCT_RULES={products,normalize,matches,findAll,findOne,version:'2026-08-28-v1'};
})();