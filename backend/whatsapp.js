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
    console.error('WhatsApp: WA_PHONE_NUMBER_ID or WA_ACCESS_TOKEN not set');
    return false;
  }

  // Normalize number: remove +, spaces, dashes; ensure starts with country code
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
    console.error(`WhatsApp send failed to ${number}:`, JSON.stringify(data));
    return false;
  }
  console.log(`WhatsApp sent to ${number}: message id ${data.messages?.[0]?.id}`);
  return true;
}

module.exports = { sendWhatsApp, buildMessage };
