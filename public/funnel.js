// Partner funnel counter: one request per visit and step, no personal data.
(function () {
  var send = function (step) { try { fetch('/partners/join/event?e=' + step, { keepalive: true, credentials: 'omit' }); } catch (e) {} };
  send('view');
  document.querySelectorAll('[data-funnel]').forEach(function (el) {
    el.addEventListener('click', function () { send(el.getAttribute('data-funnel')); });
  });
})();
