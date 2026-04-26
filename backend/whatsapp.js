const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
const API_URL = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function effectiveTarget(task) {
  return task.revised_date_5 || task.revised_date_4 || task.revised_date_3 ||
    task.revised_date_2 || task.revised_date_1 || task.initial_target_date;
}

function buildMessage(userName, tasks) {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const lines = [
    `*Task Reminder - Highflow Industries*`,
    `Hi ${userName}! Aaj ke pending tasks (${today}):`,
    ``,
  ];
  tasks.forEach((t, i) => {
    const target = effectiveTarget(t);
    const overdue = target && new Date(target) < new Date() ? ' ⚠️ Overdue' : '';
    lines.push(`${i + 1}. ${t.task_description}`);
    lines.push(`   📅 Target: ${formatDate(target)}${overdue} | 📌 ${t.section || '-'}`);
    lines.push('');
  });
  lines.push(`Total: *${tasks.length}* pending task(s)`);
  return lines.join('\n');
}

async function sendWhatsApp(toNumber, text) {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    const msg = 'WA_PHONE_NUMBER_ID or WA_ACCESS_TOKEN not set in env';
    console.error('WhatsApp:', msg);
    return { ok: false, error: msg };
  }

  const number = toNumber.replace(/[\s\-\+]/g, '');

  const body = {
    messaging_product: 'whatsapp',
    to: number,
    type: 'text',
    text: { body: text },
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg = data?.error?.message || JSON.stringify(data);
    const errCode = data?.error?.code;
    console.error(`WhatsApp FAILED to ${number} [code ${errCode}]:`, errMsg);
    return { ok: false, error: errMsg, code: errCode, raw: data };
  }
  console.log(`WhatsApp sent to ${number}: message id ${data.messages?.[0]?.id}`);
  return { ok: true, messageId: data.messages?.[0]?.id };
}

module.exports = { sendWhatsApp, buildMessage };
