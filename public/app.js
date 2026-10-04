document.addEventListener('submit', function (e) {
  var msg = e.target.getAttribute('data-confirm');
  if (msg && !window.confirm(msg)) e.preventDefault();
});
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-copy]');
  if (!b) return;
  navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () {
    var t = b.textContent; b.textContent = 'Copied ✓'; setTimeout(function () { b.textContent = t; }, 1500);
  });
});
document.addEventListener('change', function (e) {
  if (e.target.matches('[data-autosubmit]')) e.target.form.submit();
});
// Live certificate preview: re-render the PDF into the iframe whenever the template form changes.
document.querySelectorAll('form[data-live-preview]').forEach(function (f) {
  var frame = document.getElementById(f.getAttribute('data-live-preview'));
  var timer;
  function run() {
    var action = f.action, target = f.target;
    f.action = '/portal/templates/preview'; f.target = frame.name;
    HTMLFormElement.prototype.submit.call(f);
    f.action = action; f.target = target;
  }
  f.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 400); });
  f.addEventListener('change', function () { clearTimeout(timer); timer = setTimeout(run, 400); });
  run();
});
