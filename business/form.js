// Interest form. Behaviour depends only on window.SALAHIYA_BUSINESS (config.js).
(function () {
  'use strict';
  var cfg = window.SALAHIYA_BUSINESS || {};
  var endpoint = String(cfg.FORM_ENDPOINT || '').trim();
  var email = String(cfg.SUPPORT_EMAIL || '').trim();
  var emailOk = /^[^\s@{}<>]+@[^\s@{}<>]+\.[A-Za-z]{2,}$/.test(email);

  var mode = 'soon';
  if (/^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(endpoint)) mode = 'post';
  else if (/^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/|tally\.so\/)/.test(endpoint)) mode = 'link';
  else if (endpoint) console.warn('FORM_ENDPOINT is not a supported provider; the form stays in "opens soon" mode.');

  var form = document.getElementById('interest');
  var msg = document.getElementById('f-msg');
  var btn = document.getElementById('f-submit');
  var LABELS = { business_name: 'اسم المنشأة', segment: 'النشاط', workers: 'عدد العمال', city: 'المدينة',
                 contact_method: 'طريقة التواصل', contact: 'البريد أو الرقم' };

  if (emailOk) {
    var line = document.getElementById('contact-line');
    line.textContent = 'التواصل: ';
    var a = document.createElement('a');
    a.href = 'mailto:' + email;
    a.textContent = email;
    line.appendChild(a);
  }

  if (mode === 'link') {
    form.hidden = true;
    var box = document.getElementById('link-mode');
    document.getElementById('link-btn').href = endpoint;
    box.hidden = false;
    return;
  }

  function say(text, cls) {
    msg.className = 'hint' + (cls ? ' ' + cls : '');
    msg.textContent = text;
  }

  function fields() {
    var out = {};
    Object.keys(LABELS).forEach(function (k) { out[k] = String(form.elements[k].value || '').trim(); });
    return out;
  }

  function invalid(f) {
    for (var k in LABELS) if (!f[k]) return k;
    if (f.contact_method === 'بريد إلكتروني' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contact)) return 'contact';
    if (f.contact_method !== 'بريد إلكتروني' && f.contact_method && !/^\+?[0-9\s-]{8,16}$/.test(f.contact)) return 'contact';
    return null;
  }

  function mailtoLink(f) {
    var body = Object.keys(LABELS).map(function (k) { return LABELS[k] + ': ' + f[k]; }).join('\n');
    var a = document.createElement('a');
    a.href = 'mailto:' + email + '?subject=' + encodeURIComponent('تجربة صلاحية المبكرة: ' + f.business_name) +
      '&body=' + encodeURIComponent(body);
    a.textContent = email;
    return a;
  }

  function soon(f) {
    msg.className = 'hint';
    msg.textContent = 'التسجيل يفتح قريبًا. ';
    if (emailOk) {
      msg.appendChild(document.createTextNode('وإلى ذلك الحين يسعدنا أن تراسلنا على '));
      msg.appendChild(mailtoLink(f));
      msg.appendChild(document.createTextNode('، والرسالة تُكتب فيها بياناتك جاهزة.'));
    } else {
      msg.appendChild(document.createTextNode('وسنعلن بريد التواصل في هذه الصفحة.'));
    }
  }

  form.addEventListener('input', function () { if (msg.classList.contains('err')) say(''); });

  form.elements.contact_method.addEventListener('change', function () {
    var byMail = this.value === 'بريد إلكتروني' || !this.value;
    form.elements.contact.setAttribute('inputmode', byMail ? 'email' : 'tel');
    form.elements.contact.setAttribute('autocomplete', byMail ? 'email' : 'tel');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = fields();
    var bad = invalid(f);
    if (bad) {
      say(bad === 'contact' && f.contact ? 'تأكّد من البريد أو الرقم.' : 'أكمل خانة «' + LABELS[bad] + '».', 'err');
      form.elements[bad].focus();
      return;
    }
    if (mode !== 'post') { soon(f); return; }

    btn.disabled = true;
    say('جارٍ الإرسال…');
    fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        form.reset();
        say('وصلنا طلبك، شكرًا لك. نتواصل معك قريبًا بالطريقة التي اخترتها.', 'ok');
      })
      .catch(function () {
        say('تعذّر الإرسال الآن. حاول بعد قليل' + (emailOk ? '، أو راسلنا على ' : '.'), 'err');
        if (emailOk) msg.appendChild(mailtoLink(f));
      })
      .then(function () { btn.disabled = false; });
  });
})();
