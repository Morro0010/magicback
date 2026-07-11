import type { PaymentMethod } from '@prisma/client';

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

export function reservationCreatedTemplate(input: {
  customerName: string;
  folio: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  eventType: string;
  total: number;
  trackingLink: string;
}) {
  return [
    `Hola ${input.customerName}, te compartimos la información de tu reservación en Magic City.`,
    '',
    `Folio: ${input.folio}`,
    `Fecha: ${input.eventDate}`,
    `Horario: ${input.startTime} - ${input.endTime}`,
    `Tipo de evento: ${input.eventType}`,
    `Total estimado: ${formatMoney(input.total)}`,
    '',
    'Puedes revisar el estado de tu reservación aquí:',
    input.trackingLink,
    '',
    'Gracias por elegir Magic City.',
  ].join('\n');
}

export function reservationPaymentConfirmedTemplate(input: {
  customerName: string;
  folio: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  trackingLink?: string | null;
}) {
  return [
    `Hola ${input.customerName}, tu pago ha sido confirmado.`,
    '',
    'Tu reservación en Magic City quedó confirmada.',
    '',
    `Folio: ${input.folio}`,
    `Fecha: ${input.eventDate}`,
    `Horario: ${input.startTime} - ${input.endTime}`,
    ...(input.trackingLink
      ? ['', 'Puedes revisar los detalles aquí:', input.trackingLink]
      : []),
    '',
    '¡Gracias!',
  ].join('\n');
}

export function specialEventReservationCreatedTemplate(input: {
  holderName: string;
  eventName: string;
  folio: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  total?: number;
  trackingLink: string;
}) {
  return [
    `Hola ${input.holderName}, tu reserva para ${input.eventName} fue registrada correctamente.`,
    '',
    `Folio de reserva: ${input.folio}`,
    input.eventDate ? `Fecha: ${input.eventDate}` : null,
    input.startTime && input.endTime ? `Horario: ${input.startTime} - ${input.endTime}` : null,
    input.total !== undefined ? `Total a pagar: ${formatMoney(input.total)}` : null,
    '',
    'Puedes consultar tus boletos y el estado de tu reserva aquí:',
    input.trackingLink,
    '',
    'Para confirmar tu pago, realiza la transferencia por el total indicado. En el concepto de transferencia escribe el nombre del titular de la reserva y envía el comprobante por este medio para que podamos confirmarlo en el sistema.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

export function specialEventPaymentConfirmedTemplate(input: {
  holderName: string;
  eventName: string;
  folio: string;
  trackingLink?: string | null;
}) {
  return [
    `Hola ${input.holderName}, tu pago para ${input.eventName} fue confirmado.`,
    '',
    `Tu reserva ${input.folio} ya está confirmada.`,
    ...(input.trackingLink
      ? ['', 'Puedes consultar tus boletos aquí:', input.trackingLink]
      : []),
    '',
    '¡Te esperamos en Magic City!',
  ].join('\n');
}

export function posTicketTemplate(input: {
  folio: string;
  total: number;
  paymentMethod?: PaymentMethod | string;
  ticketLink?: string | null;
}) {
  return [
    'Gracias por tu compra en Magic City.',
    '',
    `Folio de venta: ${input.folio}`,
    `Total: ${formatMoney(input.total)}`,
    input.paymentMethod ? `Pago: ${input.paymentMethod}` : null,
    ...(input.ticketLink ? ['', 'Puedes consultar tu ticket aquí:', input.ticketLink] : []),
    '',
    '¡Gracias por tu visita!',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
