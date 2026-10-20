const integer = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }), decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
export const format = value => value == null ? '—' : integer.format(value);
export const formatDecimal = value => value == null ? '—' : decimal.format(value);
