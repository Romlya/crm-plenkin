(function(){
  var n = 56;
  var urls = [];
  for (var i = 0; i < n; i++) urls.push('/js/app-b' + i + '.js');
  function loadScript(url){
    return new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = function(){ reject(new Error(url)); };
      document.head.appendChild(s);
    });
  }
  (async function(){
    try {
      for (var i = 0; i < urls.length; i++) await loadScript(urls[i]);
      var b64 = (window.__APP_B || []).join('');
      var bin = atob(b64);
      var code = bin;
      try { code = decodeURIComponent(escape(bin)); } catch(e) {}
      (0, eval)(code);
    } catch(e) {
      console.error(e);
      var el = document.getElementById('page-dashboard');
      if (el) el.innerHTML = '<div class="empty-hint">Ошибка JS: ' + (e.message||e) + '</div>';
    }
  })();
})();
