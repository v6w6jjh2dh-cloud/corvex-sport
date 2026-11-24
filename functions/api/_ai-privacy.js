// Privacy for every call to an external AI service (T-12, owner decision 2026-11-24):
//  1) store:false on every OpenAI Responses request (the service does not keep the request/response).
//  2) Personal data that the task does not need is removed BEFORE the text leaves the system:
//     phone numbers, e-mails, links, and labelled name / address / location lines. Phones that a task needs
//     back (order parsing) are replaced by placeholders and restored locally in the result.
// Unlabelled names inside free text cannot be detected reliably; they are not guessed (documented limit).

const PHONE=/(?<![\d])(?:\+?962[\s-]?|00962[\s-]?|0)?7[789](?:[\s-]?\d){7}(?![\d])/g;
const ANY_LONG_NUMBER=/(?<![\d])(?:\+|00)?\d(?:[\s-]?\d){8,13}(?![\d])/g;
const EMAIL=/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const LINK=/(?:https?:\/\/|www\.)\S+/gi;
const LABEL_LINE=/^\s*(?:الاسم|اسم\s*(?:الزبون|الزبونه|العميل|العميله|المستلم|المستلمه)|المستلم|الزبون|العميل|العنوان|عنوان|المنطقه|المنطقة|الموقع|المكان|المحافظه|المحافظة|السكن|name|address|location)\s*[:：\-–]\s*\S.*$/gim;

const toLatinDigits=s=>String(s||'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

// purpose 'products': only goods/quantities/prices are needed → labelled personal lines removed.
// purpose 'order': the task extracts name/address (needed) → only phones (restored after), e-mails, links removed.
export function redactForAI(text,{purpose='products'}={}){
 let out=toLatinDigits(text);const phones=[];
 out=out.replace(EMAIL,'[بريد]').replace(LINK,'[رابط]');
 out=out.replace(PHONE,m=>{phones.push(m.replace(/[\s-]/g,''));return `[هاتف${phones.length}]`});
 out=out.replace(ANY_LONG_NUMBER,m=>{phones.push(m.replace(/[\s-]/g,''));return `[هاتف${phones.length}]`});
 if(purpose==='products')out=out.replace(LABEL_LINE,'[بيانات شخصية محذوفة]');
 return {text:out,phones,removed:{phones:phones.length}};
}

// Put the original phones back into every string of the AI result (order parsing only).
export function restorePlaceholders(value,phones=[]){
 if(typeof value==='string')return value.replace(/\[هاتف(\d+)\]/g,(m,i)=>phones[Number(i)-1]||m);
 if(Array.isArray(value))return value.map(v=>restorePlaceholders(v,phones));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,restorePlaceholders(v,phones)]));
 return value;
}

// Every OpenAI Responses body goes through this: never stored by the provider.
export const privateAIRequest=body=>({...body,store:false});
