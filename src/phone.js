function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhone(input) {
  let digits = digitsOnly(input);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (!(digits.length === 10 || digits.length === 11)) return '';
  const ddd = Number(digits.slice(0, 2));
  if (!Number.isInteger(ddd) || ddd < 11 || ddd > 99) return '';
  if (digits.length === 11 && digits[2] !== '9') return '';
  return digits;
}

function normalizeWhatsapp(input) {
  const digits = normalizePhone(input);
  if (digits.length !== 11) return '';
  return digits;
}

function formatPhone(digits) {
  if (!digits) return '';
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function telHref(digits) {
  return digits ? `tel:+55${digits}` : '';
}

function whatsappHref(digits) {
  return digits ? `https://wa.me/55${digits}` : '';
}

module.exports = {
  digitsOnly,
  normalizePhone,
  normalizeWhatsapp,
  formatPhone,
  telHref,
  whatsappHref,
};
