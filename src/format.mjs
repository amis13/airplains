const integer = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }), decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
export const format = value => value == null ? '—' : integer.format(value);
export const formatDecimal = value => value == null ? '—' : decimal.format(value);
// Las escalas con paso 2,5 necesitan dos decimales (1,25) para no mostrar valores falsos.
const axis = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
export const formatAxis = value => axis.format(value);
