const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
const API_URL = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

async function sendWhatsApp(toNumber, name, taskCount) {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    const msg = 'WA_PHONE_NUMBER_ID or WA_ACCESS_TOKEN not set in env';
    console.error('WhatsApp:', msg);
    return { ok: false, error: msg };
  }

  const number = toNumber.replace(/[\s\-\+]/g, '');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: number,
      type: 'template',
      template: {
        name: 'task_reminder',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: name },
            { type: 'text', text: String(taskCount) },
          ],
        }],
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg = data?.error?.message || JSON.stringify(data);
    console.error(`WhatsApp FAILED to ${number}:`, errMsg);
    return { ok: false, error: errMsg };
  }
  console.log(`WhatsApp sent to ${number}: message id ${data.messages?.[0]?.id}`);
  return { ok: true, messageId: data.messages?.[0]?.id };
}

module.exports = { sendWhatsApp };
