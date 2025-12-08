require("express-async-errors");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("@config/swagger.js");
const logger = require("morgan");
const cron = require("node-cron");
const updateBookingStatusFromEvents = require("@scheduler/updateBookingStatus");

// 라우터 파일 import
const bookingRouter = require("@routes/booking.routes");

const app = express();

// 보안 및 유틸리티 미들웨어 설정
app.use(helmet());
app.use(cors());

// Rate Limiting 설정
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // IP당 최대 요청 수
});
app.use(limiter);

// Swagger 설정 연결
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 미들웨어 설정
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 라우터 설정
app.use("/booking", bookingRouter);

// 배치 작업 초기화 (node-cron)
cron.schedule("0 0 * * *", () => updateBookingStatusFromEvents()); // 자정마다 실행

// 이벤트 버스 및 구독자 초기화
const initBookingSubscribers = require("./modules/subscribers/booking.subscriber");

// 구독자 초기화
initBookingSubscribers();

// 404 에러 핸들러
app.use((req, res, next) => {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// 최종 에러 핸들러
app.use((err, req, res, next) => {
  console.error("[FATAL ERROR]", err);
  res.status(err.status || 500).json({ error: err.message });
});

module.exports = app;
