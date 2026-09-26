const DAYS = [
  { id: 1, short: 'Seg', name: 'Segunda-feira' },
  { id: 2, short: 'Ter', name: 'Terça-feira' },
  { id: 3, short: 'Qua', name: 'Quarta-feira' },
  { id: 4, short: 'Qui', name: 'Quinta-feira' },
  { id: 5, short: 'Sex', name: 'Sexta-feira' },
  { id: 6, short: 'Sáb', name: 'Sábado' },
  { id: 7, short: 'Dom', name: 'Domingo' },
];

const INTERESTS = [
  { id: 'aula-experimental', label: 'Aula experimental' },
  { id: 'matricula', label: 'Matrícula' },
  { id: 'duvida', label: 'Dúvida' },
];

function interestLabel(id) {
  const found = INTERESTS.find((item) => item.id === id);
  return found ? found.label : id || '—';
}

function parseWeekdays(value) {
  return String(value || '')
    .split(',')
    .map((part) => Number(part))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
}

function formatWeekdays(ids) {
  return DAYS.filter((day) => ids.includes(day.id))
    .map((day) => day.short)
    .join(', ');
}

function benefitLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function presentPlan(row) {
  return {
    ...row,
    highlighted: Boolean(row.highlighted),
    active: Boolean(row.active),
    is_placeholder: Boolean(row.is_placeholder),
    benefitList: benefitLines(row.benefits),
  };
}

function presentClass(row) {
  const weekdayList = parseWeekdays(row.weekdays);
  return {
    ...row,
    weekdayList,
    weekdayLabel: formatWeekdays(weekdayList),
    active: Boolean(row.active),
    is_placeholder: Boolean(row.is_placeholder),
  };
}

function groupWeek(classes) {
  return DAYS.map((day) => ({
    ...day,
    items: classes
      .filter((item) => item.weekdayList.includes(day.id))
      .slice()
      .sort(
        (a, b) =>
          a.start_time.localeCompare(b.start_time) ||
          a.name.localeCompare(b.name, 'pt-BR')
      ),
  }));
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function starFills(rating) {
  const fills = [];
  for (let index = 0; index < 5; index += 1) {
    fills.push(Math.max(0, Math.min(1, rating - index)));
  }
  return fills;
}

function asArray(value) {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function errorList(errors) {
  if (!errors) return [];
  return Object.entries(errors).map(([field, message]) => ({ field, message }));
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return id;
}

module.exports = {
  DAYS,
  INTERESTS,
  interestLabel,
  presentPlan,
  presentClass,
  groupWeek,
  formatWhen,
  starFills,
  asArray,
  errorList,
  parseId,
  benefitLines,
};
