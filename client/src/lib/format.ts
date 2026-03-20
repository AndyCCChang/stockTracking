export const currency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export const number = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
