// Philip M. Napoli: the little script the page needs. Everything reads without it: reveals only hide
// content under html.js, every book is listed, and the local news figure states its numbers in text.

const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Reveal each block once as it arrives; siblings inside a section follow one another.
(() => {
  const targets = document.querySelectorAll('[data-reveal]');
  document.querySelectorAll('.section, .measure, .record, .contact').forEach((section) => {
    section.querySelectorAll('[data-reveal]').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 6)));
  });
  const show = (el) => { el.classList.add('is-in'); el.dispatchEvent(new CustomEvent('revealed')); };
  if (!('IntersectionObserver' in window)) { targets.forEach(show); return; }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { show(entry.target); io.unobserve(entry.target); }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
  targets.forEach((el) => io.observe(el));
})();

// The fixed plate changes to the picture that belongs to the section crossing the middle of the screen.
(() => {
  if (!('IntersectionObserver' in window)) return;
  document.querySelectorAll('.split').forEach((split) => {
    const plates = [...split.querySelectorAll('.plate')];
    if (plates.length < 2) return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const name = entry.target.dataset.plate;
        plates.forEach((p) => p.classList.toggle('is-on', p.dataset.name === name));
      }
    }, { rootMargin: '-45% 0px -45% 0px' });
    split.querySelectorAll('[data-plate]').forEach((el) => io.observe(el));
  });
})();

// Highlighted work: the row under the pointer or the keyboard turns gold.
(() => {
  const items = [...document.querySelectorAll('.works li')];
  const activate = (li) => items.forEach((x) => x.classList.toggle('is-active', x === li));
  items.forEach((li) => {
    li.addEventListener('pointerenter', () => activate(li));
    li.addEventListener('focusin', () => activate(li));
  });
  const list = document.querySelector('.works');
  if (list) {
    list.addEventListener('pointerleave', () => activate(null));
    list.addEventListener('focusout', (e) => { if (!list.contains(e.relatedTarget)) activate(null); });
  }
})();

// The shelf: each spine is a tab for its book. Arrow keys move along the shelf.
(() => {
  const tabs = [...document.querySelectorAll('.spine')];
  if (!tabs.length) return;
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
  const select = (tab, focus) => {
    tabs.forEach((t, i) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
      panels[i].classList.toggle('is-showing', on);
    });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      select(tabs[(i + step + tabs.length) % tabs.length], true);
    });
  });
  select(tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0]);
  panels.forEach((p) => p.classList.remove('is-showing'));
})();
