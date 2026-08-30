// Progressive enhancement only — the page is fully readable without this file.
// Scroll-reveal via IntersectionObserver; content is never hidden when JS or
// the observer is unavailable (see .no-observer fallback in style.css).
(function () {
  if (!('IntersectionObserver' in window)) return;
  document.body.classList.add('js');
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );
  document.querySelectorAll('.reveal').forEach(function (el) {
    observer.observe(el);
  });
})();
