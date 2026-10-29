// Theme toggle, scroll reveals and the live GitHub star count. No build step, no dependencies.
(function () {
  var root = document.documentElement;

  document.querySelector('[data-theme-toggle]').addEventListener('click', function () {
    var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch (e) {}
  });

  // Fade sections up the first time they scroll into view
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        });
      },
      {rootMargin: '0px 0px -10% 0px'}
    );
    items.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    items.forEach(function (el) {
      el.classList.add('in');
    });
  }

  // Star count from GitHub's public API, cached per tab; the button works without it
  var target = document.querySelector('[data-stars]');
  var KEY = 'reachtoyc-stars';
  var show = function (n) {
    target.textContent = Number(n).toLocaleString();
  };
  try {
    var cached = sessionStorage.getItem(KEY);
    if (cached) return show(cached);
  } catch (e) {}
  fetch('https://api.github.com/repos/Shobhnik13/reachtoyc')
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (j) {
      if (!j || typeof j.stargazers_count !== 'number') return;
      show(j.stargazers_count);
      try {
        sessionStorage.setItem(KEY, String(j.stargazers_count));
      } catch (e) {}
    })
    .catch(function () {});
})();
