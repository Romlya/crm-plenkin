(function(){
  try {
    var parts = window.__SRC_PARTS || [];
    var code = parts.join('');
    if (!code) throw new Error('Нет кода приложения');
    (0, eval)(code);
  } catch (e) {
    console.error(e);
    var el = document.getElementById('page-dashboard');
    if (el) el.innerHTML = '<div class="empty-hint">Ошибка JS: ' + (e && e.message ? e.message : e) + '</div>';
  }
})();
