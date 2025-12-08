// src/scheduler/updateBookingStatus.js

const { db } = require("@config/firebase");
const logger = require("@utils/logger");
const paymentApi = require("@modules/payment/payment.api");

/**
 * 이벤트 기반 Booking 상태 동기화
 * Payment Service API에서 이벤트를 가져와 Booking 상태를 업데이트합니다.
 * 정합성 유지: booking과 payment 상태 일관성과 정확성 유지
 */
const updateBookingStatusFromEvents = async () => {
  logger.info("[작업 시작] Booking 상태 업데이트를 위한 이벤트 확인 중...");

  try {
    const now = new Date();
    const endTime = new Date(now.getTime() - 10 * 60 * 1000);
    const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Payment API에서 이벤트 가져오기
    const events = await paymentApi.getEventStatus(startTime, endTime, null);

    if (!events || events.length === 0) {
      logger.info("[작업 완료] 지난 24시간 동안 이벤트가 없습니다.");
      return;
    }

    // bookingId별 최신 이벤트 필터링
    const latestEvents = events.reduce((acc, event) => {
      const { bookingId, createdAt } = event;
      if (
        !acc[bookingId] ||
        new Date(acc[bookingId].createdAt) < new Date(createdAt)
      ) {
        acc[bookingId] = event;
      }
      return acc;
    }, {});

    const targetBookings = Object.values(latestEvents);
    logger.info(
      `[작업 정보] ${targetBookings.length}개의 고유 Booking을 처리 중...`
    );

    // 상태 매핑 정의
    const statusMapping = {
      PAYMENT_SUCCESS: { SUCCESS: "PAID" },
      REFUND_SUCCESS: { REFUNDED: "REFUNDED" },
      INTENT_CANCELLED: { CANCELLED: "CANCELLED" },
      PAYMENT_FAILURE: { FAILURE: "FAILED" },
    };

    // 트랜잭션 내에서 Booking 상태 업데이트
    const transactionResults = targetBookings.map(
      async ({ bookingId, eventType, finalStatus }) => {
        const desiredStatus = statusMapping[eventType]?.[finalStatus] || null;

        if (!desiredStatus) return;

        const bookingRef = db.collection("bookings").doc(bookingId);

        try {
          await db.runTransaction(async (transaction) => {
            const bookingDoc = await transaction.get(bookingRef);

            if (!bookingDoc.exists) {
              logger.warn(
                `[경고] Booking ID '${bookingId}'를 찾을 수 없습니다.`
              );
              return;
            }

            const currentStatus = bookingDoc.data().status;

            // 특정 조건에 따라 업데이트 건너뛰기
            const skipConditions = [
              currentStatus === "REFUNDED",
              currentStatus === "PAID" && desiredStatus === "FAILED",
              currentStatus === desiredStatus,
            ];

            if (skipConditions.some(Boolean)) return;

            transaction.update(bookingRef, {
              status: desiredStatus,
              updatedAt: Timestamp.now(),
            });
          });
        } catch (error) {
          logger.error(
            `[오류] Booking ${bookingId} 업데이트 실패:`,
            error.message
          );
        }
      }
    );

    await Promise.all(transactionResults);
    logger.info("[작업 완료] 상태 동기화가 완료되었습니다.");
  } catch (error) {
    logger.error("[작업 오류] Booking 상태 동기화 실패:", error);
  }
};

module.exports = updateBookingStatusFromEvents;
