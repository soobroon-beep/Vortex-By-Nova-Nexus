/* NOVA BOT LAB · avisos a tu Discord cuando un bot encendido compra, vende o cierra (lo usan la app y el servidor; nunca avisa dos veces lo mismo). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.CCTBotNotify = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const fmt = x => { const a = Math.abs(x); return (+x).toLocaleString('es', {maximumFractionDigits: a >= 1000 ? 0 : a >= 1 ? 2 : 6}); };
  /* Devuelve los eventos nuevos de la sesión y marca hasta dónde se avisó. La primera vez solo marca (no manda el historial). */
  function pending(sess) {
    const out = []; if (!sess || !Array.isArray(sess.ledger)) return out;
    if (sess.nN == null) { sess.nN = sess.ledger.length; sess.oN = sess.open ? sess.open.entryT : null; return out; }
    for (const t of sess.ledger.slice(sess.nN)) out.push({kind: 'close', t}); sess.nN = sess.ledger.length;
    const o = sess.open; if (o && o.entryT !== sess.oN) { out.push({kind: 'open', t: o}); sess.oN = o.entryT; } else if (!o) sess.oN = null;
    return out;
  }
  function embed(bot, sess, e) {
    const t = e.t, long = t.side === 'long', sym = sess.spec.symbol, name = bot.name || 'Bot';
    if (e.kind === 'open') return {title: `${long ? '🟢 COMPRA' : '🔴 VENTA'} · ${sym} · ${sess.spec.interval}`, description: `**${name}** abrió ${long ? 'un largo' : 'un corto'} a **${fmt(t.entry)}**${t.sl != null && isFinite(t.sl) ? `\nStop: ${fmt(t.sl)}` : ''}${t.tp != null && isFinite(t.tp) ? ` · Objetivo: ${fmt(t.tp)}` : ''}${t.reasonIn ? `\n${String(t.reasonIn).slice(0, 200)}` : ''}`, color: long ? 0x20bf9f : 0xf06b79, footer: {text: 'Nova Bot Lab · simulación (sin dinero real)'}, timestamp: new Date(t.entryT).toISOString()};
    const p = (t.exit / t.entry - 1) * 100 * (long ? 1 : -1), win = t.net >= 0;
    return {title: `${win ? '✅' : '❌'} CIERRE · ${sym} · ${win ? '+' : ''}${p.toFixed(2)} %`, description: `**${name}** cerró ${long ? 'el largo' : 'el corto'}: ${fmt(t.entry)} → **${fmt(t.exit)}** · neto ${win ? '+' : '−'}$${fmt(Math.abs(t.net))}${t.why ? `\n${String(t.why).slice(0, 160)}` : ''}`, color: win ? 0x20bf9f : 0xf06b79, footer: {text: 'Nova Bot Lab · simulación (sin dinero real)'}, timestamp: new Date(t.exitT || Date.now()).toISOString()};
  }
  return {pending, embed};
});
