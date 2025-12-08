const { db } = require("@config/firebase");
const { Timestamp } = require("firebase-admin").firestore;
const eventBus = require("@utils/eventBus");

/**
 * 예약 ID를 받아 10분 후 상태를 확인하고,
 * 여전히 'PENDING' 상태라면 'FAILED'로 변경합니다.
 *
 * @param {string} bookingId - 예약 문서 ID (문자열)
 * @param {string} token - 발행된 토큰
 */
const scheduleBookingExpiration = (bookingId, token) => {
  setTimeout(() => {
    // 10분 후, 예매 만료 검사 이벤트를 발행합니다.
    // 실제 로직은 Subscriber와 Service에서 처리합니다.
    eventBus.publish("BOOKING_EXPIRATION_CHECK", { bookingId, token });
  }, 10 * 60 * 1000); // 10분
};

module.exports = scheduleBookingExpiration;
