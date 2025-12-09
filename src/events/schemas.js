const Joi = require("joi");

const eventSchemas = {
  TICKET_RESERVATION_COMPLETED: Joi.object({
    bookingId: Joi.string().required(),
    userId: Joi.string().required(),
    totalAmount: Joi.number().positive().required(),
    paymentMethod: Joi.string().required(),
    performanceId: Joi.number().required(),
    reservationId: Joi.number().required(),
    token: Joi.string().required(),
  }),
  BOOKING_EXPIRATION_CHECK: Joi.object({
    bookingId: Joi.string().required(),
    token: Joi.string().required(),
  }),
  TICKET_RESERVATION_REQUESTED: Joi.object({
    bookingId: Joi.string().required(),
    performanceId: Joi.number().required(),
    quantity: Joi.number().positive().required(),
    userId: Joi.string().required(),
    paymentMethod: Joi.string().required(),
    totalAmount: Joi.number().positive().required(),
    token: Joi.string().required(),
  }),
  RESERVATION_CANCELLATION_REQUESTED: Joi.object({
    performanceId: Joi.number().required(),
    reservationId: Joi.number().required(),
    token: Joi.string().required(),
  }),
  PAYMENT_SUCCESS_CONFIRMED: Joi.object({
    bookingId: Joi.string().required(),
    performanceId: Joi.number().required(),
    reservationId: Joi.number().required(),
    token: Joi.string().required(),
  }),
  PAYMENT_FAILURE_CONFIRMED: Joi.object({
    performanceId: Joi.number().required(),
    reservationId: Joi.number().required(),
    token: Joi.string().required(),
  }),
  REFUND_REQUESTED: Joi.object({
    bookingId: Joi.string().required(),
    userId: Joi.string().required(),
    token: Joi.string().required(),
  }),
  REFUND_COMPLETED: Joi.object({
    bookingId: Joi.string().required(),
    token: Joi.string().required(),
  }),
  PAYMENT_WEBHOOK_RECEIVED: Joi.object({
    bookingId: Joi.string().required(),
    status: Joi.string().required(),
    token: Joi.string().required(),
  }),
  BOOKING_INITIALIZED: Joi.object({
    bookingId: Joi.string().required(),
    performanceId: Joi.number().required(),
    quantity: Joi.number().required(),
    token: Joi.string().required(),
  }),
};

module.exports = eventSchemas;
