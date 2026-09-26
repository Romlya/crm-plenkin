(async () => {
  try {
    const r = await fetch('/js/app-body.js');
    const code = await r.text();
    (0, eval)(code);
  } catch (e) {
    console.error(e);
    const el = document.getElementById('page-dashboard');
    if (el) el.innerHTML = '<div class="empty-hint">Ошибка загрузки: ' + e.message + '</div>';
  }
})();
