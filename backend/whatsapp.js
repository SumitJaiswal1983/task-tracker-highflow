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

async function post(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

async function sendWhatsAppTemplate(toNumber, personName, taskCount) {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return { ok: false, error: 'WA env vars not set' };
  const number = toNumber.replace(/[\s\-\+]/g, '');
  const { ok, data } = await post({
    messaging_product: 'whatsapp',
    to: number,
    type: 'template',
    template: {
      name: 'task_reminder',
      language: { code: 'en' },
      components: [{ type: 'body', parameters: [
        { type: 'text', text: personName },
        { type: 'text', text: String(taskCount) },
      ]}],
    },
  });
  if (!ok) {
    const errMsg = data?.error?.message || JSON.stringify(data);
    console.error(`WhatsApp template FAILED to ${number}:`, errMsg);
    return { ok: false, error: errMsg };
  }
  console.log(`WhatsApp template sent to ${number}`);
  return { ok: true };
}

async function sendWhatsApp(toNumber, text) {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return { ok: false, error: 'WA env vars not set' };
  const number = toNumber.replace(/[\s\-\+]/g, '');
  const { ok, data } = await post({
    messaging_product: 'whatsapp',
    to: number,
    type: 'text',
    text: { body: text },
  });
  if (!ok) {
    const errMsg = data?.error?.message || JSON.stringify(data);
    console.error(`WhatsApp text FAILED to ${number}:`, errMsg);
    return { ok: false, error: errMsg };
  }
  console.log(`WhatsApp text sent to ${number}: ${data.messages?.[0]?.id}`);
  return { ok: true, messageId: data.messages?.[0]?.id };
}

module.exports = { sendWhatsApp, sendWhatsAppTemplate, buildMessage };
