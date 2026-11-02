(function(){
  var urls = ["/js/app.part0.js","/js/app.part1.js","/js/app.part2.js"];
  Promise.all(urls.map(function(u){
    return fetch(u).then(function(r){ if(!r.ok) throw new Error(u+" "+r.status); return r.text(); });
  })).then(function(parts){
    (0,eval)(parts.join(""));
  }).catch(function(e){
    console.error(e);
    var el = document.getElementById("page-dashboard");
    if(el) el.innerHTML = "<div class=\"empty-hint\">Ошибка загрузки JS: " + (e.message||e) + "</div>";
  });
})();
