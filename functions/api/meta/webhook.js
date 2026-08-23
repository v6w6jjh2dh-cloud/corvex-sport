// Meta Messenger webhook endpoint for Corvex.
// GET: Meta webhook verification handshake.
// POST: Receives Messenger webhook events. Message handling will be added next.

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (!env.META_VERIFY_TOKEN) {
    return new Response('META_VERIFY_TOKEN is not configured', { status: 500 });
  }

  if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
    return new Response(challenge || '', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response('Forbidden', { status: 403 });
}

export async function onRequestPost(context) {
  const { request } = context;

  // Acknowledge Meta quickly so it does not retry delivery.
  // We intentionally do not store or respond to messages yet; the AI/message
  // processing layer will be added after the page/token subscription is ready.
  try {
    const payload = await request.json();

    if (payload?.object !== 'page') {
      return new Response('EVENT_RECEIVED', { status: 200 });
    }

    return new Response('EVENT_RECEIVED', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
}
