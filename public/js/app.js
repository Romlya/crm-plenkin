(async function(){
  try {
    const b64 = (window.__APP_C||[]).join('');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof DecompressionStream === 'undefined') throw new Error('Обновите браузер');
    const ds = new DecompressionStream('gzip');
    const stream = new Response(bytes).body.pipeThrough(ds);
    const code = await new Response(stream).text();
    (0, eval)(code);
  } catch (e) {
    console.error(e);
    const el = document.getElementById('page-dashboard');
    if (el) el.innerHTML = '<div class="empty-hint">Ошибка JS: ' + e.message + '</div>';
  }
})();
