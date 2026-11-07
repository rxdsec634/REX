/* REX editorial site: progressive motion and purposeful interactions. */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  var nav = document.querySelector('.site-nav');
  var toggle = document.querySelector('.menu-toggle');
  var links = document.querySelector('.site-links');
  function menu(open) {
    if (!toggle || !links) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    links.classList.toggle('open', open);
  }
  if (toggle) toggle.addEventListener('click', function () { menu(toggle.getAttribute('aria-expanded') !== 'true'); });
  if (links) links.addEventListener('click', function (event) { if (event.target.closest('a')) menu(false); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') { var wasOpen = toggle && toggle.getAttribute('aria-expanded') === 'true'; menu(false); if (wasOpen) toggle.focus(); } });
  document.addEventListener('click', function (event) { if (nav && !nav.contains(event.target)) menu(false); });
  if (nav) { var scroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 10); }; window.addEventListener('scroll', scroll, { passive: true }); scroll(); }
  if (!reduced && 'IntersectionObserver' in window) {
    root.classList.add('js-motion');
    var observer = new IntersectionObserver(function (entries) { entries.forEach(function (entry) { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }); }, { threshold: .06 });
    document.querySelectorAll('[data-reveal]').forEach(function (element) { observer.observe(element); });
    // Content remains available if observers are throttled in a background tab.
    setTimeout(function () { document.querySelectorAll('[data-reveal]').forEach(function (element) { element.classList.add('is-visible'); }); observer.disconnect(); }, 4500);
  }
  document.querySelectorAll('[data-year]').forEach(function (element) { element.textContent = String(new Date().getFullYear()); });
  var ua = navigator.userAgent || '', platform = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '').toLowerCase();
  window.REX_OS = /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) || (platform.indexOf('mac') >= 0 && navigator.maxTouchPoints > 1) ? 'ios' : platform.indexOf('win') >= 0 ? 'windows' : platform.indexOf('mac') >= 0 ? 'macos' : platform.indexOf('linux') >= 0 ? 'linux' : 'windows';
  root.setAttribute('data-os', window.REX_OS);
  var tabs = Array.from(document.querySelectorAll('[data-product]'));
  function activate(tab, focus) {
    tabs.forEach(function (item) {
      var selected = item === tab;
      item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1;
      var panel = document.getElementById(item.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { activate(tab, false); });
    tab.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); activate(tabs[next], true); }
    });
  });
  // Demonstration only: no file is edited and no model request is made.
  document.querySelectorAll('.workspace-window').forEach(function (demo) {
    var approve = demo.querySelector('[data-demo-approve]');
    var status = demo.querySelector('[data-demo-status]');
    var reset = demo.querySelector('[data-demo-reset]');
    var card = demo.querySelector('.change-card');
    if (!approve || !status || !reset || !card) return;
    approve.addEventListener('click', function () { status.textContent = 'Approved — demo complete'; approve.textContent = '✓ Approved'; approve.disabled = true; card.classList.add('approved'); });
    reset.addEventListener('click', function () { status.textContent = 'Waiting for your approval'; approve.textContent = 'Approve change ↗'; approve.disabled = false; card.classList.remove('approved'); });
    status.setAttribute('aria-live', 'polite');
  });
  var toast = document.createElement('div'); toast.className = 'copy-status'; toast.setAttribute('role', 'status'); document.body.appendChild(toast);
  var toastTimer;
  function announce(text) { toast.textContent = text; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove('visible'); }, 2200); }
  function fallbackCopy(text) {
    var input = document.createElement('textarea'); input.value = text; input.setAttribute('readonly', ''); input.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(input); input.select();
    var result = document.execCommand('copy'); input.remove(); if (!result) throw new Error('Clipboard unavailable');
  }
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-copy-command], [data-copy]');
    if (!button) return;
    var text = button.getAttribute('data-copy-command') || button.getAttribute('data-copy');
    var operation = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); }) : Promise.resolve().then(function () { fallbackCopy(text); });
    operation.then(function () { announce('Copied to clipboard'); }, function () { announce('Copy unavailable. Select and copy the command.'); });
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
})();
