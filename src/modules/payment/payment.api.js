const paymentAxiosInstance = require("@utils/paymentAxios");
const logger = require("@utils/logger");

/**
 * 결제 정보 생성 요청 (Booking -> Payment)
 */
const createPaymentIntent = async (paymentData, token) => {
  const authToken =
    token && token.startsWith("Bearer ") ? token : `Bearer ${token}`;

  const response = await paymentAxiosInstance.post(
    "/payment/intent",
    paymentData,
    {
      headers: {
        Authorization: authToken,
      },
    }
  );
  return response;
};

/**
 * 결제 환불 요청 (Booking -> Payment)
 * PAID 상태인 예약을 환불할 때 호출
 */
const refundPayment = async (bookingId, token) => {
  const authToken =
    token && token.startsWith("Bearer ") ? token : `Bearer ${token}`;

  try {
    const response = await paymentAxiosInstance.post(
      "/payment/refund",
      { bookingId },
      {
        headers: {
          Authorization: authToken,
        },
      }
    );
    return response;
  } catch (error) {
    logger.error(
      `[PaymentApi] Failed to request refund for ${bookingId}: ${error.message}`
    );
    throw error;
  }
};

/**
 * 결제 의향 취소 요청 (Booking -> Payment)
 * PENDING 상태에서 취소할 때, 결제 서비스의 paymentIntents
 * status 상태도 취소로 바꾸기 위해 호출
 */
const cancelPaymentIntent = async (bookingId, token) => {
  const authToken =
    token && token.startsWith("Bearer ") ? token : `Bearer ${token}`;

  try {
    const response = await paymentAxiosInstance.post(
      "/payment/cancel",
      { bookingId },
      {
        headers: {
          Authorization: authToken,
        },
      }
    );
    return response;
  } catch (error) {
    logger.error(
      `[PaymentApi] Failed to cancel payment intent for ${bookingId}: ${error.message}`
    );
    throw error;
  }
};

/**
 * 결제 이벤트 상태 조회 요청 (Booking -> Payment)
 */
const getEventStatus = async (bookingId, token) => {
  try {
    const authToken =
      token && token.startsWith("Bearer ") ? token : `Bearer ${token}`;

    const response = await paymentAxiosInstance.get(
      `/payment/events/${bookingId}`,
      {
        headers: {
          Authorization: authToken,
        },
      }
    );
    return response;
  } catch (error) {
    logger.error(`[PaymentApi] Failed to get payment status: ${error.message}`);
    return null;
  }
};

module.exports = {
  createPaymentIntent,
  refundPayment,
  cancelPaymentIntent,
  getEventStatus,
};
