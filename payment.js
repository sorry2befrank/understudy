(function () {
  var API = 'https://three-mountaintops-engine.onrender.com';
  var KEY = 'pk_live_51TVoa9EODdnbv1UtrlCExV2P3PXRxDfwOWnTBEn2B8WZQF6xTNlBe4LRpkrOxFxsJlL3S7HsIeRDwfCNKXtJeXIB00q3Ri4MHS';
  var token = location.hash.slice(1), status = document.getElementById('payment-status');
  var start = document.getElementById('payment-start'), retry = document.getElementById('payment-retry');
  var checkout, busy = false, sdk;
  async function request(body) {
    var response = await fetch(API + '/api/understudy/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: token }, body)), signal: AbortSignal.timeout(25000), cache: 'no-store' });
    var result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'Payment service unavailable.');
    return result;
  }
  function render(result) {
    document.getElementById('payment-summary').hidden = false;
    document.getElementById('service-label').textContent = result.label;
    document.getElementById('service-amount').textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(result.amount);
    start.hidden = true; retry.hidden = true;
    if (result.status === 'paid') {
      status.textContent = 'Payment received. Thank you. Frank has a saved payment record and your receipt has been queued for email. Please do not pay again.';
      if (checkout) { checkout.destroy(); checkout = null; }
    } else if (result.status === 'processing') {
      status.textContent = 'Your payment is processing, not yet confirmed as paid. Please do not pay again. Check back here for confirmation.';
      retry.hidden = false;
      if (checkout) { checkout.destroy(); checkout = null; }
    } else {
      status.textContent = 'Review the agreed service and amount before continuing.';
      start.hidden = false;
    }
  }
  async function check() {
    if (busy) return;
    busy = true; retry.disabled = true; start.hidden = true;
    try { render(await request({ viewOnly: true })); }
    catch (error) {
      status.textContent = 'We could not confirm the payment link or its status. ' + error.message + ' If you already attempted payment, do not pay again until Frank checks it.';
      retry.hidden = false;
    } finally { busy = false; retry.disabled = false; }
  }
  function loadStripe() {
    if (window.Stripe) return Promise.resolve();
    if (sdk) return sdk;
    sdk = new Promise(function (resolve, reject) {
      var script = document.createElement('script'), timer = setTimeout(function () { reject(new Error('Secure checkout did not load.')); }, 20000);
      script.src = 'https://js.stripe.com/v3/';
      script.onload = function () { clearTimeout(timer); window.Stripe ? resolve() : reject(new Error('Secure checkout unavailable.')); };
      script.onerror = function () { clearTimeout(timer); reject(new Error('Secure checkout could not load.')); };
      document.head.appendChild(script);
    }).catch(function (error) { sdk = null; throw error; });
    return sdk;
  }
  start.addEventListener('click', async function () {
    if (busy) return;
    busy = true; start.disabled = true; retry.hidden = true;
    status.textContent = 'Loading secure payment...';
    try {
      await loadStripe();
      var result = await request({});
      render(result);
      if (result.status !== 'open') return;
      if (!result.clientSecret) throw new Error('Checkout was not confirmed.');
      start.hidden = true;
      checkout = await Stripe(KEY).initEmbeddedCheckout({ clientSecret: result.clientSecret, onComplete: function () {
        status.textContent = 'Checking payment confirmation...';
        busy = false; check();
      } });
      checkout.mount('#payment-checkout');
      status.textContent = 'Complete your payment securely below.';
    } catch (error) {
      start.hidden = true; retry.hidden = false;
      status.textContent = 'Checkout could not be confirmed. ' + error.message + ' Check status before trying payment again.';
    } finally { busy = false; start.disabled = false; }
  });
  retry.addEventListener('click', check);
  window.addEventListener('hashchange', function () { location.reload(); });
  if (!/^[a-f0-9]{64}$/.test(token)) {
    status.textContent = 'Open the personal payment link Frank sent you. Need a link? Email Frank with the agreed service. No payment has been started here.';
  } else check();
})();
