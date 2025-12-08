// booking.service.js
const bookingRepository = require("@modules/booking/booking.repository");
const scheduleBookingExpiration = require("@modules/booking/booking.helper");
const {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
} = require("@utils/errorHandler");
const logger = require("@utils/logger");
const eventBus = require("@utils/eventBus");

// ✨ 예매 한도 상수
const MAX_TICKETS_PER_USER = 10;

/**
 * 내부적으로 Booking 상태 업데이트를 처리
 */
const updateBookingStatus = async (bookingId, status) => {
  logger.info(
    `[BookingService] Updating status for bookingId: ${bookingId} to ${status}`
  );
  await bookingRepository.updateBookingStatus(bookingId, status);
};

/**
 * 1. 예매 생성 및 결제 의향 생성
 */
const createBooking = async (
  userId,
  performanceId,
  quantity,
  paymentMethod,
  token // 토큰 추가
) => {
  try {
    // [로깅] 시작 단계
    logger.info(
      `[createBooking] Start creating booking for userId: ${userId}, performanceId: ${performanceId}, quantity: ${quantity}, paymentMethod: ${paymentMethod}`
    );

    // 1. 기존 예매 수량 확인
    const existingTickets = await bookingRepository.getActiveTicketCount(
      userId,
      performanceId
    );
    logger.info(
      `[createBooking] Existing tickets for user: ${existingTickets}`
    );

    // 2. 예매 한도 검사
    if (existingTickets + quantity > MAX_TICKETS_PER_USER) {
      throw new ConflictError(
        `You cannot book more than ${MAX_TICKETS_PER_USER} tickets. Already booked: ${existingTickets}.`
      );
    }

    // 3. 예매 문서 생성 (초기)
    const bookingId = await bookingRepository.createBooking({
      userId,
      performanceId,
      quantity,
      paymentMethod,
    });
    logger.info(`[createBooking] Booking created with ID: ${bookingId}`);

    // 4. 예매 만료 스케줄링 시작
    scheduleBookingExpiration(bookingId, token);
    logger.info(
      `[createBooking] Expiration timer scheduled for Booking ID: ${bookingId}`
    );

    // 5. 예매 초기화 이벤트 발행
    eventBus.publish("BOOKING_INITIALIZED", {
      bookingId: String(bookingId),
      performanceId: Number(performanceId),
      quantity,
      token: String(token),
    });

    return { bookingId };
  } catch (error) {
    logger.exception("[BookingService] Failed to create booking", error);
    // createBooking 실패 시 bookingId가 없을 수 있으므로 추가적인 보상 로직은 이벤트 핸들러에서 처리
    throw error;
  }
};

/**
 * 2. 내 예매 내역 조회
 */
const getMyBookings = async (userId) => {
  return bookingRepository.getMyBookings(userId);
};

/**
 * 3. 예매 취소
 */
const cancelBooking = async (userId, bookingId, token) => {
  const booking = await bookingRepository.getBookingById(bookingId);

  if (!booking) {
    throw new NotFoundError("Booking not found.");
  }
  if (booking.userId !== userId) {
    throw new UnauthorizedError("Booking not owned by user.");
  }

  if (booking.status === "PENDING") {
    eventBus.publish("CANCELLATION_REQUESTED", {
      bookingId: String(bookingId),
      performanceId: Number(booking.performanceId),
      reservationId: booking.reservationId
        ? Number(booking.reservationId)
        : null,
      token: String(token),
    });

    return { message: "Booking cancellation process initiated." };
  }

  if (booking.status === "PAID") {
    logger.info(
      "[BookingService]",
      `Initiating refund for Booking ${bookingId}`
    );

    eventBus.publish("REFUND_REQUESTED", {
      bookingId: String(bookingId),
      userId: String(userId),
      token: String(token),
    });

    return {
      message: "Refund process initiated.",
    };
  }

  throw new BadRequestError("Booking cannot be cancelled in current status.");
};

/**
 *  결제 웹훅 처리
 */
const handlePaymentWebhook = async (authorization, bookingId, status) => {
  // 1. Authorization 헤더 검증
  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new UnauthorizedError("Authorization header is missing or invalid.");
  }
  const token = authorization.split(" ")[1];

  // 2. 필수 파라미터 검증
  if (!bookingId || !status) {
    throw new BadRequestError("bookingId and status are required.");
  }

  // 3. 이벤트 발행
  eventBus.publish("PAYMENT_WEBHOOK_RECEIVED", {
    bookingId,
    status,
    token,
  });

  logger.info(
    `[BookingService] Published PAYMENT_WEBHOOK_RECEIVED for booking ${bookingId} with status ${status}`
  );
};

/**
 * 예매 만료 처리
 */
const handleBookingExpiration = async (bookingId, token) => {
  const booking = await bookingRepository.getBookingById(bookingId);

  // 예매가 존재하지 않거나, 이미 처리된 상태(PENDING이 아님)이면 로직 종료
  if (!booking || booking.status !== "PENDING") {
    logger.info(
      `[BookingService] Expiration check for booking ${bookingId}: Status is '${
        booking?.status || "not found"
      }', no action needed.`
    );
    return;
  }

  logger.info(
    `[BookingService] Expiring booking ${bookingId} which is still PENDING.`
  );

  // 1. 상태를 'FAILED'로 변경
  await updateBookingStatus(bookingId, "FAILED");

  // 2. 외부 서비스(공연 서비스)에 예약 취소 요청
  if (booking.reservationId) {
    eventBus.publish("RESERVATION_CANCELLATION_REQUESTED", {
      performanceId: Number(booking.performanceId),
      reservationId: Number(booking.reservationId),
      token,
    });
  }

  logger.info(
    `[BookingService] Booking ${bookingId} has been marked as FAILED due to expiration.`
  );
};

module.exports = {
  createBooking,
  getMyBookings,
  cancelBooking,
  handlePaymentWebhook,
  handleBookingExpiration,
};
