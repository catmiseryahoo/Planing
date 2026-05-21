export const getPhoneDigits = (value = '') => String(value).replace(/\D/g, '');

export const formatPhone = (value = '') => {
  let digits = getPhoneDigits(value).slice(0, 11);
  if (!digits) return '';
  if (digits[0] === '8') digits = `7${digits.slice(1)}`;
  if (digits[0] !== '7') digits = `7${digits}`;
  digits = digits.slice(0, 11);

  let formatted = '+7';
  if (digits.length > 1) formatted += ` (${digits.slice(1, 4)}`;
  if (digits.length >= 4) formatted += ')';
  if (digits.length >= 5) formatted += ` ${digits.slice(4, 7)}`;
  if (digits.length >= 8) formatted += `-${digits.slice(7, 9)}`;
  if (digits.length >= 10) formatted += `-${digits.slice(9, 11)}`;
  return formatted;
};

export const isCompletePhone = (value = '') => {
  const digits = getPhoneDigits(value);
  return !digits || digits.length === 11;
};
