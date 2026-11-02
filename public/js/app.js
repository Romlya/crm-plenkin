(function () {
  function showErr(e) {
    console.error(e);
    var el = document.getElementById('page-dashboard');
    if (el) {
      el.innerHTML = '<div class="empty-hint">Ошибка JS: ' + (e && e.message ? e.message : e) + '</div>';
    }
  }
  fetch('/js/app.bundle.js?v=3')
    .then(function (r) {
      if (!r.ok) throw new Error('app.bundle.js ' + r.status);
      return r.text();
    })
    .then(function (code) {
      if (!code || code.length < 1000) throw new Error('bundle too small: ' + (code && code.length));
      (0, eval)(code);
    })
    .catch(showErr);
})();
