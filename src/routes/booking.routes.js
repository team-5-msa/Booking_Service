const express = require("express");
const router = express.Router();
const {
  createBooking,
  getMyBookings,
  cancelBooking,
  handlePaymentWebhook,
} = require("@modules/booking/booking.controller");
const authMiddleware = require("@middlewares/authMiddleware");

// 모든 예매 관련 라우트에 인증 미들웨어 적용
router.use(authMiddleware);

router.post("/", createBooking);
router.get("/my", getMyBookings);
router.delete("/my", cancelBooking);
router.post("/webhook/payment", handlePaymentWebhook);

module.exports = router;
