(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let user = null, stages = [], installers = [], materials = [], clients = [], boardData = null, currentPage = 'dashboard';
