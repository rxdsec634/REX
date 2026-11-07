/* Native scrolling, with a quiet reading-progress cue. */
(function () {
  'use strict';
  const line = document.createElement('div');
  line.className = 'reading-progress';
  line.setAttribute('aria-hidden', 'true');
  document.body.append(line);
  let queued = false;
  const update = () => {
    const length = document.documentElement.scrollHeight - innerHeight;
    line.style.transform = `scaleX(${length > 0 ? Math.min(1, scrollY / length) : 0})`;
    queued = false;
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update, { passive: true });
  update();
})();
