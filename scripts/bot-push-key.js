// Llave compartida entre el paper trading de tus bots (GitHub Actions) y el servidor de avisos (Worker «vortex-push»).
// Se deriva de FIREBASE_SERVICE_ACCOUNT (que ya está en los secretos del repo): no hay que configurar nada nuevo.
// Uso: node scripts/bot-push-key.js  → imprime la llave (solo la usa deploy-push-worker.yml para guardarla como secreto del Worker)
const crypto = require('crypto');
function botPushKey(raw) {
  if (!raw) return '';
  let sa; try { sa = JSON.parse(raw); } catch { return ''; }
  if (!sa || !sa.private_key_id) return '';
  return crypto.createHash('sha256').update('vortex-bot-push:' + sa.private_key_id + ':' + (sa.client_email || '')).digest('hex');
}
module.exports = {botPushKey};
if (require.main === module) process.stdout.write(botPushKey(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.SA || ''));
