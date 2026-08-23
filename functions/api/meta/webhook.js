// Meta Messenger webhook endpoint for Corvex.
// GET: Meta webhook verification handshake.
// POST: Receives Messenger messages, asks OpenAI for a concise sales reply,
// and sends it back through Messenger. Echoes are ignored to prevent loops.

const OPENAI_MODEL = 'gpt-4.1-mini';

const SALES_INSTRUCTIONS = `
أنت مساعد مبيعات لصفحة ملابس أردنية اسمها Corvex Sport.
اكتب باللهجة الأردنية الطبيعية وباختصار شديد، وكأنك موظف مبيعات محترف.
لا تقل إنك إنسان ولا تدّعي أنك موظف بشري. إذا سأل العميل مباشرة إن كنت نظاماً آلياً، كن صريحاً.
هدفك إغلاق الطلب بأقل عدد ممكن من الأسئلة. لا تحقق مع العميل ولا تكرر سؤالاً أجاب عنه.

قواعد العرض التجريبي الحالية:
- تريننغ الجاكار: 3 قطع بـ22 دينار، قطعتان بـ18 دينار، قطعة بـ9 دنانير.
- متوفر 3 ألوان.
- نطاق الوزن المتوفر من 50 إلى 110 كغم.
- إذا أعطى العميل وزنه، لا تسأله عن الطول. أخبره أننا نضبط له المقاس المناسب وانتقل للون/إكمال الطلب.
- إذا لم يعرف وزنه، اسأله عن مقاسه المعتاد فقط.
- لا تخترع أسماء ألوان إذا لم تكن مذكورة في المعلومات المتاحة.
- إذا قال العميل تمام/بدي/أريد الطلب بعد معرفة العرض، اطلب الاسم ورقم الهاتف والمنطقة/العنوان لتثبيت الطلب.
- لا تقل إن السعر شامل التوصيل إلا إذا كان ذلك مؤكداً في رسالة العميل أو المعلومات المتاحة.
- استخدم إيموجي واحداً كحد أقصى عند الحاجة.
- الرد عادة جملة واحدة أو جملتين قصيرتين.
`;

function getSecret(env, ...names) {
  for (const name of names) {
    if (env?.[name]) return env[name];
  }
  return null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const verifyToken = getSecret(env, 'META_VERIFY_TOKEN', 'META_VERIFY');

  if (!mode && !token && !challenge) {
    return Response.json({
      ok: true,
      service: 'corvex-meta-webhook',
      verifyTokenConfigured: Boolean(verifyToken),
      pageTokenConfigured: Boolean(getSecret(env, 'META_PAGE_ACCESS_TOKEN')),
      openAIConfigured: Boolean(getSecret(env, 'OPENAI_API_KEY')),
    });
  }

  if (!verifyToken) return new Response('META_VERIFY_TOKEN is not configured', { status: 500 });
  if (mode === 'subscribe' && token === verifyToken) {
    return new Response(challenge || '', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return new Response('Forbidden', { status: 403 });
}

async function makeReply(env, text) {
  const apiKey = getSecret(env, 'OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: SALES_INSTRUCTIONS,
      input: text,
      max_output_tokens: 120,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const output = data.output_text?.trim();
  if (output) return output;

  for (const item of data.output || []) {
    for (const part of item.content || []) {
      if (part.type === 'output_text' && part.text) return part.text.trim();
    }
  }
  throw new Error('No OpenAI output text');
}

async function sendMessengerReply(env, recipientId, text) {
  const pageToken = getSecret(env, 'META_PAGE_ACCESS_TOKEN');
  if (!pageToken) throw new Error('META_PAGE_ACCESS_TOKEN missing');

  const response = await fetch(`https://graph.facebook.com/v26.0/me/messages?access_token=${encodeURIComponent(pageToken)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text: text.slice(0, 2000) },
    }),
  });

  if (!response.ok) throw new Error(`Meta ${response.status}: ${await response.text()}`);
}

async function processPayload(env, payload) {
  if (payload?.object !== 'page') return;

  for (const entry of payload.entry || []) {
    for (const event of entry.messaging || []) {
      // Ignore messages sent by the page itself, preventing reply loops and
      // allowing human replies in Business Suite without AI echoing them.
      if (event.message?.is_echo) continue;

      const senderId = event.sender?.id;
      const text = event.message?.text?.trim();
      if (!senderId || !text) continue;

      const reply = await makeReply(env, text);
      await sendMessengerReply(env, senderId, reply);
    }
  }
}

export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;
  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Return 200 immediately; process the AI call and Messenger send in the background.
  waitUntil(processPayload(env, payload).catch((error) => console.error('Meta webhook processing failed', error)));
  return new Response('EVENT_RECEIVED', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
