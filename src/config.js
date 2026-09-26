const path = require('path');

const addressFull =
  'Av. Dr. Ernani Pires Domingues, 5070 - Res. Macedo Teles I, São José do Rio Preto - SP, 15040-548';

const mapsQuery = encodeURIComponent(addressFull);

function integerPort(value, fallback) {
  if (value == null || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

const port = integerPort(process.env.PORT, 47231);

module.exports = {
  port,
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '..', 'data', 'freelife.sqlite'),
  gym: {
    name: 'Academia Free Life',
    rating: 4.8,
    ratingLabel: '4,8',
    reviewCountLabel: '276',
    city: 'São José do Rio Preto',
    state: 'SP',
    neighborhood: 'Res. Macedo Teles I',
    regionNote: 'Região Administrativa de São José do Rio Preto',
    street: 'Av. Dr. Ernani Pires Domingues, 5070',
    cep: '15040-548',
    addressFull,
  },
  maps: {
    embed: `https://maps.google.com/maps?q=${mapsQuery}&hl=pt-BR&z=16&output=embed`,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`,
    search: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Academia Free Life, ${addressFull}`)}`,
  },
};
