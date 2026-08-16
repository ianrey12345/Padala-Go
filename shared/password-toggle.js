// Padala Go — adds a show/hide (👁️) toggle button to every password
// input on the page automatically. No HTML restructuring needed per
// page: just add this script tag anywhere on a page and it finds and
// enhances every input[type="password"] itself.
(function () {
  function enhance(input) {
    if (input.dataset.pwToggleDone) return;
    input.dataset.pwToggleDone = '1';

    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.style.paddingRight = '44px';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Show password');
    btn.textContent = '👁️';
    btn.style.cssText = [
      'position:absolute', 'right:4px', 'top:50%', 'transform:translateY(-50%)',
      'background:none', 'border:none', 'cursor:pointer', 'padding:8px',
      'font-size:16px', 'line-height:1', 'color:#8A8178'
    ].join(';');

    btn.addEventListener('click', function () {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.textContent = showing ? '👁️' : '🙈';
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      input.focus();
    });

    wrap.appendChild(btn);
  }

  function run() {
    document.querySelectorAll('input[type="password"]').forEach(enhance);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
