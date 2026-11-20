(function () {
  var form = document.getElementById('contact-form');
  if (!form) return;
  var button = document.getElementById('contact-send');
  var status = document.getElementById('contact-status');
  var busy = false;
  var requestId = crypto.randomUUID();
  button.disabled = false;
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    var name = document.getElementById('contact-name').value.trim();
    var email = document.getElementById('contact-email').value.trim();
    var idea = document.getElementById('contact-business').value.trim();
    if (!name || !email || !idea) { status.textContent = 'Please complete your name, email and business note.'; return; }
    var summary = 'Website inquiry';
    if (window.UnderstudyDiscovery) summary = window.UnderstudyDiscovery.enrichSummary(summary);
    busy = true;
    button.disabled = true;
    button.textContent = 'Sending...';
    status.textContent = 'Sending your note.';
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(form.action, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ name: name, email: email, idea: idea, summary: summary, lane: 'website-inquiry', requestId: requestId })
      });
      var result = await response.json();
      if (!response.ok || !result.ok || result.error) throw new Error('Not confirmed');
      status.textContent = 'Your note has been received. Please allow one business day for a personal reply.' + (result.reference ? ' Reference: ' + result.reference + '.' : '');
      button.textContent = 'Note received';
      form.querySelectorAll('input, textarea').forEach(function (input) { input.disabled = true; });
    } catch (error) {
      status.textContent = 'We could not confirm receipt. Please email Frank using the link below, or try again.';
      busy = false;
      button.disabled = false;
      button.textContent = 'Send the note';
    } finally { clearTimeout(timeout); }
  });
})();
