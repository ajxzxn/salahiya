// ?for=moaqqib shows the copy for mu'aqqibs and general service offices: the value for them is not missing a renewal
// job for a client, so the fines section is hidden. Each swapped element carries its alternative text in data-moaqqib.
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  if (params.get('for') !== 'moaqqib') return;
  document.title = 'صلاحية للمعقّبين ومكاتب الخدمات — تجربة مجانية مبكرة';
  document.querySelectorAll('[data-moaqqib]').forEach(function (el) { el.textContent = el.getAttribute('data-moaqqib'); });
  document.querySelectorAll('[data-hide-for="moaqqib"]').forEach(function (el) { el.hidden = true; });
  var seg = document.getElementById('f-seg');
  for (var i = 0; i < seg.options.length; i++) if (seg.options[i].text === 'مكتب تعقيب أو موارد بشرية') seg.selectedIndex = i;
  document.getElementById('f-audience').value = 'moaqqib';
})();
