const eventBus = require("@utils/eventBus");
const schemas = require("@events/schemas");
const bookingRepository = require("@modules/booking/booking.repository");
const performanceApis = require("@modules/performance/performance.api");
const logger = require("@utils/logger");
const bookingService = require("@modules/booking/booking.service");
const paymentApi = require("@modules/payment/payment.api");

/**
 * 예매 관련 이벤트 구독자 초기화
 */

const initBookingSubscribers = () => {
  // 1. 티켓 예매 요청 이벤트 구독
  eventBus.subscribe("TICKET_RESERVATION_REQUESTED", async (eventData) => {
    logger.info(
      `[BookingSubscriber] Event received: TICKET_RESERVATION_REQUESTED ${JSON.stringify(
        eventData
      )}`
    );

    const {
      bookingId,
      performanceId,
      quantity,
      userId,
      totalAmount,
      paymentMethod,
      token,
    } = eventData;

    try {
      // Performance 서비스 호출 (재고 차감)
      const reservationResponse = await performanceApis.reserveTickets(
        performanceId,
        quantity,
        token
      );
      logger.info(
        `[BookingSubscriber] Reservation response: ${JSON.stringify(
          reservationResponse
        )}`
      );

      const reservationId = reservationResponse.reservationId;
      await bookingRepository.updateBookingReservationId(
        bookingId,
        reservationId
      );

      logger.info(
        `[BookingSubscriber] Successfully reserved tickets for booking ${bookingId}`
      );

      // 예약 완료 후 결제 의향 생성 이벤트 발행
      const paymentEventData = {
        bookingId,
        userId,
        totalAmount,
        paymentMethod,
        performanceId,
        reservationId,
        token,
      };
      eventBus.publish("TICKET_RESERVATION_COMPLETED", paymentEventData);
    } catch (error) {
      logger.error(
        `[BookingSubscriber] Failed to reserve tickets for ${bookingId}: ${error.message}`
      );
      // 실패 시 보상 트랜잭션: 예매 상태 'FAILED'로 변경
      await bookingService.failBookingPayment(bookingId, token);
    }
  });

  // 2. 예매 생성 이벤트 구독 (결제 의향 생성 요청)
  eventBus.subscribe("TICKET_RESERVATION_COMPLETED", async (eventData) => {
    logger.info(
      `[BookingSubscriber] Event received: TICKET_RESERVATION_COMPLETED ${JSON.stringify(
        eventData
      )}`
    );

    const {
      bookingId,
      userId,
      totalAmount,
      paymentMethod,
      performanceId,
      reservationId,
      token,
    } = eventData;

    try {
      const paymentIntentData = {
        userId,
        bookingId,
        paymentMethod,
        amount: totalAmount,
        performanceId,
        reservationId,
      };

      logger.info(
        `[BookingSubscriber] Sending payment intent request to Payment Service: ${JSON.stringify(
          paymentIntentData
        )}`
      );

      // Payment 서비스 호출 (결제 의향 생성)
      await paymentApi.createPaymentIntent(paymentIntentData, token);

      logger.info(
        `[BookingSubscriber] Successfully created Payment Intent for booking ${bookingId}`
      );
    } catch (error) {
      logger.error(
        `[BookingSubscriber] Failed to create Payment Intent for ${bookingId}: ${error.message}`
      );
      // 실패 시 보상 트랜잭션: 예매 상태 'FAILED'로 변경
      await bookingService.failBookingPayment(bookingId, token);
    }
  });

  // 3. 예매 만료 확인 이벤트 구독
  eventBus.subscribe("BOOKING_EXPIRATION_CHECK", async (eventData) => {
    const { bookingId, token } = eventData;
    logger.info(
      `[BookingSubscriber] Event received: BOOKING_EXPIRATION_CHECK ${JSON.stringify(
        eventData
      )}`
    );
    await paymentApi.cancelPaymentIntent(bookingId, token);
    await bookingService.handleBookingExpiration(bookingId, token);
  });

  // 4. 예약 취소 요청 이벤트 구독
  eventBus.subscribe(
    "RESERVATION_CANCELLATION_REQUESTED",
    async (eventData) => {
      logger.info(
        `[BookingSubscriber] Event received: RESERVATION_CANCELLATION_REQUESTED ${JSON.stringify(
          eventData
        )}`
      );
      const { performanceId, reservationId, token } = eventData;
      try {
        await performanceApis.cancelReservation(
          performanceId,
          reservationId,
          token
        );
        logger.info(
          `[BookingSubscriber] Successfully cancelled reservation ${reservationId}`
        );
      } catch (error) {
        logger.error(
          `[BookingSubscriber] Failed to cancel reservation ${reservationId}: ${error.message}`
        );
      }
    }
  );

  // 5. 결제 성공 확정 이벤트 구독
  eventBus.subscribe("PAYMENT_SUCCESS_CONFIRMED", async (eventData) => {
    logger.info(
      `[BookingSubscriber] Event received: PAYMENT_SUCCESS_CONFIRMED ${JSON.stringify(
        eventData
      )}`
    );
    const { performanceId, reservationId, token } = eventData;
    try {
      await performanceApis.confirmReservation(
        performanceId,
        reservationId,
        token
      );
      logger.info(
        `[BookingSubscriber] Successfully confirmed reservation ${reservationId}`
      );
    } catch (error) {
      logger.error(
        `[BookingSubscriber] Failed to confirm reservation ${reservationId}: ${error.message}`
      );
    }
  });

  // 6. 결제 실패 확정 이벤트 구독
  eventBus.subscribe("PAYMENT_FAILURE_CONFIRMED", async (eventData) => {
    logger.info(
      `[BookingSubscriber] Event received: PAYMENT_FAILURE_CONFIRMED ${JSON.stringify(
        eventData
      )}`
    );
    const { performanceId, reservationId, token } = eventData;
    try {
      await performanceApis.cancelReservation(
        performanceId,
        reservationId,
        token
      );
      logger.info(
        `[BookingSubscriber] Successfully cancelled reservation ${reservationId} due to payment failure`
      );
    } catch (error) {
      logger.error(
        `[BookingSubscriber] Failed to cancel reservation ${reservationId} due to payment failure: ${error.message}`
      );
    }
  });

  /**
   * 7. 환불 요청 이벤트 구독 (PAID 상태에서 취소 시)
   * 역할: Payment 서비스에 환불 요청만 보냅니다.
   * 실제 좌석 반환 및 상태 변경은 웹훅(REFUNDED) 수신 후 처리합니다.
   */
  eventBus.subscribe("REFUND_REQUESTED", async (eventData) => {
    logger.info(
      `[BookingSubscriber] Event received: REFUND_REQUESTED ${JSON.stringify(
        eventData
      )}`
    );
    const { bookingId, token } = eventData;
    try {
      // Payment 서비스에 환불 요청 (돈 반환)
      await paymentApi.refundPayment(bookingId, token);
      logger.info(
        `[BookingSubscriber] Successfully requested payment refund for booking ${bookingId}`
      );
    } catch (error) {
      logger.error(
        `[BookingSubscriber] Failed to request refund for booking ${bookingId}: ${error.message}`
      );
      // 실패 시 재시도 로직 등이 필요할 수 있음
    }
  });

  /**
   * 7-1. 환불 완료 처리 이벤트 구독 (웹훅 수신 후 실행)
   * 역할: 좌석 반환 및 Booking 상태를 REFUNDED로 업데이트합니다.
   */
  eventBus.subscribe("REFUND_COMPLETED", async (eventData) => {
    logger.info(
      `[BookingSubscriber] Event received: REFUND_COMPLETED ${JSON.stringify(
        eventData
      )}`
    );
    const { bookingId, token } = eventData;

    try {
      const booking = await bookingRepository.getBookingById(bookingId);
      if (!booking) {
        throw new Error(
          `Booking ${bookingId} not found for refund completion.`
        );
      }

      // 1. Performance 서비스에 예약 취소 요청 (좌석 반환)
      if (booking.reservationId) {
        await performanceApis.refundReservation(
          booking.performanceId,
          booking.reservationId,
          token
        );
        logger.info(
          `[BookingSubscriber] Successfully returned seats for reservation ${booking.reservationId}`
        );
      }

      // 2. Booking 상태 업데이트 (REFUNDED)
      await bookingRepository.updateBookingStatus(bookingId, "REFUNDED");
      logger.info(
        `[BookingSubscriber] Booking ${bookingId} status updated to REFUNDED.`
      );
    } catch (error) {
      logger.error(
        `[BookingSubscriber] Failed to complete refund process for booking ${bookingId}: ${error.message}`
      );
    }
  });

  /**
   * 8. 예약 취소 요청 이벤트 구독 (PENDING -> CANCELLED)
   * 결제 전 상태에서 취소할 때 발생
   */
  eventBus.subscribe("CANCELLATION_REQUESTED", async (eventData) => {
    logger.info(
      `[BookingSubscriber] Event received: CANCELLATION_REQUESTED ${JSON.stringify(
        eventData
      )}`
    );
    const { bookingId, reservationId, token } = eventData;
    try {
      // ✨ Payment 서비스에 결제 의향 취소 요청 ✨
      // 사용자가 나중에 결제하지 못하도록 Intent 상태를 CANCELLED로 변경
      await paymentApi.cancelPaymentIntent(bookingId, token);
      logger.info(
        `[BookingSubscriber] Successfully cancelled payment intent for booking ${bookingId}`
      );

      // 2. Booking 상태 업데이트 (CANCELLED)
      await bookingRepository.updateBookingStatus(bookingId, "CANCELLED");
      logger.info(
        `[BookingSubscriber] Booking ${bookingId} status updated to CANCELLED.`
      );
    } catch (error) {
      logger.error(
        `[BookingSubscriber] Failed to update booking ${bookingId} to CANCELLED: ${error.message}`
      );
    }
  });

  // 9. 결제 성공 확정 이벤트 구독
  eventBus.subscribe("PAYMENT_SUCCESS_CONFIRMED", async (eventData) => {
    logger.info(
      `[BookingSubscriber] Event received: PAYMENT_SUCCESS_CONFIRMED ${JSON.stringify(
        eventData
      )}`
    );
    const { bookingId } = eventData;
    try {
      await bookingRepository.updateBookingStatus(bookingId, "PAID");
      logger.info(
        `[BookingSubscriber] Booking ${bookingId} status updated to PAID.`
      );
    } catch (error) {
      logger.error(
        `[BookingSubscriber] Failed to update booking ${bookingId} to PAID: ${error.message}`
      );
    }
  });

  // 10. 결제 웹훅 수신 이벤트 구독
  eventBus.subscribe("PAYMENT_WEBHOOK_RECEIVED", async (eventData) => {
    logger.info(
      `[BookingSubscriber] Event received: PAYMENT_WEBHOOK_RECEIVED ${JSON.stringify(
        eventData
      )}`
    );
    const { bookingId, status, token } = eventData;
    const booking = await bookingRepository.getBookingById(bookingId);

    if (!booking) {
      logger.error(
        `[BookingSubscriber] Booking ${bookingId} not found for webhook processing.`
      );
      return;
    }

    if (status === "SUCCESS") {
      if (booking.status === "PAID") {
        logger.info(
          `[BookingSubscriber] Booking ${bookingId} is already PAID. Skipping.`
        );
        return;
      }
      await bookingRepository.updateBookingStatus(bookingId, "PAID");
      if (booking.reservationId) {
        eventBus.publish("PAYMENT_SUCCESS_CONFIRMED", {
          bookingId: String(bookingId),
          performanceId: Number(booking.performanceId),
          reservationId: Number(booking.reservationId),
          token: String(token),
        });
      }
      logger.info(
        `[BookingSubscriber] Booking ${bookingId} confirmed as PAID.`
      );
    } else if (status === "FAILURE") {
      if (booking.status === "FAILED") {
        logger.info(
          `[BookingSubscriber] Booking ${bookingId} is already FAILED. Skipping.`
        );
        return;
      }
      await bookingRepository.updateBookingStatus(bookingId, "FAILED");
      if (booking.reservationId) {
        eventBus.publish("PAYMENT_FAILURE_CONFIRMED", {
          performanceId: Number(booking.performanceId),
          reservationId: Number(booking.reservationId),
          token: String(token),
        });
      }
      logger.info(`[BookingSubscriber] Booking ${bookingId} marked as FAILED.`);
    } else if (status === "REFUNDED") {
      if (booking.status === "REFUNDED") {
        logger.info(
          `[BookingSubscriber] Booking ${bookingId} is already REFUNDED. Skipping.`
        );
        return;
      }
      logger.info(
        `[BookingSubscriber] Webhook received REFUNDED status for booking ${bookingId}. Publishing REFUND_COMPLETED.`
      );
      eventBus.publish("REFUND_COMPLETED", {
        bookingId,
        token,
      });
    }
  });

  /**
   * BOOKING_INITIALIZED 이벤트 구독
   * - 공연 정보를 조회하여 totalAmount, seatIds를 계산하고 예매 정보를 업데이트합니다.
   * - 재고 차감을 위한 TICKET_RESERVATION_REQUESTED 이벤트를 발행합니다.
   */
  eventBus.subscribe("BOOKING_INITIALIZED", async (eventData) => {
    // 스키마 검증
    const { error } = schemas.BOOKING_INITIALIZED.validate(eventData);
    if (error) {
      logger.error(`[BookingSubscriber] Invalid event data: ${error.message}`);
      return;
    }

    const { bookingId, performanceId, quantity, token } = eventData;
    logger.info(
      `[BookingSubscriber] Received BOOKING_INITIALIZED for bookingId: ${bookingId}`
    );

    try {
      // 1. 공연 정보 조회
      const performanceData = await performanceApis.getPerformanceById(
        performanceId,
        token
      );
      const totalAmount = performanceData.price * quantity;
      const seatIds = Array.from({ length: quantity }, (_, i) => `A${i + 1}`);

      // 2. 예매 정보 업데이트
      await bookingRepository.updateBookingDetails(bookingId, {
        totalAmount,
        seatIds,
      });
      logger.info(
        `[BookingSubscriber] Updated booking details for bookingId: ${bookingId}`
      );

      // 3. 재고 차감을 위한 이벤트 발행
      const booking = await bookingRepository.getBookingById(bookingId);
      const reservationEventData = {
        bookingId: String(bookingId),
        performanceId: Number(performanceId),
        quantity,
        userId: String(booking.userId),
        paymentMethod: booking.paymentMethod,
        totalAmount,
        token: String(token),
      };
      eventBus.publish("TICKET_RESERVATION_REQUESTED", reservationEventData);
      logger.info(
        `[BookingSubscriber] Published TICKET_RESERVATION_REQUESTED for bookingId: ${bookingId}`
      );
    } catch (error) {
      logger.error(
        `[BookingSubscriber] Failed to process BOOKING_INITIALIZED for bookingId: ${bookingId}`,
        error
      );
      // 에러 발생 시 상태를 FAILED로 변경
      await bookingRepository.updateBookingStatus(bookingId, "FAILED");
    }
  });
};

module.exports = initBookingSubscribers;
