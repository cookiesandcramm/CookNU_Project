function openPanel(name) {
  document.getElementById('panel-' + name).classList.add('open');
}
function closePanel(name) {
  document.getElementById('panel-' + name).classList.remove('open');
}
document.querySelectorAll('.panel-overlay').forEach(function(el) {
  el.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
});
document.getElementById('contactSendBtn').addEventListener('click', function() {
  var name = document.getElementById('contactName').value.trim();
  var email = document.getElementById('contactEmail').value.trim();
  var msg = document.getElementById('contactMessage').value.trim();
  if (!name || !email || !msg) { alert('Please fill in all required fields.'); return; }
  document.getElementById('contactForm').style.display = 'none';
  document.getElementById('contactSuccess').style.display = 'block';
});
document.getElementById('contactResetBtn').addEventListener('click', function() {
  document.getElementById('contactName').value = '';
  document.getElementById('contactEmail').value = '';
  document.getElementById('contactMessage').value = '';
  document.getElementById('contactSubject').value = '';
  document.getElementById('contactForm').style.display = 'block';
  document.getElementById('contactSuccess').style.display = 'none';
});
