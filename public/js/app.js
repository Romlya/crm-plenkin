(function(){
  var urls = [];
  for (var i = 0; i < 10; i++) urls.push("/js/app.full." + i + ".js");
  Promise.all(urls.map(function(u){
    return fetch(u).then(function(r){ if(!r.ok) throw new Error(u + " " + r.status); return r.text(); });
  })).then(function(parts){
    (0,eval)(parts.join(""));
  }).catch(function(e){
    console.error(e);
    var el = document.getElementById("page-dashboard");
    if(el) el.innerHTML = "<div class=\"empty-hint\">Ошибка загрузки JS: " + (e.message||e) + "</div>";
  });
})();
