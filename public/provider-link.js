// Copies the provider link shown on a provider page. Without clipboard access the link stays selectable in its field.
document.querySelectorAll('[data-copy]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var field = document.getElementById(btn.getAttribute('data-copy'));
    if (!field) return;
    field.select();
    var done = function (text) { btn.textContent = text; setTimeout(function () { btn.textContent = 'Copy Provider Link'; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(field.value).then(function () { done('Copied'); }, function () { done('Select and copy the link'); });
    } else {
      done('Select and copy the link');
    }
  });
});
