(function(){
  try {
    var b64 = (window.__APP_B||[]).join('');
    if (!b64) throw new Error('Нет данных приложения');
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var code = new TextDecoder('utf-8').decode(bytes);
    (0, eval)(code);
  } catch (e) {
    console.error(e);
    var el = document.getElementById('page-dashboard');
    if (el) el.innerHTML = '<div class="empty-hint">Ошибка JS: ' + (e && e.message ? e.message : e) + '</div>';
  }
})();
